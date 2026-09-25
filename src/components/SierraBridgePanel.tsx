import { useState } from "react";
import { SierraConfig } from "../types";
import { Unplug, Cable, Activity, Plus, FileSpreadsheet, Server, HelpCircle, Check, Trash2 } from "lucide-react";

interface SierraBridgePanelProps {
  config: SierraConfig;
  onSync: (params: { localPort: number; connectionType: SierraConfig["connectionType"]; customSymbols: string[] }) => void;
  onDisconnect: () => void;
  isLoading: boolean;
}

export default function SierraBridgePanel({ config, onSync, onDisconnect, isLoading }: SierraBridgePanelProps) {
  const [localPort, setLocalPort] = useState(config.localPort);
  const [connectionType, setConnectionType] = useState<SierraConfig["connectionType"]>(config.connectionType);
  const [newSymbol, setNewSymbol] = useState("");
  const [symbols, setSymbols] = useState<string[]>(config.customSymbols);
  const [showHelp, setShowHelp] = useState(false);

  const handleAddSymbol = () => {
    const cleaned = newSymbol.trim().toUpperCase();
    if (cleaned && !symbols.includes(cleaned)) {
      const updated = [...symbols, cleaned];
      setSymbols(updated);
      setNewSymbol("");
    }
  };

  const handleRemoveSymbol = (symbolToRemove: string) => {
    const updated = symbols.filter((s) => s !== symbolToRemove);
    setSymbols(updated);
  };

  const handleConnect = () => {
    onSync({
      localPort,
      connectionType,
      customSymbols: symbols,
    });
  };

  return (
    <div className="bg-[#0b0c10] border-2 border-[#1f2833] rounded overflow-hidden font-mono text-xs flex flex-col h-full">
      {/* Header */}
      <div className="bg-[#1f2833] px-3 py-2 border-b border-[#0b0c10] flex justify-between items-center text-xs">
        <span className="text-[#45f3ff] font-extrabold flex items-center gap-1.5 uppercase">
          <Cable className="w-3.5 h-3.5 text-orange-500" />
          SIERRA CHART BRIDGE CONTROL
        </span>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-gray-400 hover:text-white transition cursor-pointer"
          title="How does the Sierra Bridge work?"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {showHelp && (
        <div className="bg-[#151a22] p-3 border-b border-[#1f2833] text-[11px] text-gray-300 space-y-2">
          <p className="font-bold text-orange-400 uppercase">SIERRA CHART INTEGRATION PROTOCOL:</p>
          <p>
            1. Establish a local DTC (Data and Trading Controller) server, HTTP Client, or File Synchronization in Sierra Chart.
          </p>
          <p>
            2. Configure Sierra Chart to stream tick values on your preferred local port (default is <code className="text-[#45f3ff]">8080</code>).
          </p>
          <p>
            3. Type custom Sierra ticker symbols below and click <span className="text-orange-400">CONNECT & SYNC</span> to merge live Order Flow datasets directly into the Bloomberg scanning grid.
          </p>
        </div>
      )}

      <div className="p-4 space-y-4 flex-1 overflow-auto">
        {/* Connection Mode */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 block mb-1 text-[10px] uppercase font-bold">PORT (DTC/HTTP):</label>
            <input
              type="number"
              className="bg-black border border-[#1f2833] text-white p-1.5 rounded w-full focus:outline-none focus:border-orange-500 text-xs"
              value={localPort}
              onChange={(e) => setLocalPort(Number(e.target.value))}
              disabled={config.status === "CONNECTED"}
            />
          </div>
          <div>
            <label className="text-gray-400 block mb-1 text-[10px] uppercase font-bold">PROTOCOL:</label>
            <select
              className="bg-black border border-[#1f2833] text-white p-1.5 rounded w-full focus:outline-none focus:border-orange-500 text-xs"
              value={connectionType}
              onChange={(e) => setConnectionType(e.target.value as SierraConfig["connectionType"])}
              disabled={config.status === "CONNECTED"}
            >
              <option value="HTTP_SERVER">Sierra HTTP REST</option>
              <option value="DTC_PROTOCOL">DTC Protocol (Live)</option>
              <option value="FILE_SYNC">Local File Sync</option>
            </select>
          </div>
        </div>

        {/* Custom Symbols Import list */}
        <div className="bg-black p-3 rounded border border-gray-900 space-y-2">
          <label className="text-orange-500 block text-[10px] uppercase font-extrabold tracking-wider">
            IMPORT TICKERS FROM SIERRA CHART
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. MGC, MNQ, USDCHF"
              className="bg-black border border-[#1f2833] text-white p-1 rounded flex-1 focus:outline-none focus:border-orange-500 text-xs placeholder-gray-600 uppercase"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSymbol()}
            />
            <button
              onClick={handleAddSymbol}
              className="bg-[#1f2833] hover:bg-[#2c3947] text-[#45f3ff] p-1.5 rounded transition flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Render active temporary symbols */}
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {symbols.map((sym) => (
              <span
                key={sym}
                className="bg-[#12161a] border border-[#1f2833] text-[#45f3ff] px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 hover:border-red-500/50 transition-colors"
              >
                {sym}
                <button
                  onClick={() => handleRemoveSymbol(sym)}
                  className="text-gray-500 hover:text-red-400 cursor-pointer ml-1 text-[9px]"
                >
                  &times;
                </button>
              </span>
            ))}
            {symbols.length === 0 && (
              <span className="text-gray-600 text-[10px] italic">No custom Sierra symbols loaded yet.</span>
            )}
          </div>
        </div>

        {/* Diagnostic logs */}
        <div className="bg-black/80 border border-gray-900 rounded p-2.5 text-[10px] font-mono text-gray-400 space-y-1 select-none">
          <div className="text-orange-400 font-bold uppercase mb-1 flex items-center gap-1 text-[9px]">
            <Activity className="w-3 h-3 text-orange-500 animate-pulse" />
            BRIDGE LIVE MONITOR
          </div>
          <div>STATUS: <span className={config.status === "CONNECTED" ? "text-[#00e676]" : "text-gray-500"}>{config.status}</span></div>
          <div>SUBSCRIBED SYMBOLS: <span className="text-white">{symbols.length}</span></div>
          {config.symbolStates && Object.keys(config.symbolStates).length > 0 && (
            <div className="pt-1 space-y-0.5">
              {Object.entries(config.symbolStates).map(([sym, feed]) => (
                <div key={sym} className="truncate">
                  <span className="text-white">{sym}</span>
                  {" → "}
                  <span className={
                    feed.status === "STREAMING" ? "text-[#00e676]"
                      : feed.status === "PENDING" ? "text-yellow-400"
                        : "text-red-400"
                  }>
                    {feed.status}
                  </span>
                  {feed.detail && <span className="text-gray-500"> — {feed.detail}</span>}
                </div>
              ))}
            </div>
          )}
          <div>PORT ALIGNMENT: <span className="text-white">127.0.0.1:{localPort}</span></div>
          {config.lastSyncTime && (
            <div className="truncate">LAST SYNCED: <span className="text-[#00ffcc]">{new Date(config.lastSyncTime).toLocaleTimeString()}</span></div>
          )}
        </div>

        {/* Connect Action Button */}
        <div className="flex gap-2 pt-2">
          {config.status === "CONNECTED" ? (
            <button
              onClick={onDisconnect}
              className="flex-1 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 font-bold p-2 rounded transition border border-red-500/20 text-center flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Unplug className="w-4 h-4" />
              DISCONNECT BRIDGE
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isLoading}
              className="flex-1 bg-[#1f2833] hover:bg-[#2b3a4a] text-orange-400 hover:text-orange-300 font-bold p-2 rounded border border-orange-500/30 transition text-center flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Server className="w-4 h-4 text-orange-500" />
              CONNECT & SYNC SIERRA
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
