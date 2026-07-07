import { MarketData } from "../types";
import { TrendingUp, TrendingDown, RefreshCw, BarChart2, ShieldAlert, ArrowUpRight, ArrowDownRight, CircleSlash, Sparkles, Filter } from "lucide-react";

interface ScannerGridProps {
  markets: MarketData[];
  onSelectMarket: (symbol: string) => void;
  selectedSymbol: string;
}

export default function ScannerGrid({ markets, onSelectMarket, selectedSymbol }: ScannerGridProps) {
  // Color classification for grades
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "A+": return "text-[#00ffcc] font-black drop-shadow-[0_0_4px_#00ffcc33]";
      case "A": return "text-[#00e676] font-bold";
      case "B": return "text-[#aeea00] font-medium";
      case "C": return "text-[#ffeb3b]";
      case "F": return "text-[#ff1744] font-semibold bg-[#ff174415] px-1.5 py-0.5 rounded border border-[#ff174433]";
      default: return "text-gray-400";
    }
  };

  // Color classification for regimes
  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case "TRENDING_UP": return "bg-[#00e6761a] text-[#00e676] border border-[#00e67633]";
      case "TRENDING_DOWN": return "bg-[#ff17441a] text-[#ff1744] border border-[#ff174433]";
      case "RANGE_BOUND": return "bg-[#2979ff1a] text-[#2979ff] border border-[#2979ff33]";
      case "CHOPPY": return "bg-[#ff91001a] text-[#ff9100] border border-[#ff910033]";
      default: return "bg-[#1f2833] text-gray-400";
    }
  };

  const getRegimeIcon = (regime: string) => {
    switch (regime) {
      case "TRENDING_UP": return <TrendingUp className="w-3.5 h-3.5 mr-1 text-[#00e676]" />;
      case "TRENDING_DOWN": return <TrendingDown className="w-3.5 h-3.5 mr-1 text-[#ff1744]" />;
      case "RANGE_BOUND": return <BarChart2 className="w-3.5 h-3.5 mr-1 text-[#2979ff] rotate-90" />;
      case "CHOPPY": return <CircleSlash className="w-3.5 h-3.5 mr-1 text-[#ff9100]" />;
      default: return null;
    }
  };

  return (
    <div id="scanner-grid-container" className="bg-[#0b0c10] border-2 border-[#1f2833] rounded overflow-hidden font-mono flex flex-col h-full">
      {/* Grid Control Header */}
      <div className="bg-[#1f2833] px-3 py-2 border-b border-[#0b0c10] flex justify-between items-center text-xs">
        <span className="text-white font-extrabold flex items-center gap-1.5 uppercase">
          <Filter className="w-3.5 h-3.5 text-orange-500" />
          ACTIVE MARKET SCANNER <span className="text-gray-400 text-[10px] lowercase">({markets.length} tracked)</span>
        </span>
        <div className="flex items-center gap-4 text-gray-400 text-[10px]">
          <span className="flex items-center gap-1 text-[#00e676]">
            <span className="inline-block w-2 h-2 bg-[#00e676] rounded-full animate-pulse"></span> HIGH EDGE
          </span>
          <span className="flex items-center gap-1 text-[#ff1744]">
            <span className="inline-block w-2 h-2 bg-[#ff1744] rounded-full"></span> AVOID CHOP
          </span>
        </div>
      </div>

      {/* Spreadsheet / Terminal Grid Table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#0f141a] border-b border-[#1f2833] text-orange-500 font-bold sticky top-0 uppercase tracking-wider text-[10px] select-none z-10">
              <th className="p-2 border-r border-[#1f2833]">SYMBOL</th>
              <th className="p-2 border-r border-[#1f2833]">LAST</th>
              <th className="p-2 border-r border-[#1f2833]">NET %CHG</th>
              <th className="p-2 border-r border-[#1f2833] text-center">RVOL (10D)</th>
              <th className="p-2 border-r border-[#1f2833] text-center">ADR FILL%</th>
              <th className="p-2 border-r border-[#1f2833] text-center">VALUE AREA (VAL-VAH)</th>
              <th className="p-2 border-r border-[#1f2833]">REGIME TYPE</th>
              <th className="p-2 border-r border-[#1f2833] text-center">EDGE</th>
              <th className="p-2 text-center">GRADE</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => {
              const isSelected = m.symbol === selectedSymbol;
              const isPositive = m.pctChange >= 0;
              const highRvol = m.rvol >= 1.4;
              const adrOverextended = m.adrFilledPct >= 100;

              return (
                <tr
                  key={m.symbol}
                  id={`row-${m.symbol}`}
                  onClick={() => onSelectMarket(m.symbol)}
                  className={`border-b border-[#1f2833] cursor-pointer transition-colors duration-150 ${
                    isSelected ? "bg-[#122c3a] text-white" : "hover:bg-[#1a222d]"
                  }`}
                >
                  {/* Symbol */}
                  <td className="p-2 border-r border-[#1f2833] font-black">
                    <div className="flex flex-col">
                      <span className="text-[#45f3ff] text-sm tracking-wider flex items-center gap-1">
                        {m.symbol}
                        {highRvol && <Sparkles className="w-3 h-3 text-[#00ffcc]" title="Institutional Flow Spike" />}
                      </span>
                      <span className="text-gray-500 text-[9px] max-w-[120px] truncate">{m.name}</span>
                    </div>
                  </td>

                  {/* Last Price */}
                  <td className={`p-2 border-r border-[#1f2833] font-semibold text-right ${isPositive ? "text-[#00e676]" : "text-[#ff1744]"}`}>
                    {m.lastPrice.toLocaleString(undefined, { minimumFractionDigits: m.category === "FOREX" ? 4 : 2 })}
                  </td>

                  {/* Net Change % */}
                  <td className={`p-2 border-r border-[#1f2833] text-right font-medium`}>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${
                      isPositive ? "bg-[#00e6761a] text-[#00e676]" : "bg-[#ff17441a] text-[#ff1744]"
                    }`}>
                      {isPositive ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                      {isPositive ? "+" : ""}{m.pctChange}%
                    </span>
                  </td>

                  {/* Relative Volume (RVol) */}
                  <td className={`p-2 border-r border-[#1f2833] text-center font-bold`}>
                    <span className={`px-2 py-0.5 rounded text-[11px] ${
                      highRvol 
                        ? "bg-[#00e67625] text-[#00ffcc] border border-[#00ffcc55]" 
                        : m.rvol < 0.8 
                          ? "bg-[#ff174415] text-[#ff1744]" 
                          : "text-gray-300"
                    }`}>
                      {m.rvol}x
                    </span>
                  </td>

                  {/* ADR Filled Percentage */}
                  <td className="p-2 border-r border-[#1f2833]">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-full bg-[#151a22] rounded-full h-1.5 max-w-[70px] overflow-hidden border border-gray-800">
                        <div
                          className={`h-full rounded-full ${adrOverextended ? "bg-[#ff9100]" : "bg-[#00e676]"}`}
                          style={{ width: `${Math.min(m.adrFilledPct, 100)}%` }}
                        />
                      </div>
                      <span className={`text-[9px] font-bold ${adrOverextended ? "text-orange-400" : "text-gray-400"}`}>
                        {m.adrFilledPct}% {adrOverextended ? "EXHAUSTED" : ""}
                      </span>
                    </div>
                  </td>

                  {/* Value Area High/Low Range Indicator */}
                  <td className="p-2 border-r border-[#1f2833] text-center">
                    <div className="flex flex-col items-center">
                      <div className="flex justify-between w-full text-[9px] text-gray-500 max-w-[120px]">
                        <span>VAL: {m.val}</span>
                        <span>VAH: {m.vah}</span>
                      </div>
                      <div className="relative w-full max-w-[120px] bg-gray-800 h-2 rounded mt-0.5 overflow-hidden">
                        {/* Highlights POC marker as yellow strip */}
                        <div 
                          className="absolute h-full w-1 bg-yellow-500 z-10"
                          style={{ left: `${((m.poc - m.val) / (m.vah - m.val || 1)) * 100}%` }}
                          title={`POC: ${m.poc}`}
                        />
                        {/* Highlight active current price spot */}
                        <div 
                          className="absolute w-2 h-2 rounded-full bg-[#45f3ff] border border-black"
                          style={{ 
                            left: `${Math.min(Math.max(((m.lastPrice - m.val) / (m.vah - m.val || 1)) * 100, 0), 100)}%`,
                            transform: 'translateX(-50%)'
                          }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Regime Type */}
                  <td className="p-2 border-r border-[#1f2833]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${getRegimeColor(m.regime)}`}>
                      {getRegimeIcon(m.regime)}
                      {m.regime.replace("_", " ")}
                    </span>
                  </td>

                  {/* Probability Score */}
                  <td className="p-2 border-r border-[#1f2833] text-center font-bold text-sm">
                    <span className={m.probScore >= 85 ? "text-[#00ffcc]" : m.probScore >= 65 ? "text-yellow-400" : "text-[#ff1744]"}>
                      {m.probScore}%
                    </span>
                  </td>

                  {/* Final Grade Letter */}
                  <td className="p-2 text-center font-black">
                    <span className={getGradeColor(m.grade)}>{m.grade}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
