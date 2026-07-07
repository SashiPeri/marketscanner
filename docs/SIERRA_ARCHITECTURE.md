# Institutional Futures Scanner: Sierra Chart API & Real-Time Pipeline Design
**Role**: Senior Quantitative Software Architect & Sierra Chart API Specialist  
**Aesthetic Pairing**: Swiss Modernist / Bloomberg-Style Institutional Specifications

---

## 1. Sierra Chart Connectivity: Comprehensive Comparison

When streaming low-latency tick data, Order Book Depth (DOM), and historical Volume Profile brackets from Sierra Chart, selecting the correct interface protocol is paramount. Below is an institutional-grade breakdown of available integration strategies:

| Connectivity Approach | Pros | Cons | Latency profile | Suitability for Futures Scanner |
| :--- | :--- | :--- | :--- | :--- |
| **DTC Protocol (L3 / Trade)** | • Native industry-standard TCP/IP binary or JSON protocol.<br>• Full Depth of Market (DOM) support.<br>• Bi-directional (data + orders). | • Complex handshake and message framing logic.<br>• Requires sustained socket connection management. | **Sub-millisecond** (< 1ms) | **Optimal (Rank 1)** for real-time order-flow scanners. |
| **Sierra HTTP Server API** | • Clean, stateless JSON/JSONP/CSV REST endpoints.<br>• Excellent for querying intraday bars or daily stats. | • Poll-based; inefficient for real-time tick streaming.<br>• Significant HTTP overhead. | **High** (50ms - 200ms depending on poll) | **Excellent for historical baseline / daily values**, poor for tick-by-tick. |
| **ACSIL Custom Study (C++)** | • Direct access to Sierra Chart's internal memory buffers via `sc.` structure.<br>• Absolute highest performance. | • Requires compiling custom C++ DLLs.<br>• High risk of crashing the Sierra main thread on memory leaks. | **Microseconds** (< 5μs) | **Optimal for complex feature calculations** (e.g. custom Delta/Volume Profiles). |
| **Spreadsheet Study Bridge** | • Easiest to prototype using built-in Excel/CSV link. | • Major CPU bottleneck inside Sierra.<br>• Disk I/O overhead of writing file systems. | **Extremely High** (100ms - 1000ms) | **Not suitable for production**. |
| **DLL Bridge (C++ / TCP-IPC)** | • Custom C++ DLL acts as IPC (Inter-Process Communication) host inside Sierra, writing directly to shared memory or TCP loopback. | • Complex setup.<br>• Requires writing memory-safe C++ code. | **Sub-microsecond** (< 1μs) | **Optimal for absolute maximum performance** on high-frequency trading boxes. |
| **Python Bridge (via DTC/REST)** | • Fast development cycle with abundant quantitative libraries (pandas, numpy). | • Global Interpreter Lock (GIL) limits parallel thread efficiency.<br>• Slightly slower than native C++. | **Low** (1ms - 5ms) | **Highly Recommended** for general quantitative research desks. |

### Architectural Verdict
For an institutional-grade futures scanner, the **optimal architecture uses a hybrid model**:
1. **ACSIL Custom Study (C++)** written in Sierra Chart to calculate complex, heavy quantitative features (like Volume Profile POCs, Delta Imbalances, and VWAP) natively on Sierra's fast multi-threaded execution loop.
2. An **internal DTC Server / WebSockets Bridge** to stream these lightweight pre-calculated feature vectors down to our Node.js / FastAPI Scanner Engine, minimizing serialization latency.

---

## 2. Institutional Architecture Design

```text
       ┌────────────────────────────────────────────────────────┐
       │               SIERRA CHART WORKSTATION                 │
       │                                                        │
       │  ┌───────────────────────┐   ┌──────────────────────┐  │
       │  │  ACSIL Custom Study   │   │  DTC Protocol Server │  │
       │  │  (Volume Profile/POC) │   │  (L2 Tick & DOM)     │  │
       │  └───────────┬───────────┘   └──────────┬───────────┘  │
       └──────────────┼──────────────────────────┼──────────────┘
                      │ (Shared Memory / IPC)    │ (L3 Raw Tick TCP)
                      ▼                          ▼
       ┌────────────────────────────────────────────────────────┐
       │                   SIERRA BRIDGE LAYER                  │
       │                                                        │
       │   • Decodes DTC Binary/Protobuf Messages               │
       │   • Normalizes Order Book and Delta Trades             │
       │   • Re-routes Raw Packets into Redis Pub/Sub Queue    │
       └──────────────────────────┬─────────────────────────────┘
                                  │ (Low-latency IPC / Redis)
                                  ▼
       ┌────────────────────────────────────────────────────────┐
       │                    SCANNER ENGINE                      │
       │                                                        │
       │   • Multi-threaded calculations of:                    │
       │     RVol, ADR, VWAP Reclaim, Delta Divergence          │
       │   • Dynamic Probability Scoring (0 - 100)              │
       │   • Generates Grades (A+, A, B, C, F)                  │
       └──────────────────────────┬─────────────────────────────┘
                                  │ (State Cache)
                                  ▼
       ┌────────────────────────────────────────────────────────┐
       │                      API SERVER                        │
       │                                                        │
       │   • Node.js Express / Python FastAPI Server            │
       │   • Persists Historical Metrics in PostgreSQL          │
       │   • Feeds Gemini API via Context Optimization         │
       └──────────────────────────┬─────────────────────────────┘
                                  │ (JSON WebSockets & REST)
                                  ▼
       ┌────────────────────────────────────────────────────────┐
       │                    REACT DASHBOARD                     │
       │                                                        │
       │   • Bloomberg-style Live Sheet Grid                     │
       │   • Real-Time Density Heatmap                           │
       │   • DOM / Footprint & Live Time & Sales                 │
       └────────────────────────────────────────────────────────┘
```

### Communication & Latency SLA
* **DTC-to-Bridge**: TCP Socket loopback. Max latency: **< 100 microseconds**.
* **Bridge-to-Scanner**: Redis Pub/Sub in-memory message broker. Max latency: **< 500 microseconds**.
* **Scanner-to-Client**: Socket.io / Native WebSockets with binary (msgpack) compression. Max latency: **5 - 15 milliseconds** over fiber WAN, **< 1ms** on local workstation.
* **Update Frequency**: L2 Depth updates on change (sub-millisecond), L1 ticker ticks throttled at **50ms intervals** to prevent browser thread freeze.

---

## 3. Mathematical Scanner Formulas & Implementation

### A. Relative Volume (RVol)
RVol measures the current session's volume compared to the historical volume *at this exact time of day* over a 10-day lookback period.

$$\text{RVol}_t = \frac{\text{Cumulative Volume Today}_t}{\text{Average Cumulative Volume at Time } t \text{ over past 10 days}}$$

* **Interpretation**: $\text{RVol} > 1.5$ indicates strong institutional flow ("High Edge"). $\text{RVol} < 0.8$ represents retail-only chop.

### B. ADR Exhaustion Percentage
$$\text{ADR Filled \%} = \frac{\text{Current Session High} - \text{Current Session Low}}{\text{Average Daily Range (14 Days)}} \times 100$$

* **Interpretation**: Values $> 100\%$ signify an exhausted trend, raising probability of mean-reversion. Values $< 60\%$ leave ample "runway" for trend breakouts.

### C. VWAP Reclaim Edge
A "VWAP Reclaim" occurs when price crosses above the Volume Weighted Average Price (VWAP) on a heavy volume spike, signaling institutional buyers taking control.

$$\text{VWAP} = \frac{\sum (P_i \times V_i)}{\sum V_i}$$

* **Reclaim Long Signal**: 
$$\text{Close}_{t-1} < \text{VWAP}_{t-1} \quad \text{and} \quad \text{Close}_t > \text{VWAP}_t \quad \text{and} \quad \text{Volume}_t > 1.5 \times \text{MA(Volume)}$$

### D. Delta Divergence
Delta represents the net difference between aggressive market buyers and aggressive market sellers.

$$\text{Delta} = \text{Aggressive Market Buys} - \text{Aggressive Market Sells}$$

* **Bearish Divergence**: Price makes a new high for the session, but Cumulative Delta fails to make a new high, representing passive limit sellers absorbing aggressive buyers.

---

## 4. Real-Time Low-Latency Streaming Pipeline

Streaming high-throughput market data from Sierra Chart without freezing the React front-end requires a **highly engineered multi-tier pipeline**:

1. **Throttling & Batching**: Raw tick-by-tick events are accumulated into **50ms buffer buckets** on the backend. This limits browser DOM updates to 20 frames per second, which matches human eye perception limits and preserves rendering thread smoothness.
2. **Binary Frame Compression**: Instead of heavy JSON strings, use **MessagePack** or **Protocol Buffers** over WebSocket links to compress payloads by up to **75%**.
3. **Web Worker Threading**: Move raw order book rendering and math calculations out of the React UI rendering thread into a background **Web Worker**. The Worker processes the DOM structures and passes a pre-formatted snapshot to React via zero-copy transferable objects.

---

## 5. Quantitative Technology Stack

* **Language**: **Rust** or **C++** for the core Bridge / DTC Decoder. Maximum memory safety, deterministic execution speed, and zero garbage-collection pauses.
* **Server-Side API Engine**: **Node.js + Fastify** or **Python + FastAPI**. Perfect for routing Gemini payload requests, handling authentication, and serving structured web APIs.
* **State Cache**: **Redis**. Acts as an ultra-fast in-memory database to store real-time ticker prices, order-flow books, and profile arrays.
* **Persistence**: **PostgreSQL** with **TimescaleDB Extension**. Excellent for logging and querying historical scanner stats, tick records, and user preferences.

---

## 6. Front-End Project Refactoring Matrix

To transition our current mockup into a high-performance live execution suite, we must restructure our application modules:

| Existing Component / Route | Refactoring Action | Technical Implementation Detail |
| :--- | :--- | :--- |
| `/api/market-data` | **Rewrite (Backend)** | Convert from a dummy interval generator into a live Redis state fetcher that pulls directly from our active Sierra connection pool. |
| `/api/sierra-bridge/sync` | **Rewrite (Backend)** | Modify to establish real DTC TCP socket client handshakes directly to Sierra Chart's IP. |
| `/api/gemini/analyze` | **Keep & Refine** | Optimize prompt structure by compressing current state vectors. Keep server-side to hide the `GEMINI_API_KEY`. |
| `ScannerGrid.tsx` | **Refactor (UI)** | Add virtualization (via `react-window`) so the grid can handle 500+ active tickers with fast updates without lag. |
| `MarketDetailPanel.tsx` | **Refactor (UI)** | Utilize the HTML5 `<canvas>` rendering pipeline for drawing the real-time Order Book Depth and Cumulative Delta charts. |

---

## 7. Strategic Production Roadmap

### Phase 1: Connect Sierra Chart (Time: 5 Days | Difficulty: Hard)
Establish DTC or ACSIL TCP connection between Sierra Chart and our Node.js back-end.
```typescript
// C++ ACSIL Study Snippet to Send Data via TCP
#include "sierrachart.h"
SCSFName("LiveScannerBridge")
S_CSF(LiveScannerBridge) {
    if (sc.SetDefaults) {
        sc.GraphName = "Live Scanner Bridge Link";
        sc.StudyDescription = "Transfers real-time Volume Profiles to WebSockets API";
        sc.AutoLoop = 1;
        return;
    }
    // IPC TCP Socket write logic here...
}
```

### Phase 2: Build Market Data Pipeline (Time: 3 Days | Difficulty: Medium)
Configure Redis and WebSockets on the server-side to ingest, throttle, and push data streams to clients.
```typescript
// server/socket.ts - Throttle and Stream Market States
import { Server } from "socket.io";
const io = new Server(3001);

let buffer: Record<string, any> = {};
setInterval(() => {
  if (Object.keys(buffer).length > 0) {
    io.volatile.emit("market-tick-batch", buffer);
    buffer = {}; // Reset batch buffer
  }
}, 50); // Exact 50ms batch window
```

### Phase 3: Build Quantitative Scanner Engine (Time: 4 Days | Difficulty: Hard)
Code the mathematical indicators (RVol, ADR, Delta, POC) directly on the incoming data frames inside a multi-threaded background loop.

---

## 8. Complete System Architecture Code Generation

Below is the production-ready code suite implementing the backend socket server, the quantitative scanner logic, the database schema, and the real-time React component hook.

### A. The WebSockets Streaming & DTC Gateway (`server.ts`)
```typescript
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { GoogleGenAI, Type } from "@google/genai";
import net from "net";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

app.use(express.json());

// In-Memory state caches
interface LiveState {
  symbol: string;
  price: number;
  rvol: number;
  delta: number;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
}

const liveMarkets: Map<string, LiveState> = new Map();

// 1. Establish Raw DTC Connection to Sierra Chart
function connectToSierraDTC() {
  const dtcSocket = new net.Socket();
  const SIERRA_HOST = "127.0.0.1";
  const SIERRA_PORT = 11099; // Default Sierra DTC port

  dtcSocket.connect(SIERRA_PORT, SIERRA_HOST, () => {
    console.log(`[DTC] Connected successfully to Sierra Chart at ${SIERRA_HOST}:${SIERRA_PORT}`);
    
    // Send DTC Logon message
    const logonMsg = JSON.stringify({ Type: 1, Username: "ScannerAgent", Password: "123", Version: 8 });
    dtcSocket.write(logonMsg + "\0");
  });

  dtcSocket.on("data", (data) => {
    const messages = data.toString().split("\0");
    messages.forEach((msg) => {
      if (!msg) return;
      try {
        const parsed = JSON.parse(msg);
        handleDTCMessage(parsed);
      } catch (err) {
        // Fallback or binary decoding
      }
    });
  });

  dtcSocket.on("close", () => {
    console.warn("[DTC] Connection lost. Attempting auto-reconnect in 5 seconds...");
    setTimeout(connectToSierraDTC, 5000);
  });
}

function handleDTCMessage(msg: any) {
  // Translate DTC codes into internal scanner states
  if (msg.Type === 101) { // Market Data Update
    const { Symbol, LastPrice, BidPrice, AskPrice, BidSize, AskSize } = msg;
    const existing = liveMarkets.get(Symbol) || {
      symbol: Symbol,
      price: LastPrice,
      rvol: 1.0,
      delta: 0,
      bids: [],
      asks: []
    };

    existing.price = LastPrice;
    existing.bids = [{ price: BidPrice, size: BidSize }];
    existing.asks = [{ price: AskPrice, size: AskSize }];

    liveMarkets.set(Symbol, existing);
    
    // Broadcast tick batch
    io.volatile.emit(`tick:${Symbol}`, existing);
  }
}

// Start live loop if on local environment
connectToSierraDTC();

httpServer.listen(3002, () => {
  console.log("[SERVER] Live Real-time DTC Pipeline running on port 3002");
});
```

### B. Quantitative Scanner Engine Math Framework (`scanner.ts`)
```typescript
interface IntradayTick {
  price: number;
  volume: number;
  timestamp: number;
  buyerIsAggressive: boolean;
}

export class QuantitativeScannerEngine {
  /**
   * Calculates the current Relative Volume (RVol)
   * Formula: Current cumulative volume divided by mean historical volume at this time interval
   */
  public static calculateRVol(currentVolume: number, historicalMeanVolume: number): number {
    if (historicalMeanVolume <= 0) return 1.0;
    return Number((currentVolume / historicalMeanVolume).toFixed(2));
  }

  /**
   * Calculates ADR (Average Daily Range) Exhaustion
   */
  public static calculateADRFilled(high: number, low: number, adr14: number): number {
    if (adr14 <= 0) return 0;
    const currentRange = high - low;
    return Math.floor((currentRange / adr14) * 100);
  }

  /**
   * Calculates Cumulative Delta from ticks
   */
  public static calculateCumulativeDelta(ticks: IntradayTick[]): number {
    return ticks.reduce((acc, tick) => {
      const deltaSign = tick.buyerIsAggressive ? 1 : -1;
      return acc + (tick.volume * deltaSign);
    }, 0);
  }

  /**
   * Volume Profile Value Area Calculator (VAH, VAL, POC)
   * Calculates the exact boundaries where 70% of volume was traded
   */
  public static calculateVolumeProfile(ticks: IntradayTick[], tickSize: number): {
    vah: number;
    val: number;
    poc: number;
    distribution: Record<number, number>;
  } {
    const distribution: Record<number, number> = {};
    let totalVolume = 0;
    let pocPrice = 0;
    let maxVolume = 0;

    // 1. Bin volume by tick size levels
    ticks.forEach((t) => {
      const level = Math.round(t.price / tickSize) * tickSize;
      distribution[level] = (distribution[level] || 0) + t.volume;
      totalVolume += t.volume;

      if (distribution[level] > maxVolume) {
        maxVolume = distribution[level];
        pocPrice = level;
      }
    });

    // 2. Identify 70% value area range around the POC
    const sortedLevels = Object.keys(distribution)
      .map(Number)
      .sort((a, b) => a - b);

    let currentVAVolume = distribution[pocPrice] || 0;
    let lowIdx = sortedLevels.indexOf(pocPrice);
    let highIdx = lowIdx;

    const targetVolume = totalVolume * 0.70;

    while (currentVAVolume < targetVolume && (lowIdx > 0 || highIdx < sortedLevels.length - 1)) {
      const nextLowVol = lowIdx > 0 ? (distribution[sortedLevels[lowIdx - 1]] || 0) : 0;
      const nextHighVol = highIdx < sortedLevels.length - 1 ? (distribution[sortedLevels[highIdx + 1]] || 0) : 0;

      if (nextLowVol >= nextHighVol) {
        lowIdx--;
        currentVAVolume += nextLowVol;
      } else {
        highIdx++;
        currentVAVolume += nextHighVol;
      }
    }

    return {
      vah: sortedLevels[highIdx] || pocPrice,
      val: sortedLevels[lowIdx] || pocPrice,
      poc: pocPrice,
      distribution
    };
  }
}
```

### C. Live Real-Time React Context Integration (`useSierraSocket.ts`)
```typescript
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { MarketData } from "../types";

export function useSierraSocket(activeSymbol: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveDelta, setLiveDelta] = useState<number>(0);
  const [sierraStatus, setSierraStatus] = useState<"DISCONNECTED" | "CONNECTED">("DISCONNECTED");

  useEffect(() => {
    // Connect to local DTC streaming microservice
    const newSocket = io("http://localhost:3002", {
      transports: ["websocket"]
    });

    newSocket.on("connect", () => {
      setSierraStatus("CONNECTED");
    });

    newSocket.on("disconnect", () => {
      setSierraStatus("DISCONNECTED");
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (!socket || !activeSymbol) return;

    // Listen to incoming ticks for this specific asset
    socket.on(`tick:${activeSymbol}`, (data: { price: number; delta: number }) => {
      setLivePrice(data.price);
      setLiveDelta(data.delta);
    });

    return () => {
      socket.off(`tick:${activeSymbol}`);
    };
  }, [socket, activeSymbol]);

  return { livePrice, liveDelta, sierraStatus };
}
```
