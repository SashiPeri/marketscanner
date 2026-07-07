import { MarketData } from "../types";
import { Sparkles, TrendingUp, TrendingDown, Layers, Percent } from "lucide-react";

interface MarketHeatmapProps {
  markets: MarketData[];
  onSelectMarket: (symbol: string) => void;
  selectedSymbol: string;
}

export default function MarketHeatmap({ markets, onSelectMarket, selectedSymbol }: MarketHeatmapProps) {
  // Group markets by category
  const categories: Record<MarketData["category"], MarketData[]> = {
    FUTURES: [],
    FOREX: [],
    CRYPTO: [],
    EQUITIES: [],
  };

  markets.forEach((m) => {
    if (categories[m.category]) {
      categories[m.category].push(m);
    } else {
      categories[m.category] = [m];
    }
  });

  // Helper to calculate background color based on percent change
  const getHeatmapBg = (pctChange: number) => {
    if (pctChange > 2) return "bg-[#003923] hover:bg-[#005132] text-[#00ffcc] border-[#00ffcc]/30";
    if (pctChange > 1) return "bg-[#005934] hover:bg-[#007b48] text-[#00ff99] border-[#00ff99]/25";
    if (pctChange > 0.4) return "bg-[#007a44] hover:bg-[#00a35b] text-[#76ff03] border-[#76ff03]/20";
    if (pctChange > 0.1) return "bg-[#1b5e20] hover:bg-[#2e7d32] text-[#b2ff59] border-green-500/10";
    if (pctChange >= -0.1 && pctChange <= 0.1) return "bg-[#1c2321] hover:bg-[#25302d] text-gray-300 border-gray-800";
    if (pctChange >= -0.4) return "bg-[#4a0d0d] hover:bg-[#5f1313] text-[#ff8a80] border-red-500/10";
    if (pctChange >= -1) return "bg-[#7c1414] hover:bg-[#991c1c] text-[#ff5252] border-red-500/20";
    if (pctChange >= -2) return "bg-[#a61c1c] hover:bg-[#c22424] text-[#ff1744] border-[#ff1744]/25";
    return "bg-[#cc1818] hover:bg-[#e61c1c] text-[#ff1744] font-bold border-[#ff1744]/40";
  };

  return (
    <div id="market-heatmap-panel" className="bg-[#0b0c10] border-2 border-[#1f2833] rounded overflow-hidden font-mono flex flex-col h-full">
      {/* Header */}
      <div className="bg-[#1f2833] px-3 py-2 border-b border-[#0b0c10] flex justify-between items-center text-xs">
        <span className="text-white font-extrabold flex items-center gap-1.5 uppercase">
          <Layers className="w-3.5 h-3.5 text-orange-500" />
          MARKET INTENSITY HEATMAP <span className="text-gray-400 text-[10px] lowercase">({markets.length} assets mapped)</span>
        </span>
        <div className="flex gap-4 text-[9px] text-gray-400">
          <div className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 bg-[#cc1818] rounded" />
            <span>&lt; -2%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 bg-[#1c2321] rounded border border-gray-800" />
            <span>FLAT</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 bg-[#003923] rounded" />
            <span>&gt; +2%</span>
          </div>
        </div>
      </div>

      {/* Heatmap Body */}
      <div className="p-3 flex-1 overflow-y-auto space-y-4">
        {(Object.keys(categories) as Array<keyof typeof categories>).map((cat) => {
          const catMarkets = categories[cat];
          if (!catMarkets || catMarkets.length === 0) return null;

          return (
            <div key={cat} className="space-y-1.5">
              <div className="text-[10px] text-orange-500 font-bold uppercase tracking-widest border-b border-[#1f2833] pb-0.5 flex justify-between items-center">
                <span>{cat} SECTOR</span>
                <span className="text-gray-500 text-[9px]">{catMarkets.length} active tickers</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {catMarkets.map((m) => {
                  const isSelected = m.symbol === selectedSymbol;
                  const bgClass = getHeatmapBg(m.pctChange);
                  const isPositive = m.pctChange >= 0;

                  return (
                    <div
                      key={m.symbol}
                      onClick={() => onSelectMarket(m.symbol)}
                      className={`relative p-2.5 rounded border cursor-pointer transition-all duration-200 select-none flex flex-col justify-between aspect-[1.5/1] ${bgClass} ${
                        isSelected ? "ring-2 ring-[#45f3ff] scale-[0.98] drop-shadow-[0_0_8px_rgba(69,243,255,0.4)]" : "border-transparent"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-black text-sm tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                          {m.symbol}
                        </span>
                        <span className="text-[10px] font-bold px-1 rounded bg-black/40 text-gray-200">
                          {m.grade}
                        </span>
                      </div>

                      <div className="text-right mt-1">
                        <div className="text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                          {m.lastPrice.toLocaleString(undefined, { minimumFractionDigits: m.category === "FOREX" ? 4 : 2 })}
                        </div>
                        <div className="text-[10px] font-extrabold flex items-center justify-end drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                          {isPositive ? "+" : ""}{m.pctChange}%
                        </div>
                      </div>

                      {/* Spark relative volume indicator bar */}
                      <div className="absolute bottom-1 left-2.5 right-2.5 h-1 bg-black/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400"
                          style={{ width: `${Math.min((m.rvol / 2.5) * 100, 100)}%` }}
                          title={`Relative Volume: ${m.rvol}x`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
