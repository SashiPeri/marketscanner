import { useState, useEffect, KeyboardEvent } from "react";
import { Terminal, ShieldAlert, Cpu, HelpCircle, Activity } from "lucide-react";

interface TerminalHeaderProps {
  onCommand: (cmd: string) => void;
  sierraConnected: boolean;
  activeSymbol: string;
}

export default function TerminalHeader({ onCommand, sierraConnected, activeSymbol }: TerminalHeaderProps) {
  const [commandInput, setCommandInput] = useState("");
  const [clocks, setClocks] = useState({
    est: "",
    gmt: "",
    local: "",
  });

  const [tickerOffset, setTickerOffset] = useState(0);

  // Update clocks every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      
      const estFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const gmtFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "GMT",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const localTime = now.toLocaleTimeString("en-US", { hour12: false });

      setClocks({
        est: estFormatter.format(now),
        gmt: gmtFormatter.format(now),
        local: localTime,
      });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // News ticker entries
  const newsStories = [
    "FOMC MEETING MINUTES SIGNALS HIGHER-FOR-LONGER RATES POLICY...",
    "RELATIVE VOLUME SHARP SPIKE DETECTED IN CRYPTO ASSETS...",
    "NASDAQ FUTURES (NQ) RESUMES BULLISH PENNANT BREAKOUT PATTERN...",
    "SIERRA CHART BRIDGE ACTIVE ON LOCAL PROTOCOL PORT 8080...",
    "GOLD DECLARES MEAN REVERSION SETUP AT VALUE AREA LOW (VAL) SUPPORT...",
    "CRUDE OIL INTRADAY ATR DIPS TO 30-DAY LOWS; TRADERS WARNED OF SEVERE CHOP..."
  ];

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const cleaned = commandInput.trim().toUpperCase();
      if (cleaned) {
        onCommand(cleaned);
        setCommandInput("");
      }
    }
  };

  return (
    <header className="bg-[#0b0c10] border-b-2 border-[#1f2833] text-[#45f3ff] p-3 font-mono text-xs select-none">
      {/* Top Banner Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-2">
        <div className="flex items-center gap-3">
          <div className="bg-[#1f2833] text-orange-500 font-bold px-2 py-0.5 border border-orange-500 rounded text-[10px]">
            BBG TERM
          </div>
          <span className="text-white font-extrabold tracking-wider text-sm flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-[#45f3ff]" />
            BLOOMBERG TERMINAL : <span className="text-orange-500">MKT-SCANNER</span>
          </span>
        </div>

        {/* Clocks Section */}
        <div className="flex items-center gap-4 text-[10px] text-gray-400">
          <div>
            NY: <span className="text-[#45f3ff] font-semibold">{clocks.est}</span>
          </div>
          <div>
            GMT: <span className="text-[#45f3ff] font-semibold">{clocks.gmt}</span>
          </div>
          <div>
            LCL: <span className="text-yellow-500 font-semibold">{clocks.local}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">SIERRA LINK:</span>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${sierraConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            <span className={sierraConnected ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
              {sierraConnected ? "ACTIVE" : "STANDBY"}
            </span>
          </div>
        </div>
      </div>

      {/* Command Prompt Line */}
      <div className="bg-black border border-[#1f2833] flex items-center p-1 rounded mb-2">
        <span className="text-orange-500 px-2 font-bold select-none">{activeSymbol || "SYS"}&gt;</span>
        <input
          type="text"
          className="bg-transparent text-white font-mono w-full focus:outline-none placeholder-gray-600 text-xs"
          placeholder="ENTER TICKER OR COMMAND (e.g. 'ES <GO>', 'SIERRA <GO>', 'HELP <GO>', 'CLEAR')"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center gap-1 px-2 text-[10px] text-gray-500">
          <kbd className="bg-[#1f2833] text-gray-300 px-1 py-0.5 rounded border border-gray-700 font-sans">ENTER</kbd>
          <span>TO EXECUTE</span>
        </div>
      </div>

      {/* News Ticker Marquee */}
      <div className="bg-[#0f141a] border-t border-b border-[#1f2833] py-1 overflow-hidden relative flex items-center">
        <div className="absolute left-0 bg-[#0f141a] text-orange-400 font-bold pr-2 text-[10px] z-10 flex items-center gap-1 border-r border-[#1f2833]">
          <Activity className="w-3 h-3 animate-pulse text-orange-500" />
          <span>FLASH REPORT:</span>
        </div>
        <div className="whitespace-nowrap animate-[marquee_40s_linear_infinite] pl-28 text-orange-200 hover:pause text-[10px] tracking-wide flex items-center gap-8">
          {newsStories.map((story, idx) => (
            <span key={idx} className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
              {story}
            </span>
          ))}
        </div>
      </div>

      {/* Embedded Marquee animation */}
      <style>{`
        @keyframes marquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
      `}</style>
    </header>
  );
}
