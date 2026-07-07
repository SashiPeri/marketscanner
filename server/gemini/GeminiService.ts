import { GoogleGenAI, Type } from "@google/genai";
import { AIBriefing, MarketData } from "../types/market";
import { logger } from "../utils/logger";

export interface GeminiAnalysisResult {
  success: true;
  briefing: AIBriefing;
  isFallback: boolean;
}

export class GeminiService {
  private readonly ai: GoogleGenAI | null;

  constructor(geminiApiKey?: string) {
    if (geminiApiKey) {
      this.ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } else {
      this.ai = null;
      logger.warn("GEMINI_API_KEY is not defined. The app will run with rule-based fallback analysis.");
    }
  }

  async analyze(markets: MarketData[]): Promise<GeminiAnalysisResult> {
    if (!this.ai) {
      return {
        success: true,
        briefing: this.createFallbackBriefing(markets),
        isFallback: true,
      };
    }

    const response = await this.ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: this.createPrompt(markets),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dayOutlook: { type: Type.STRING },
            recommendedStrategy: { type: Type.STRING },
            focusList: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  symbol: { type: Type.STRING },
                  strategy: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                },
                required: ["symbol", "strategy", "rationale"],
              },
            },
            avoidList: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  symbol: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ["symbol", "reason"],
              },
            },
            regimeAlerts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["title", "severity", "description"],
              },
            },
            probabilityTips: { type: Type.STRING },
          },
          required: ["dayOutlook", "recommendedStrategy", "focusList", "avoidList", "regimeAlerts", "probabilityTips"],
        },
      },
    });

    return {
      success: true,
      briefing: JSON.parse(response.text.trim()),
      isFallback: false,
    };
  }

  private createPrompt(markets: MarketData[]): string {
    const marketSummary = markets.map((market) => {
      return `Symbol: ${market.symbol} (${market.name}), Last: ${market.lastPrice}, Net%: ${market.pctChange}%, RVol: ${market.rvol}, ATR: ${market.atr}, ADR_Exhaustion: ${market.adrFilledPct}%, VolumeProfile: [VAH:${market.vah}, POC:${market.poc}, VAL:${market.val}], CurrentRegime: ${market.regime}, CurrentScore: ${market.probScore}/100`;
    }).join("\n");

    return `You are a legendary institutional prop trading desk macro-analyst specializing in Volume Profile, Order Flow, and Market Regimes. Your task is to analyze the following scanned markets and produce an actionable Daily Market Scanner Intelligence Briefing in clean JSON format.

Our trading protocol relies heavily on:
1. Relative Volume (RVol) -> Values > 1.5 indicate institutional flow (high probability setups). Values < 0.8 indicate retail-only chop (avoid / bad markets).
2. ADR Filled % (Average Daily Range) -> If ADR is > 100%, momentum may be overextended (high mean-reversion potential, low breakout potential). If ADR is < 60%, there is ample "runway" for trend execution.
3. Volume Profile Boundaries (VAH, VAL, POC) -> Prices rotating inside VAH/VAL are choppy ranges. Prices breaking out of VAH/VAL with high RVol are high-probability trend trades.

Provide your response in JSON format with the following exact schema:
{
  "dayOutlook": "A 2-sentence macro summary of today's market conditions and where to focus.",
  "recommendedStrategy": "E.g., High-Volume Breakout Buying, Range Rotation Mean-Reversion, or Cash on Hands / Avoid.",
  "focusList": [
    {
      "symbol": "Ticker symbol",
      "strategy": "Actionable tactic (e.g. Pullback to POC, VWAP support, Breakout above VAH)",
      "rationale": "Brief professional rationale citing RVol, ADR, or Profile"
    }
  ],
  "avoidList": [
    {
      "symbol": "Ticker symbol",
      "reason": "Explicit risk citing chop, low volume, or exhaustion"
    }
  ],
  "regimeAlerts": [
    {
      "title": "Short title (e.g., USDJPY Bearish Expansion, ES Exhaustion Risk)",
      "severity": "HIGH | MEDIUM | LOW",
      "description": "Short explanation of the trigger setup."
    }
  ],
  "probabilityTips": "One major tip for traders today to enhance win rate."
}

Here are the current market scan datasets:
${marketSummary}`;
  }

  private createFallbackBriefing(markets: MarketData[]): AIBriefing {
    const highRvol = markets.filter((market) => market.rvol >= 1.3).slice(0, 2);
    const lowRvol = markets.filter((market) => market.rvol < 0.7 || market.regime === "CHOPPY").slice(0, 2);

    return {
      dayOutlook: "Today's macro environment presents strong divergent momentum in Index Futures and Cryptocurrencies, while traditional energies and bonds remain locked in low-liquidity horizontal ranges.",
      recommendedStrategy: "Prioritize High-Volume Breakout buying on Crypto leaders and indices breaking above yesterday's VAH. Strictly avoid energy and bond sectors today due to sub-optimal volume dynamics.",
      focusList: highRvol.map((market) => ({
        symbol: market.symbol,
        strategy: market.regime === "TRENDING_UP" ? "VWAP Pullback Entry" : "Support Rebound inside Value Area",
        rationale: `Strong Relative Volume (${market.rvol}) confirms institutional backing. Ample range remains to explore outside traditional profile values.`,
      })),
      avoidList: lowRvol.map((market) => ({
        symbol: market.symbol,
        reason: `Severe volume drought (RVol ${market.rvol}). Stuck inside a highly compressed Value Area. Elevated risk of stop-hunts and whip-saws.`,
      })),
      regimeAlerts: [
        {
          title: "Index High-Volume Momentum",
          severity: "HIGH",
          description: "ES and NQ are actively breaking historical distribution zones on heavy relative volume. Do not fade the breakout.",
        },
        {
          title: "Crude Oil Volume Drought",
          severity: "MEDIUM",
          description: "CL volume is 50% below its 10-day moving average. Avoid any positional or breakout bets until a volume surge is printed.",
        },
      ],
      probabilityTips: "Limit your trades to A+ and A rated assets today. Trading choppy C/F assets (like CL) will bleed your capital. Let the volume confirm the edge.",
    };
  }
}
