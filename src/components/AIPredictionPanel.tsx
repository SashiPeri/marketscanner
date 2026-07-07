import { useState } from "react";
import { AIBriefing } from "../types";
import { Sparkles, BrainCircuit, ShieldAlert, BadgeHelp, CheckCircle2, RefreshCw, Layers } from "lucide-react";

interface AIPredictionPanelProps {
  briefing: AIBriefing | null;
  isLoading: boolean;
  onRefresh: () => void;
  isFallback: boolean;
}

export default function AIPredictionPanel({ briefing, isLoading, onRefresh, isFallback }: AIPredictionPanelProps) {
  return (
    <div className="bg-[#0b0c10] border-2 border-[#1f2833] rounded overflow-hidden font-mono flex flex-col h-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1f2833] to-[#0b0c10] px-4 py-2.5 border-b border-[#0b0c10] flex justify-between items-center">
        <span className="text-[#45f3ff] font-bold text-xs flex items-center gap-2 uppercase tracking-widest">
          <BrainCircuit className="w-4 h-4 text-orange-500 animate-pulse" />
          GEMINI COGNITIVE DAILY INTELLIGENCE BRIEF
        </span>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="bg-black hover:bg-[#1a222d] border border-[#1f2833] text-orange-400 hover:text-orange-300 rounded px-2.5 py-1 text-[10px] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin text-orange-500" : ""}`} />
          {isLoading ? "CALCULATING..." : "RE-RUN SCANNER AI"}
        </button>
      </div>

      <div className="p-4 flex-1 overflow-auto space-y-4">
        {isFallback && (
          <div className="bg-yellow-950/20 border border-yellow-700/40 rounded p-2.5 text-[10px] text-yellow-300 flex items-start gap-2">
            <span className="inline-block bg-yellow-500 text-black px-1 rounded font-bold">INFO</span>
            <p>
              Demo mode active (rule-based intelligence model). Enter your own Gemini API Key in the Secrets pane to enable custom LLM institutional volume profile reports.
            </p>
          </div>
        )}

        {/* Macro Outlook */}
        <div className="bg-black border border-gray-900 rounded p-3 space-y-1.5">
          <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wide">
            I. DAILY MACRO REGIME OUTLOOK
          </div>
          <p className="text-gray-200 text-xs leading-relaxed">
            {briefing?.dayOutlook || "Initiating global order flow scan..."}
          </p>
        </div>

        {/* Recommended Core Strategy */}
        <div className="bg-black border border-gray-900 rounded p-3 flex justify-between items-center">
          <div>
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">
              II. SYSTEM RECOMMENDED TACTIC
            </div>
            <p className="text-[#00ffcc] font-extrabold text-sm uppercase mt-0.5">
              {briefing?.recommendedStrategy || "Awaiting Scan Result..."}
            </p>
          </div>
          <div className="p-1.5 bg-[#00ffcc]/10 rounded border border-[#00ffcc]/20">
            <Sparkles className="w-5 h-5 text-[#00ffcc]" />
          </div>
        </div>

        {/* Focus List (Good Markets) vs Avoid List (Bad Markets) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Focus List */}
          <div className="bg-black border border-green-900/30 rounded p-3 space-y-2">
            <div className="text-[11px] text-[#00e676] font-bold uppercase tracking-wide flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              HIGH-PROBABILITY ALIGNED (PLAY)
            </div>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {briefing?.focusList.map((f, i) => (
                <div key={i} className="bg-[#151a22] p-2 rounded border border-[#1f2833] text-[11px]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[#00ffcc] font-bold text-xs">{f.symbol}</span>
                    <span className="bg-[#00e67615] text-[#00e676] border border-[#00e67633] px-1 py-0.2 rounded text-[9px] font-bold uppercase">
                      BUYING ZONE Aligned
                    </span>
                  </div>
                  <div className="text-white font-semibold text-[10px] mb-0.5">Tactical: {f.strategy}</div>
                  <p className="text-gray-400 text-[10px] leading-relaxed">{f.rationale}</p>
                </div>
              ))}
              {!briefing?.focusList.length && (
                <div className="text-gray-500 text-xs py-4 text-center">No assets found in target grade.</div>
              )}
            </div>
          </div>

          {/* Avoid List */}
          <div className="bg-black border border-red-950/30 rounded p-3 space-y-2">
            <div className="text-[11px] text-[#ff1744] font-bold uppercase tracking-wide flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              CHOP/RISK ZONE EXHAUSTION (AVOID)
            </div>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {briefing?.avoidList.map((av, i) => (
                <div key={i} className="bg-[#151a22] p-2 rounded border border-[#ff174415] text-[11px]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-red-400 font-bold text-xs">{av.symbol}</span>
                    <span className="bg-[#ff174415] text-[#ff1744] border border-[#ff174433] px-1 py-0.2 rounded text-[9px] font-bold uppercase">
                      DO NOT TOUCH
                    </span>
                  </div>
                  <p className="text-gray-400 text-[10px] leading-relaxed">{av.reason}</p>
                </div>
              ))}
              {!briefing?.avoidList.length && (
                <div className="text-gray-500 text-xs py-4 text-center">All scanned assets have stable profiles.</div>
              )}
            </div>
          </div>
        </div>

        {/* Regime Alerts */}
        <div className="bg-black border border-gray-900 rounded p-3 space-y-2">
          <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-orange-500" />
            III. INTRADAY REGIME & ORDER FLOW ALERTS
          </div>
          <div className="space-y-2">
            {briefing?.regimeAlerts.map((alert, i) => (
              <div key={i} className="flex gap-2 p-2 bg-[#12161a] border border-gray-800 rounded text-xs items-start">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                  alert.severity === "HIGH" 
                    ? "bg-[#ff174422] text-[#ff1744] border border-[#ff174455]" 
                    : alert.severity === "MEDIUM"
                      ? "bg-[#ff910022] text-[#ff9100] border border-[#ff910055]"
                      : "bg-[#2979ff22] text-[#2979ff] border border-[#2979ff55]"
                }`}>
                  {alert.severity}
                </span>
                <div>
                  <div className="text-white font-bold text-[11px]">{alert.title}</div>
                  <p className="text-gray-400 text-[10px] mt-0.5">{alert.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trading Edge Tip */}
        <div className="bg-[#1a222d] border border-[#45f3ff]/20 rounded p-3">
          <div className="flex gap-2.5 items-center">
            <div className="text-[#45f3ff] bg-black p-1 rounded">
              <BadgeHelp className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <div className="text-[#45f3ff] font-bold text-[10px] uppercase">PROBABILITY ENHANCER TIP</div>
              <p className="text-gray-300 text-[11px] mt-0.5 italic">
                "{briefing?.probabilityTips || "Focus only on asset pools displaying relative volume (RVol) > 1.3 to avoid late-day slippage."}"
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
