import { useState, useEffect } from "react";
import { MarketData, SierraConfig, AIBriefing } from "./types";
import { useMarketSocket } from "./hooks/useMarketSocket";
import TerminalHeader from "./components/TerminalHeader";
import ScannerGrid from "./components/ScannerGrid";
import MarketHeatmap from "./components/MarketHeatmap";
import MarketDetailPanel from "./components/MarketDetailPanel";
import SierraBridgePanel from "./components/SierraBridgePanel";
import AIPredictionPanel from "./components/AIPredictionPanel";
import { HelpCircle, RefreshCw, Cpu, Activity, Info, Sparkles, BookOpen, Layers, Grid } from "lucide-react";

export default function App() {
  const { markets, sierraConfig: liveSierraConfig, connectionStatus, refresh } = useMarketSocket({
    subscription: { kind: "all" },
  });

  const [sierraConfig, setSierraConfig] = useState<SierraConfig>({
    localPort: 8080,
    connectionType: "HTTP_SERVER",
    status: "STANDBY",
    lastSyncTime: null,
    customSymbols: [],
  });

  // Sync sierra config from realtime hook when available
  useEffect(() => {
    if (liveSierraConfig) {
      setSierraConfig(liveSierraConfig);
    }
  }, [liveSierraConfig]);
  
  const [selectedSymbol, setSelectedSymbol] = useState<string>("ES");
  const [viewMode, setViewMode] = useState<"GRID" | "HEATMAP">("GRID");
  const [aiBriefing, setAiBriefing] = useState<AIBriefing | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [isMarketsLoading, setIsMarketsLoading] = useState<boolean>(false);
  const [isFallbackBriefing, setIsFallbackBriefing] = useState<boolean>(false);
  const [terminalNotification, setTerminalNotification] = useState<string | null>(null);
  const [errorLog, setErrorLog] = useState<string | null>(null);

  // Initial AI scan on start
  useEffect(() => {
    runAiAnalysis();
  }, []);

  // Request high-probability scanner brief from Gemini
  const runAiAnalysis = async (marketsList?: MarketData[]) => {
    setIsAiLoading(true);
    try {
      const res = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markets: marketsList || markets }),
      });
      if (!res.ok) throw new Error("Failed to compile cognitive analysis from Gemini API.");
      const data = await res.json();
      if (data.success) {
        setAiBriefing(data.briefing);
        setIsFallbackBriefing(!!data.isFallback);
        setTerminalNotification("AI BRIEFING UPDATED SUCCESSFULLY.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorLog("Gemini Scanner calculation failed. Check system logs.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // Sync with Sierra Chart Bridge Control
  const handleSierraSync = async (params: { localPort: number; connectionType: SierraConfig["connectionType"]; customSymbols: string[] }) => {
    setIsMarketsLoading(true);
    try {
      const res = await fetch("/api/sierra-bridge/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Failed to sync with local Sierra instance.");
      const data = await res.json();
      if (data.success) {
        setSierraConfig(data.sierraConfig);
        refresh();
        setTerminalNotification(`SIERRA BRIDGE ONLINE. SYNCED ${params.customSymbols.length} CUSTOM TICKERS.`);
        
        // Immediately run AI scanner update on new custom symbols!
        runAiAnalysis(data.markets);
      }
    } catch (err: any) {
      console.error(err);
      setErrorLog(err.message || "Sierra synchronization failed.");
    } finally {
      setIsMarketsLoading(false);
    }
  };

  // Disconnect from Sierra Chart
  const handleSierraDisconnect = async () => {
    try {
      const res = await fetch("/api/sierra-bridge/disconnect", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSierraConfig(data.sierraConfig);
        setTerminalNotification("SIERRA BRIDGE SHUTDOWN SUCCESSFULLY.");
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  // Process Bloomberg Terminal command entry
  const handleTerminalCommand = (cmd: string) => {
    const parts = cmd.split(" ");
    const primary = parts[0];
    const isGo = parts[1] === "<GO>" || parts[1] === "GO";

    if (primary === "HELP" || primary === "H") {
      setTerminalNotification("HELP INSTRUCTION: Enter TICKER followed by <GO> (e.g. 'CL <GO>'). Enter 'SIERRA' to show bridge info.");
      return;
    }

    if (primary === "SIERRA") {
      setTerminalNotification(`SIERRA BRIDGE CONFIG: PORT ${sierraConfig.localPort} | STATUS: ${sierraConfig.status}`);
      return;
    }

    if (primary === "CLEAR") {
      setTerminalNotification(null);
      setErrorLog(null);
      return;
    }

    // Match symbol
    const matched = markets.find((m) => m.symbol === primary);
    if (matched) {
      setSelectedSymbol(matched.symbol);
      setTerminalNotification(`ACTIVATED TICKER: ${matched.symbol} (${matched.name})`);
    } else {
      // Create new Sierra symbol on-the-fly and load
      setTerminalNotification(`SYMBOL '${primary}' NOT FOUND. INSERTING AS CUSTOM SIERRA TICKER...`);
      handleSierraSync({
        localPort: sierraConfig.localPort,
        connectionType: sierraConfig.connectionType,
        customSymbols: [...sierraConfig.customSymbols, primary],
      });
    }
  };

  const selectedMarket = markets.find((m) => m.symbol === selectedSymbol) || null;

  return (
    <div className="min-h-screen bg-[#07080c] text-white flex flex-col font-mono selection:bg-[#45f3ff] selection:text-black">
      
      {/* Bloomberg Header Bar */}
      <TerminalHeader
        onCommand={handleTerminalCommand}
        sierraConnected={sierraConfig.status === "CONNECTED"}
        activeSymbol={selectedSymbol}
      />

      {/* Main Body */}
      <main className="flex-1 p-3 flex flex-col gap-3 min-h-0">
        
        {/* Terminal Alert Feed */}
        {terminalNotification && (
          <div className="bg-[#122c3a] border border-[#45f3ff]/40 px-3 py-1.5 rounded text-[11px] text-[#45f3ff] flex justify-between items-center animate-fade-in select-none">
            <span className="flex items-center gap-1.5 font-bold uppercase">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              SYSTEM LOG: {terminalNotification}
            </span>
            <button 
              onClick={() => setTerminalNotification(null)}
              className="text-gray-400 hover:text-white cursor-pointer hover:font-bold text-xs"
            >
              &times;
            </button>
          </div>
        )}

        {errorLog && (
          <div className="bg-[#ff174415] border border-[#ff1744]/40 px-3 py-1.5 rounded text-[11px] text-[#ff1744] flex justify-between items-center animate-fade-in select-none">
            <span className="flex items-center gap-1.5 font-bold uppercase">
              <Info className="w-3.5 h-3.5 text-[#ff1744]" />
              ALERT LOG: {errorLog}
            </span>
            <button 
              onClick={() => setErrorLog(null)}
              className="text-gray-400 hover:text-white cursor-pointer hover:font-bold text-xs"
            >
              &times;
            </button>
          </div>
        )}

        {/* Dashboard 3-Column Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 flex-1 min-h-0 items-stretch">
          
          {/* Column A (Left 7 Cols): Scanner Grid & Detailed Market Profile */}
          <div className="xl:col-span-8 flex flex-col gap-3 min-h-0">
            {/* View Mode Switcher */}
            <div className="flex justify-between items-center bg-[#0b0c10] border-2 border-[#1f2833] rounded px-3 py-1.5 text-xs font-bold font-mono">
              <span className="text-gray-400 uppercase tracking-widest text-[10px] flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-orange-500" />
                DASHBOARD MODE: <span className="text-white">{viewMode === "GRID" ? "SPREADSHEET DATA" : "INTENSITY DENSITY"}</span>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode("GRID")}
                  className={`px-3 py-1 rounded text-[10px] flex items-center gap-1.5 transition cursor-pointer font-bold ${
                    viewMode === "GRID"
                      ? "bg-orange-500 text-black font-black"
                      : "bg-black text-gray-400 hover:text-white border border-gray-800"
                  }`}
                >
                  <Grid className="w-3 h-3" />
                  GRID SPREADSHEET
                </button>
                <button
                  onClick={() => setViewMode("HEATMAP")}
                  className={`px-3 py-1 rounded text-[10px] flex items-center gap-1.5 transition cursor-pointer font-bold ${
                    viewMode === "HEATMAP"
                      ? "bg-orange-500 text-black font-black"
                      : "bg-black text-gray-400 hover:text-white border border-gray-800"
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  INTENSITY HEATMAP
                </button>
              </div>
            </div>

            {/* Active Scanner spreadsheet / Heatmap */}
            <div className="flex-1 min-h-[300px]">
              {viewMode === "GRID" ? (
                <ScannerGrid
                  markets={markets}
                  onSelectMarket={(sym) => setSelectedSymbol(sym)}
                  selectedSymbol={selectedSymbol}
                />
              ) : (
                <MarketHeatmap
                  markets={markets}
                  onSelectMarket={(sym) => setSelectedSymbol(sym)}
                  selectedSymbol={selectedSymbol}
                />
              )}
            </div>

            {/* Detailed Market profile visualizer */}
            <div className="flex-1 min-h-[300px]">
              <MarketDetailPanel market={selectedMarket} />
            </div>
          </div>

          {/* Column B (Right 4 Cols): AI Intelligence Briefing & Sierra Bridge Controller */}
          <div className="xl:col-span-4 flex flex-col gap-3 min-h-0">
            
            {/* AIPredictionPanel */}
            <div className="flex-1 min-h-[400px]">
              <AIPredictionPanel
                briefing={aiBriefing}
                isLoading={isAiLoading}
                onRefresh={() => runAiAnalysis()}
                isFallback={isFallbackBriefing}
              />
            </div>

            {/* SierraBridgePanel */}
            <div className="h-[280px]">
              <SierraBridgePanel
                config={sierraConfig}
                onSync={handleSierraSync}
                onDisconnect={handleSierraDisconnect}
                isLoading={isMarketsLoading}
              />
            </div>

          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="bg-black border-t border-[#1f2833] py-2 px-4 text-center text-gray-600 text-[10px] select-none">
        <p>
          MarketScanner &copy; {new Date().getFullYear()} — General-purpose multi-symbol market scanner. For informational purposes only. Not financial advice.
        </p>
      </footer>
    </div>
  );
}
