/***************************************************************************
 * MarketScannerBridge.cpp — ACSIL study: forwards the chart's live
 * Time & Sales (trades + quotes) and top-of-book depth to the Market
 * Scanner app over plain TCP as newline-delimited JSON.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Sierra DTC Protocol *server* refuses to stream CME Group data
 * ("Market data request not allowed" — an exchange restriction Sierra
 * support confirms cannot be lifted for DTC redistribution). A custom
 * study runs *inside* Sierra Chart and sees everything your Denali feed
 * delivers, so it forwards ticks for the chart it sits on.
 *
 * SETUP (on the Windows host running Sierra Chart)
 * ------------------------------------------------
 * 1. Copy this file into Sierra's ACS_Source folder.
 * 2. Sierra menu: Analysis >> Build Custom Studies DLL. Wait for success.
 * 3. Open a chart for the product you want (e.g. ESZ26-CME), then
 *    Analysis >> Studies >> Add "Market Scanner Bridge".
 * 4. Study Settings: set "Scanner host" to the machine running the
 *    scanner (the Linux VM is 10.0.2.15 from the host), "Scanner port"
 *    to match ACSIL_PORT (default 18199), keep Enabled = Yes.
 * 5. One chart per product: ES chart streams ES, corn chart streams corn.
 *    The scanner demultiplexes by the symbol field in each message.
 *
 * WIRE PROTOCOL (UTF-8 JSON, one object per line, study -> scanner)
 * -----------------------------------------------------------------
 * {"t":"hello","sym":"ESZ26-CME"}
 * {"t":"trade","sym":"ESZ26-CME","ts":1758784800123,"price":6642.5,"size":3}
 * {"t":"quote","sym":"ESZ26-CME","ts":1758784800124,"bid":6642.25,"ask":6642.5,"bidSize":12,"askSize":9}
 * {"t":"depth","sym":"ESZ26-CME","ts":1758784800125,"bids":[[6642.25,12],...],"asks":[[6642.5,9],...]}
 * ts = Sierra local time as Unix millis. Missing quote fields are omitted.
 *
 * Only documented ACSIL members are used (Time & Sales, market depth,
 * persistent ints, string/int/yes-no inputs) so this tracks the public
 * interface, not Sierra internals.
 ***************************************************************************/

#include <winsock2.h>
#include <ws2tcpip.h>

#include "sierrachart.h"

#include <cstdio>
#include <ctime>
#include <mutex>
#include <string>

#pragma comment(lib, "Ws2_32.lib")

SCDLLName("Market Scanner Bridge")

namespace
{
    // SCDateTime (days since 1899-12-30) -> Unix millis.
    const double SC_EPOCH_DAY_OFFSET = 25569.0;

    // Persistent-variable slots (per chart instance, survive study calls).
    const int PERSIST_TS_CURSOR = 77;
    const int PERSIST_BEST_BID_TICKS = 78;
    const int PERSIST_BEST_ASK_TICKS = 79;
    const int PERSIST_BEST_BID_QTY = 80;
    const int PERSIST_BEST_ASK_QTY = 81;

    const int MAX_DEPTH_LEVELS = 20;

    SOCKET g_Socket = INVALID_SOCKET;
    bool g_WSAStarted = false;
    std::mutex g_SocketMutex;
    std::time_t g_LastConnectAttempt = 0;

    long long SCDateTimeToUnixMillis(SCDateTime dt)
    {
        return static_cast<long long>((static_cast<double>(dt) - SC_EPOCH_DAY_OFFSET) * 86400000.0);
    }

    void CloseBridge(const char* reason, SCStudyInterfaceRef sc)
    {
        if (g_Socket != INVALID_SOCKET)
        {
            closesocket(g_Socket);
            g_Socket = INVALID_SOCKET;
        }
        if (reason != nullptr)
        {
            SCString msg;
            msg.Format("Market Scanner Bridge: disconnected (%s). Will retry.", reason);
            sc.AddMessageToLog(msg, 1);
        }
    }

    bool EnsureConnected(const char* host, int port, SCStudyInterfaceRef sc)
    {
        std::lock_guard<std::mutex> lock(g_SocketMutex);
        if (g_Socket != INVALID_SOCKET)
            return true;

        std::time_t now = std::time(nullptr);
        if (now - g_LastConnectAttempt < 5)
            return false;  // do not hammer reconnects on every chart update
        g_LastConnectAttempt = now;

        if (!g_WSAStarted)
        {
            WSADATA wsa;
            if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0)
                return false;
            g_WSAStarted = true;
        }

        SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (s == INVALID_SOCKET)
            return false;

        // Non-blocking connect with a 2s cap so the chart thread never hangs.
        u_long nonBlocking = 1;
        ioctlsocket(s, FIONBIO, &nonBlocking);

        sockaddr_in addr;
        addr.sin_family = AF_INET;
        addr.sin_port = htons(static_cast<u_short>(port));
        if (inet_pton(AF_INET, host, &addr.sin_addr) != 1)
        {
            // Fall back to DNS for hostnames.
            addrinfo* info = nullptr;
            if (getaddrinfo(host, nullptr, nullptr, &info) != 0 || info == nullptr)
            {
                closesocket(s);
                return false;
            }
            addr.sin_addr = reinterpret_cast<sockaddr_in*>(info->ai_addr)->sin_addr;
            freeaddrinfo(info);
        }

        int rc = connect(s, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));
        if (rc != 0 && WSAGetLastError() != WSAEWOULDBLOCK)
        {
            closesocket(s);
            return false;
        }

        fd_set writeSet;
        FD_ZERO(&writeSet);
        FD_SET(s, &writeSet);
        timeval timeout;
        timeout.tv_sec = 2;
        timeout.tv_usec = 0;
        if (select(0, nullptr, &writeSet, nullptr, &timeout) != 1)
        {
            closesocket(s);
            return false;
        }
        int optError = 0;
        int optLen = sizeof(optError);
        getsockopt(s, SOL_SOCKET, SO_ERROR, reinterpret_cast<char*>(&optError), &optLen);
        if (optError != 0)
        {
            closesocket(s);
            return false;
        }

        nonBlocking = 0;
        ioctlsocket(s, FIONBIO, &nonBlocking);
        DWORD sendTimeoutMs = 5000;
        setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, reinterpret_cast<const char*>(&sendTimeoutMs), sizeof(sendTimeoutMs));

        g_Socket = s;

        SCString msg;
        msg.Format("Market Scanner Bridge: connected to %s:%d.", host, port);
        sc.AddMessageToLog(msg, 0);
        return true;
    }

    bool SendAll(const char* data, int length)
    {
        std::lock_guard<std::mutex> lock(g_SocketMutex);
        if (g_Socket == INVALID_SOCKET)
            return false;
        int sent = 0;
        while (sent < length)
        {
            int n = send(g_Socket, data + sent, length - sent, 0);
            if (n == SOCKET_ERROR)
                return false;
            sent += n;
        }
        return true;
    }
}  // namespace

SCSFExport scsf_MarketScannerBridge(SCStudyInterfaceRef sc)
{
    SCInputRef InputHost = sc.Input[0];
    SCInputRef InputPort = sc.Input[1];
    SCInputRef InputDepthLevels = sc.Input[2];
    SCInputRef InputEnabled = sc.Input[3];

    if (sc.SetDefaults)
    {
        sc.GraphName = "Market Scanner Bridge (ACSIL->TCP)";
        sc.GraphShortName = "SCBridge";
        sc.GraphRegion = 0;
        sc.AutoLoop = 1;
        // Run on quote updates too, not just trades/new bars.
        sc.UpdateAlways = 1;
        // Depth getters require this flag.
        sc.UsesMarketDepthData = 1;

        InputHost.Name = "Scanner host (VM IP from host)";
        InputHost.SetString("10.0.2.15");
        InputPort.Name = "Scanner port (ACSIL_PORT)";
        InputPort.SetInt(18199);
        InputDepthLevels.Name = "Depth levels to forward (max 20)";
        InputDepthLevels.SetInt(10);
        InputEnabled.Name = "Enabled";
        InputEnabled.SetYesNo(1);
        return;
    }

    if (!InputEnabled.GetYesNo())
    {
        std::lock_guard<std::mutex> lock(g_SocketMutex);
        if (g_Socket != INVALID_SOCKET)
        {
            closesocket(g_Socket);
            g_Socket = INVALID_SOCKET;
        }
        return;
    }

    SCString hostStr = InputHost.GetString();
    const char* host = hostStr.GetChars();
    int port = InputPort.GetInt();
    int depthLevels = InputDepthLevels.GetInt();
    if (depthLevels < 1)
        depthLevels = 1;
    if (depthLevels > MAX_DEPTH_LEVELS)
        depthLevels = MAX_DEPTH_LEVELS;

    const char* symbol = sc.Symbol.GetChars();

    if (!EnsureConnected(host, port, sc))
        return;

    char line[4096];

    // --- Time & Sales: new entries since the last call (per-chart cursor).
    SCTimeAndSalesArray timeSales;
    sc.GetTimeAndSales(timeSales);
    int total = timeSales.Size();
    int cursor = sc.GetPersistentInt(PERSIST_TS_CURSOR);
    if (cursor > total)
    {
        // Array reset (reload/reconnect): drop the backlog, do not burst
        // stale ticks as if they were live.
        cursor = total;
    }
    double priceMult = sc.RealTimePriceMultiplier;
    double volMult = static_cast<double>(sc.MultiplierFromVolumeValueFormat());

    for (int i = cursor; i < total; ++i)
    {
        long long ts = SCDateTimeToUnixMillis(timeSales[i].DateTime);
        int len = 0;

        if (timeSales[i].Type == SC_TS_BIDASKVALUES)
        {
            len = snprintf(line, sizeof(line),
                "{\"t\":\"quote\",\"sym\":\"%s\",\"ts\":%lld,"
                "\"bid\":%.10g,\"ask\":%.10g,\"bidSize\":%.10g,\"askSize\":%.10g}\n",
                symbol, ts,
                static_cast<double>(timeSales[i].Bid) * priceMult,
                static_cast<double>(timeSales[i].Ask) * priceMult,
                static_cast<double>(timeSales[i].BidSize) * volMult,
                static_cast<double>(timeSales[i].AskSize) * volMult);
        }
        else if (timeSales[i].Type == SC_TS_BID)
        {
            len = snprintf(line, sizeof(line),
                "{\"t\":\"quote\",\"sym\":\"%s\",\"ts\":%lld,\"bid\":%.10g}\n",
                symbol, ts, static_cast<double>(timeSales[i].Price) * priceMult);
        }
        else if (timeSales[i].Type == SC_TS_ASK)
        {
            len = snprintf(line, sizeof(line),
                "{\"t\":\"quote\",\"sym\":\"%s\",\"ts\":%lld,\"ask\":%.10g}\n",
                symbol, ts, static_cast<double>(timeSales[i].Price) * priceMult);
        }
        else
        {
            // Anything else with size is a trade print.
            double size = static_cast<double>(timeSales[i].Volume) * volMult;
            if (size <= 0.0)
                continue;
            len = snprintf(line, sizeof(line),
                "{\"t\":\"trade\",\"sym\":\"%s\",\"ts\":%lld,\"price\":%.10g,\"size\":%.10g}\n",
                symbol, ts,
                static_cast<double>(timeSales[i].Price) * priceMult, size);
        }

        if (len <= 0 || len >= static_cast<int>(sizeof(line)))
            continue;
        if (!SendAll(line, len))
        {
            CloseBridge("send failed", sc);
            return;
        }
    }
    sc.SetPersistentInt(PERSIST_TS_CURSOR, total);

    // --- Depth: forward top N when the best bid/ask changed.
    int bidLevels = sc.GetBidMarketDepthNumberOfLevels();
    int askLevels = sc.GetAskMarketDepthNumberOfLevels();
    if (bidLevels > 0 && askLevels > 0)
    {
        s_MarketDepthEntry bestBid;
        s_MarketDepthEntry bestAsk;
        if (sc.GetBidMarketDepthEntryAtLevel(bestBid, 0) == 1 &&
            sc.GetAskMarketDepthEntryAtLevel(bestAsk, 0) == 1)
        {
            double tickSize = sc.TickSize != 0.0 ? sc.TickSize : 1.0;
            int bidTicks = static_cast<int>(bestBid.Price / tickSize + 0.5);
            int askTicks = static_cast<int>(bestAsk.Price / tickSize + 0.5);
            int bidQty = static_cast<int>(bestBid.Quantity + 0.5f);
            int askQty = static_cast<int>(bestAsk.Quantity + 0.5f);

            if (bidTicks != sc.GetPersistentInt(PERSIST_BEST_BID_TICKS) ||
                askTicks != sc.GetPersistentInt(PERSIST_BEST_ASK_TICKS) ||
                bidQty != sc.GetPersistentInt(PERSIST_BEST_BID_QTY) ||
                askQty != sc.GetPersistentInt(PERSIST_BEST_ASK_QTY))
            {
                std::string bids = "\"bids\":[";
                std::string asks = "\"asks\":[";
                char level[96];
                int take = depthLevels;
                if (take > bidLevels)
                    take = bidLevels;
                if (take > askLevels)
                    take = askLevels;
                for (int levelIndex = 0; levelIndex < take; ++levelIndex)
                {
                    s_MarketDepthEntry bidEntry;
                    s_MarketDepthEntry askEntry;
                    if (sc.GetBidMarketDepthEntryAtLevel(bidEntry, levelIndex) != 1)
                        break;
                    if (sc.GetAskMarketDepthEntryAtLevel(askEntry, levelIndex) != 1)
                        break;
                    snprintf(level, sizeof(level), "%s[%.10g,%.10g]",
                        levelIndex == 0 ? "" : ",",
                        static_cast<double>(bidEntry.Price) * priceMult,
                        static_cast<double>(bidEntry.Quantity) * volMult);
                    bids += level;
                    snprintf(level, sizeof(level), "%s[%.10g,%.10g]",
                        levelIndex == 0 ? "" : ",",
                        static_cast<double>(askEntry.Price) * priceMult,
                        static_cast<double>(askEntry.Quantity) * volMult);
                    asks += level;
                }
                bids += "]";
                asks += "]";

                int len = snprintf(line, sizeof(line),
                    "{\"t\":\"depth\",\"sym\":\"%s\",\"ts\":%lld,%s,%s}\n",
                    symbol, SCDateTimeToUnixMillis(sc.CurrentSystemDateTime),
                    bids.c_str(), asks.c_str());
                if (len > 0 && len < static_cast<int>(sizeof(line)) && SendAll(line, len))
                {
                    sc.SetPersistentInt(PERSIST_BEST_BID_TICKS, bidTicks);
                    sc.SetPersistentInt(PERSIST_BEST_ASK_TICKS, askTicks);
                    sc.SetPersistentInt(PERSIST_BEST_BID_QTY, bidQty);
                    sc.SetPersistentInt(PERSIST_BEST_ASK_QTY, askQty);
                }
                else if (len <= 0 || len >= static_cast<int>(sizeof(line)))
                {
                    // Depth line did not fit; skip this update, keep old cache.
                }
                else
                {
                    CloseBridge("send failed", sc);
                    return;
                }
            }
        }
    }
}
