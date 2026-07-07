import { useState, useEffect, useRef } from "react";
import { MarketData } from "../types";
import { Activity, ShieldCheck, Sparkles, TrendingUp, TrendingDown, RefreshCw, Layers, Sliders, ArrowDown, ArrowUp } from "lucide-react";

interface MarketDetailPanelProps {
  market: MarketData | null;
}

export default function MarketDetailPanel({ market }: MarketDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<"PROFILE" | "ORDERFLOW" | "STRATEGY">("PROFILE");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Simulated live Order Book data for the asset
  const [bids, setBids] = useState<{ price: number; size: number }[]>([]);
  const [asks, setAsks] = useState<{ price: number; size: number }[]>([]);
  const [tradesHistory, setTradesHistory] = useState<{ price: number; size: number; side: "BUY" | "SELL"; time: string }[]>([]);

  // Periodically update mock order book
  useEffect(() => {
    if (!market) return;

    const generateOrderBook = () => {
      const spread = market.category === "FOREX" ? 0.0002 : market.category === "CRYPTO" ? 5 : 0.5;
      const basePrice = market.lastPrice;

      const newBids = Array.from({ length: 5 }, (_, i) => ({
        price: Number((basePrice - (i + 1) * spread).toFixed(market.category === "FOREX" ? 4 : 2)),
        size: Math.floor(Math.random() * 25) + 5,
      }));

      const newAsks = Array.from({ length: 5 }, (_, i) => ({
        price: Number((basePrice + (i + 1) * spread).toFixed(market.category === "FOREX" ? 4 : 2)),
        size: Math.floor(Math.random() * 25) + 5,
      }));

      setBids(newBids);
      setAsks(newAsks);
    };

    generateOrderBook();
    const interval = setInterval(generateOrderBook, 2500);
    return () => clearInterval(interval);
  }, [market]);

  // Handle mock trade printing
  useEffect(() => {
    if (!market) return;

    const printTrade = () => {
      const side = Math.random() > 0.5 ? "BUY" : "SELL";
      const size = Math.floor(Math.random() * 12) + 1;
      const priceOffset = (Math.random() - 0.5) * (market.category === "FOREX" ? 0.0001 : 0.25);
      const price = Number((market.lastPrice + priceOffset).toFixed(market.category === "FOREX" ? 4 : 2));
      const time = new Date().toLocaleTimeString();

      setTradesHistory((prev) => [
        { price, size, side, time },
        ...prev.slice(0, 14)
      ]);
    };

    const interval = setInterval(printTrade, 1500);
    return () => clearInterval(interval);
  }, [market]);

  // Volume Profile Visual Canvas Renderer
  useEffect(() => {
    if (!market || !canvasRef.current || activeTab !== "PROFILE") return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = "#0b0c10";
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = "#1a222d";
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 30) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // Volume Profile variables
    const val = market.val;
    const vah = market.vah;
    const poc = market.poc;
    const current = market.lastPrice;

    // Draw Value Area range background
    const valueAreaYStart = height * 0.25;
    const valueAreaYEnd = height * 0.75;
    ctx.fillStyle = "rgba(41, 121, 255, 0.06)";
    ctx.fillRect(0, valueAreaYStart, width, valueAreaYEnd - valueAreaYStart);

    // Draw the profile distribution horizontal bars
    const rowsCount = 14;
    const rowHeight = (height * 0.7) / rowsCount;
    const maxBarWidth = width * 0.8;

    for (let i = 0; i < rowsCount; i++) {
      const y = height * 0.15 + i * rowHeight;
      // Generate some nice pseudo volume profile curve (bell shape centered around POC)
      const distFromCenter = Math.abs(i - rowsCount / 2);
      const bellValue = Math.exp(-Math.pow(distFromCenter / 3, 2));
      const rvolFactor = market.rvol > 1.2 ? 1.15 : 0.85;
      const barWidth = bellValue * maxBarWidth * rvolFactor * (0.8 + Math.random() * 0.2);

      // Determine bar coloring based on inside vs outside value area
      const isInsideValueArea = y >= valueAreaYStart && y <= valueAreaYEnd;
      ctx.fillStyle = isInsideValueArea 
        ? "rgba(69, 243, 255, 0.15)" 
        : "rgba(255, 145, 0, 0.12)";
      ctx.strokeStyle = isInsideValueArea 
        ? "rgba(69, 243, 255, 0.3)" 
        : "rgba(255, 145, 0, 0.2)";

      ctx.fillRect(10, y, barWidth, rowHeight - 2);
      ctx.strokeRect(10, y, barWidth, rowHeight - 2);
    }

    // Draw POC line (Point of Control)
    const pocY = height * 0.15 + (rowsCount / 2) * rowHeight;
    ctx.strokeStyle = "#ffeb3b";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, pocY);
    ctx.lineTo(width, pocY);
    ctx.stroke();
    ctx.setLineDash([]); // reset

    // Draw POC label
    ctx.fillStyle = "#ffeb3b";
    ctx.font = "bold 9px monospace";
    ctx.fillText(`POC: ${poc}`, width - 80, pocY - 4);

    // Draw VAH (Value Area High) boundary line
    ctx.strokeStyle = "#00e676";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, valueAreaYStart);
    ctx.lineTo(width, valueAreaYStart);
    ctx.stroke();

    ctx.fillStyle = "#00e676";
    ctx.fillText(`VAH (HIGH EDGE): ${vah}`, width - 130, valueAreaYStart - 4);

    // Draw VAL (Value Area Low) boundary line
    ctx.strokeStyle = "#ff1744";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, valueAreaYEnd);
    ctx.lineTo(width, valueAreaYEnd);
    ctx.stroke();

    ctx.fillStyle = "#ff1744";
    ctx.fillText(`VAL (LOW EDGE): ${val}`, width - 120, valueAreaYEnd + 12);

    // Draw Current price line marker
    const currentY = height * 0.15 + ((rowsCount * 0.5) + ((current - poc) / (vah - val || 1)) * (rowsCount * 0.2)) * rowHeight;
    const clampedCurrentY = Math.min(Math.max(currentY, 20), height - 20);

    ctx.strokeStyle = "#45f3ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, clampedCurrentY);
    ctx.lineTo(width, clampedCurrentY);
    ctx.stroke();

    // Draw glowing price label box
    ctx.fillStyle = "#122c3a";
    ctx.fillRect(width - 90, clampedCurrentY - 10, 85, 18);
    ctx.strokeStyle = "#45f3ff";
    ctx.strokeRect(width - 90, clampedCurrentY - 10, 85, 18);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px monospace";
    ctx.fillText(`LAST: ${current}`, width - 84, clampedCurrentY + 2);

  }, [market, activeTab]);

  if (!market) {
    return (
      <div className="bg-[#0b0c10] border-2 border-[#1f2833] rounded p-12 text-center text-gray-500 font-mono text-xs flex flex-col items-center justify-center h-full">
        <Activity className="w-8 h-8 text-orange-500/50 mb-3 animate-pulse" />
        <p className="uppercase font-bold tracking-wider mb-1">NO SYMBOL SUBMITTED</p>
        <p className="text-[10px] text-gray-600">Select a market from the active scanner grid above, or load custom tickers from your Sierra connection.</p>
      </div>
    );
  }

  // Calculate volume distribution sizes for bids/asks to show DOM visualizer
  const totalBidsVolume = bids.reduce((acc, b) => acc + b.size, 0);
  const totalAsksVolume = asks.reduce((acc, a) => acc + a.size, 0);

  return (
    <div className="bg-[#0b0c10] border-2 border-[#1f2833] rounded overflow-hidden font-mono text-xs flex flex-col h-full">
      {/* Detail Header */}
      <div className="bg-[#1f2833] px-3 py-2 border-b border-[#0b0c10] flex justify-between items-center text-xs">
        <span className="text-white font-extrabold flex items-center gap-1.5 uppercase">
          <Activity className="w-3.5 h-3.5 text-orange-500" />
          MARKET PROFILE INTELLIGENCE: <span className="text-[#45f3ff]">{market.symbol}</span>
        </span>
        <div className="flex gap-2">
          {["PROFILE", "ORDERFLOW", "STRATEGY"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider cursor-pointer transition ${
                activeTab === tab
                  ? "bg-orange-500 text-black border border-orange-500"
                  : "bg-black text-gray-400 border border-gray-800 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid Split: Left Chart/Details, Right DOM/Order Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 flex-1 overflow-hidden min-h-0">
        
        {/* Left Column: Visual Graph / Core Profile metrics */}
        <div className="col-span-1 lg:col-span-2 p-3 flex flex-col border-r border-[#1f2833] overflow-y-auto space-y-3">
          
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-4 gap-2 bg-black border border-gray-900 rounded p-2 text-center text-[10px]">
            <div>
              <div className="text-gray-500 font-bold">RVOL (10D)</div>
              <div className={`text-sm font-bold ${market.rvol >= 1.4 ? "text-[#00ffcc]" : "text-white"}`}>
                {market.rvol}x
              </div>
            </div>
            <div>
              <div className="text-gray-500 font-bold">ATR (14)</div>
              <div className="text-sm font-bold text-white">
                {market.atr.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </div>
            </div>
            <div>
              <div className="text-gray-500 font-bold">ADR EXHAUSTION</div>
              <div className={`text-sm font-bold ${market.adrFilledPct >= 100 ? "text-orange-400" : "text-[#00e676]"}`}>
                {market.adrFilledPct}%
              </div>
            </div>
            <div>
              <div className="text-gray-500 font-bold">EDGE RATING</div>
              <div className="text-sm font-bold text-yellow-400">
                {market.probScore}% ({market.grade})
              </div>
            </div>
          </div>

          {/* Active Canvas / Data Tab render */}
          <div className="flex-1 min-h-[220px] bg-black border border-gray-900 rounded relative overflow-hidden flex flex-col">
            {activeTab === "PROFILE" ? (
              <div className="relative flex-1">
                <canvas ref={canvasRef} className="w-full h-full block" />
                <div className="absolute top-2 left-2 bg-black/80 border border-gray-800 text-[9px] text-[#45f3ff] px-1.5 py-0.5 rounded font-mono select-none">
                  VOLUME PROFILE BOUNDARIES
                </div>
              </div>
            ) : activeTab === "ORDERFLOW" ? (
              <div className="p-3 flex-1 overflow-y-auto space-y-2">
                <div className="text-[10px] text-orange-400 font-bold tracking-wider uppercase mb-1">
                  ORDER BOOK DEPTH OF MARKET (DOM)
                </div>
                {/* Ask Grid */}
                <div className="space-y-1">
                  {asks.slice().reverse().map((ask, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] h-5 relative">
                      <div 
                        className="absolute right-0 h-full bg-red-950/10 border-r border-red-500/20"
                        style={{ width: `${(ask.size / totalAsksVolume) * 100}%` }}
                      />
                      <span className="text-red-500 font-semibold z-10 pl-2">{ask.price}</span>
                      <span className="text-gray-400 font-bold z-10 pr-2">{ask.size}</span>
                    </div>
                  ))}
                </div>
                {/* Spread Divider */}
                <div className="border-t border-b border-[#1f2833] py-0.5 text-center bg-[#151a22] text-[10px]">
                  SPREAD: <span className="text-[#45f3ff] font-bold">{(asks[0]?.price - bids[0]?.price || 0).toFixed(market.category === "FOREX" ? 4 : 2)}</span>
                </div>
                {/* Bid Grid */}
                <div className="space-y-1">
                  {bids.map((bid, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] h-5 relative">
                      <div 
                        className="absolute right-0 h-full bg-green-950/10 border-r border-green-500/20"
                        style={{ width: `${(bid.size / totalBidsVolume) * 100}%` }}
                      />
                      <span className="text-green-400 font-semibold z-10 pl-2">{bid.price}</span>
                      <span className="text-gray-400 font-bold z-10 pr-2">{bid.size}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 flex-1 overflow-y-auto space-y-2">
                <div className="text-[10px] text-orange-400 font-bold tracking-wider uppercase mb-1 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  SIERRA SCANNER STRATEGY LOGIC
                </div>
                <div className="space-y-2 text-xs">
                  <div className="bg-[#151a22] p-2.5 rounded border border-[#1f2833]">
                    <span className="text-yellow-400 font-bold text-[10px] block mb-1">PROBABILITY RATIONALE</span>
                    <p className="text-gray-300 leading-relaxed text-[11px]">{market.rationale}</p>
                  </div>
                  <div className="bg-[#151a22] p-2.5 rounded border border-[#1f2833]">
                    <span className="text-[#00e676] font-bold text-[10px] block mb-1">RECOMMENDED ACTIONS</span>
                    <ul className="list-disc list-inside space-y-1 text-gray-400 text-[10px]">
                      <li>Wait for volume signature spikes before placing limit orders.</li>
                      <li>Avoid entry within the center POC band if RVol drops below 0.9.</li>
                      <li>Utilize yesterday's VAL / VAH limits for protective stop targets.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Time & Sales / Execution Ticker */}
        <div className="p-3 bg-[#0a0d12] overflow-y-auto space-y-2 flex flex-col justify-between">
          <div>
            <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-2 border-b border-[#1f2833] pb-1">
              TIME & SALES (ORDER FLOW)
            </div>
            <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
              {tradesHistory.map((t, i) => (
                <div key={i} className="flex justify-between items-center text-[10px] border-b border-gray-900/40 py-1 font-mono">
                  <span className="text-gray-500">{t.time}</span>
                  <span className={`font-semibold ${t.side === "BUY" ? "text-[#00e676]" : "text-[#ff1744]"}`}>
                    {t.price}
                  </span>
                  <span className="text-gray-400 font-black">{t.size}</span>
                  <span className={`px-1 rounded text-[8px] font-black ${
                    t.side === "BUY" ? "bg-[#00e67615] text-[#00e676]" : "bg-[#ff174415] text-[#ff1744]"
                  }`}>
                    {t.side}
                  </span>
                </div>
              ))}
              {tradesHistory.length === 0 && (
                <div className="text-gray-600 text-center py-8 italic text-[10px]">Awaiting trades printing...</div>
              )}
            </div>
          </div>

          <div className="bg-black/40 border border-gray-900 rounded p-2 text-[10px] text-gray-400 space-y-1 font-mono">
            <div className="text-yellow-400 font-bold uppercase mb-0.5 text-[9px]">REGIME ADVISORY</div>
            {market.regime === "CHOPPY" ? (
              <p className="text-red-400">AVOID: High risk of stop sweeps inside compressions. Capital preservation recommended.</p>
            ) : market.regime === "TRENDING_UP" ? (
              <p className="text-[#00e676]">BULLISH TREND: Favor buy-stops or pullbacks to POC. Keep size robust.</p>
            ) : market.regime === "TRENDING_DOWN" ? (
              <p className="text-[#ff1744]">BEARISH TREND: High momentum sell-offs. Sell rally pullbacks to VAH limits.</p>
            ) : (
              <p className="text-blue-400">RANGE ROTATION: Mean reversion buy/sell boundaries are yielding excellent edges.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
