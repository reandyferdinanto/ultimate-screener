import { NextResponse } from "next/server";
import YahooFinance from 'yahoo-finance2';
import { persistTechnicalAnalysis } from "@/lib/market-data-store";
import { getActiveScreenerSignals } from "@/lib/screener-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Use technicalindicators for standard indicators (TA-Lib algorithms)
import { RSI, MACD, EMA } from 'technicalindicators';

// Keep custom implementations for proprietary indicators
import {
  calculateMFI,
  calculateSqueezeDeluxe,
  calculateAO,
  detectAODivergence,
  detectAOMomentumShift
} from "@/lib/indicators";

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function formatIdxPrice(value: number) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function formatPct(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function aggregateWibQuotesByHours(quotes: any[], hours: number) {
  const bucketSeconds = hours * 60 * 60;
  const buckets = new Map<number, any>();

  for (const quote of quotes) {
    const bucketStart = Math.floor(Number(quote.time) / bucketSeconds) * bucketSeconds;
    const existing = buckets.get(bucketStart);

    if (!existing) {
      buckets.set(bucketStart, { ...quote, time: bucketStart });
      continue;
    }

    existing.high = Math.max(existing.high, quote.high);
    existing.low = Math.min(existing.low, quote.low);
    existing.close = quote.close;
    existing.volume += quote.volume || 0;
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

/**
 * Detect accumulation patterns
 * Price consolidates or drifts lower while volume indicators show buying pressure
 */
function detectAccumulation(quotes: any[], lookback = 20) {
  if (quotes.length < lookback) return { isAccumulating: false, strength: 0, details: "" };
  
  const recent = quotes.slice(-lookback);
  const last = quotes[quotes.length - 1];
  const first = recent[0];
  
  // Price action: sideways or slightly down
  const priceChange = ((last.close - first.close) / first.close) * 100;
  const isPriceFlat = priceChange > -5 && priceChange < 3;
  
  // MFI improving (money flowing in)
  let mfiImproving = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].mfi > recent[i-1].mfi) mfiImproving++;
  }
  const mfiStrength = (mfiImproving / (recent.length - 1)) * 100;
  
  // Volume patterns
  const avgVolume = recent.reduce((sum, q) => sum + q.volume, 0) / recent.length;
  const recentVolume = recent.slice(-5).reduce((sum, q) => sum + q.volume, 0) / 5;
  const volumeIncreasing = recentVolume > avgVolume * 1.1;
  
  // Squeeze building (volatility compression)
  const inSqueeze = last.squeezeDeluxe?.squeeze?.low || 
                    last.squeezeDeluxe?.squeeze?.mid || 
                    last.squeezeDeluxe?.squeeze?.high;
  
  const isAccumulating = isPriceFlat && mfiStrength > 50 && (volumeIncreasing || inSqueeze);
  const strength = Math.min(100, Math.round((mfiStrength * 0.6) + (volumeIncreasing ? 20 : 0) + (inSqueeze ? 20 : 0)));
  
  let details = "";
  if (isAccumulating) {
    details = `Accumulation detected: Price ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% over ${lookback} bars, `;
    details += `MFI improving ${mfiStrength.toFixed(0)}% of the time`;
    if (volumeIncreasing) details += ", volume increasing";
    if (inSqueeze) details += ", volatility compressing";
  }
  
  return { isAccumulating, strength, details };
}

/**
 * Check if price is bouncing off any EMA line
 */
function detectEmaBounce(quotes: any[]) {
  const last = quotes[quotes.length - 1];
  const prev = quotes[quotes.length - 2] || last;
  
  const emaLines = [
    { name: "EMA9", value: last.ema9, prev: prev.ema9 },
    { name: "EMA20", value: last.ema20, prev: prev.ema20 },
    { name: "EMA60", value: last.ema60, prev: prev.ema60 },
    { name: "EMA200", value: last.ema200, prev: prev.ema200 }
  ];
  
  for (const ema of emaLines) {
    if (!Number.isFinite(ema.value)) continue;
    
    // Check if price touched or went below EMA and is now above
    const touchedEma = last.low <= ema.value * 1.01; // Within 1%
    const nowAbove = last.close > ema.value;
    const emaRising = ema.value > ema.prev;
    
    if (touchedEma && nowAbove && emaRising) {
      const distancePct = ((last.close - ema.value) / ema.value) * 100;
      return {
        isBouncing: true,
        emaLine: ema.name,
        emaValue: ema.value,
        distancePct,
        details: `Price bounced off ${ema.name} (${formatIdxPrice(ema.value)}), now ${distancePct.toFixed(2)}% above`
      };
    }
  }
  
  return { isBouncing: false, emaLine: null, emaValue: null, distancePct: 0, details: "" };
}

/**
 * Assess market structure quality
 */
function assessMarketStructure(quotes: any[]) {
  const last = quotes[quotes.length - 1];
  
  // EMA alignment (bullish structure)
  const emaAligned = last.ema9 > last.ema20 && last.ema20 > last.ema60;
  
  // Price above key EMAs
  const aboveEma20 = last.close > last.ema20;
  const aboveEma60 = last.close > last.ema60;
  
  // EMAs trending up
  const ema20Rising = quotes.length >= 5 && 
    last.ema20 > quotes[quotes.length - 5].ema20;
  
  let score = 0;
  let details = [];
  
  if (emaAligned) { score += 30; details.push("EMA alignment bullish"); }
  if (aboveEma20) { score += 25; details.push("Price above EMA20"); }
  if (aboveEma60) { score += 20; details.push("Price above EMA60"); }
  if (ema20Rising) { score += 25; details.push("EMA20 trending up"); }
  
  const quality = score >= 70 ? "GOOD" : score >= 50 ? "FAIR" : "POOR";
  
  return {
    quality,
    score,
    details: details.join(", "),
    emaAligned,
    aboveEma20,
    ema20Rising
  };
}

/**
 * Generate divergence-focused conviction report
 */
function generateDivergenceReport(quotes: any[], timeframe: string) {
  const last = quotes[quotes.length - 1];
  const prev = quotes[quotes.length - 2] || last;
  
  // Get divergence signals
  const squeezeDivergence = {
    bullish: last.squeezeDeluxe?.isBullDiv || false,
    bearish: last.squeezeDeluxe?.isBearDiv || false
  };
  
  const aoDivergence = {
    bullish: last.aoDivergence?.bullish || false,
    bearish: last.aoDivergence?.bearish || false
  };
  
  // Check for any divergence
  const hasBullishDivergence = squeezeDivergence.bullish || aoDivergence.bullish;
  const hasBearishDivergence = squeezeDivergence.bearish || aoDivergence.bearish;
  
  // Market structure
  const marketStructure = assessMarketStructure(quotes);
  
  // EMA bounce
  const emaBounce = detectEmaBounce(quotes);
  
  // Accumulation
  const accumulation = detectAccumulation(quotes);
  
  // RSI and MFI levels
  const rsi = last.rsi || 50;
  const mfi = last.mfi || 50;
  const rsiOversold = rsi < 35;
  const rsiOverbought = rsi > 70;
  const mfiOversold = mfi < 25;
  
  // Squeeze state
  const sqz = last.squeezeDeluxe;
  const inSqueeze = sqz?.squeeze?.low || sqz?.squeeze?.mid || sqz?.squeeze?.high;
  let squeezeIntensity = 0;
  if (sqz?.squeeze?.high) squeezeIntensity = 3;
  else if (sqz?.squeeze?.mid) squeezeIntensity = 2;
  else if (sqz?.squeeze?.low) squeezeIntensity = 1;
  
  // AO momentum
  const aoAccelerating = last.aoMomentum?.accelerating || false;
  const aoDecelerating = last.aoMomentum?.decelerating || false;
  
  // Determine if we should generate a report
  const shouldReport = 
    hasBullishDivergence || 
    hasBearishDivergence || 
    marketStructure.quality === "GOOD" ||
    emaBounce.isBouncing ||
    accumulation.isAccumulating;
  
  if (!shouldReport) {
    return {
      shouldReport: false,
      verdict: "NO SIGNAL",
      conviction: 0,
      details: "No divergence, good structure, EMA bounce, or accumulation detected",
      color: "var(--text-secondary)"
    };
  }
  
  // Build conviction score (0-100)
  let conviction = 0;
  let signals = [];
  let verdict = "";
  let color = "var(--text-secondary)";
  
  // Divergence signals (highest priority)
  if (hasBullishDivergence) {
    conviction += 40;
    if (squeezeDivergence.bullish && aoDivergence.bullish) {
      signals.push("🔥 DOUBLE BULLISH DIVERGENCE (Squeeze + AO)");
      conviction += 20;
    } else if (squeezeDivergence.bullish) {
      signals.push("📈 Squeeze Bullish Divergence");
    } else if (aoDivergence.bullish) {
      signals.push("📈 AO Bullish Divergence");
    }
  }
  
  if (hasBearishDivergence) {
    conviction += 30;
    if (squeezeDivergence.bearish && aoDivergence.bearish) {
      signals.push("⚠️ DOUBLE BEARISH DIVERGENCE (Squeeze + AO)");
      conviction += 15;
    } else if (squeezeDivergence.bearish) {
      signals.push("📉 Squeeze Bearish Divergence");
    } else if (aoDivergence.bearish) {
      signals.push("📉 AO Bearish Divergence");
    }
  }
  
  // Market structure bonus
  if (marketStructure.quality === "GOOD") {
    conviction += 20;
    signals.push(`✅ Good Market Structure (${marketStructure.score}/100)`);
  } else if (marketStructure.quality === "FAIR") {
    conviction += 10;
    signals.push(`⚡ Fair Market Structure (${marketStructure.score}/100)`);
  }
  
  // EMA bounce
  if (emaBounce.isBouncing) {
    conviction += 15;
    signals.push(`🎯 ${emaBounce.emaLine} Bounce`);
  }
  
  // Accumulation
  if (accumulation.isAccumulating) {
    conviction += 15;
    signals.push(`💰 Accumulation Detected (${accumulation.strength}%)`);
  }
  
  // Squeeze compression bonus
  if (inSqueeze && hasBullishDivergence) {
    conviction += 10;
    signals.push(`⚡ Squeeze Compression (Intensity: ${squeezeIntensity})`);
  }
  
  // RSI/MFI confirmation
  if (hasBullishDivergence && (rsiOversold || mfiOversold)) {
    conviction += 10;
    signals.push(`📊 Oversold Confirmation (RSI: ${rsi.toFixed(0)}, MFI: ${mfi.toFixed(0)})`);
  }
  
  // AO momentum confirmation
  if (hasBullishDivergence && aoAccelerating) {
    conviction += 10;
    signals.push("🚀 AO Accelerating");
  }
  
  if (hasBearishDivergence && aoDecelerating) {
    conviction += 10;
    signals.push("⬇️ AO Decelerating");
  }
  
  // Cap conviction at 100
  conviction = Math.min(100, conviction);
  
  // Determine verdict and color
  if (hasBullishDivergence && conviction >= 70) {
    verdict = "HIGH CONVICTION BULLISH DIVERGENCE";
    color = "oklch(0.85 0.25 150)";
  } else if (hasBullishDivergence && conviction >= 50) {
    verdict = "BULLISH DIVERGENCE SETUP";
    color = "oklch(0.78 0.2 165)";
  } else if (hasBearishDivergence && conviction >= 60) {
    verdict = "BEARISH DIVERGENCE WARNING";
    color = "oklch(0.7 0.2 40)";
  } else if (emaBounce.isBouncing && marketStructure.quality === "GOOD") {
    verdict = "EMA BOUNCE WITH GOOD STRUCTURE";
    color = "oklch(0.82 0.18 180)";
  } else if (accumulation.isAccumulating && marketStructure.quality === "GOOD") {
    verdict = "ACCUMULATION PHASE";
    color = "oklch(0.80 0.18 200)";
  } else if (marketStructure.quality === "GOOD") {
    verdict = "GOOD MARKET STRUCTURE";
    color = "oklch(0.75 0.15 190)";
  } else {
    verdict = "POTENTIAL SETUP FORMING";
    color = "oklch(0.72 0.12 180)";
  }
  
  // Build detailed report
  const details = signals.join(" | ");
  
  // Add context
  let context = `Timeframe: ${timeframe} | `;
  context += `RSI: ${rsi.toFixed(0)} | MFI: ${mfi.toFixed(0)} | `;
  context += `Squeeze: ${inSqueeze ? 'Active' : 'None'} | `;
  context += `AO: ${last.ao?.toFixed(2) || 'N/A'}`;
  
  return {
    shouldReport: true,
    verdict,
    conviction,
    details,
    context,
    color,
    signals,
    divergence: {
      squeeze: squeezeDivergence,
      ao: aoDivergence
    },
    marketStructure,
    emaBounce,
    accumulation,
    indicators: {
      rsi,
      mfi,
      ao: last.ao,
      squeezeIntensity,
      aoAccelerating,
      aoDecelerating
    }
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "^JKSE";
  let interval = searchParams.get("interval") || "1d";
  const originalInterval = interval;

  // Yahoo Finance doesn't support 4h and 2h natively
  if (interval === "4h" || interval === "2h") interval = "1h";

  try {
    const period2 = new Date();
    const period1 = new Date();
    
    // Adjust lookback based on timeframe
    if (originalInterval === "5m") {
      period1.setDate(period1.getDate() - 7); 
    } else if (originalInterval === "15m") {
      period1.setDate(period1.getDate() - 30);
    } else if (originalInterval === "1h") {
      period1.setDate(period1.getDate() - 90);
    } else if (originalInterval === "2h" || originalInterval === "4h") {
      period1.setDate(period1.getDate() - 180);
    } else {
      period1.setFullYear(period1.getFullYear() - 5);
    }

    const result: any = await yahooFinance.chart(symbol, {
      period1,
      period2,
      interval: interval as any,
    });

    if (!result || !result.quotes || result.quotes.length === 0) {
      return NextResponse.json({ success: false, error: "No data found" }, { status: 404 });
    }

    let quotes = result.quotes.filter((q: any) => q.close !== null).map((q: any) => {
      const utcTime = Math.floor(new Date(q.date).getTime() / 1000);
      const wibTime = utcTime + (7 * 3600);
      
      return {
        time: wibTime,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume,
      };
    });

    // Aggregate to 2h or 4h if requested
    if (originalInterval === "2h") {
      quotes = aggregateWibQuotesByHours(quotes, 2);
    } else if (originalInterval === "4h") {
      quotes = aggregateWibQuotesByHours(quotes, 4);
    }

    const closes = quotes.map((q: any) => q.close);
    
    // Calculate indicators using technicalindicators (TA-Lib algorithms)
    // EMA calculations
    const ema9 = EMA.calculate({ values: closes, period: 9 });
    const ema20 = EMA.calculate({ values: closes, period: 20 });
    const ema60 = EMA.calculate({ values: closes, period: 60 });
    const ema200 = EMA.calculate({ values: closes, period: 200 });
    
    // Pad EMA arrays to match quotes length (technicalindicators returns shorter arrays)
    const padEMA = (emaValues: number[], period: number) => {
      const padding = new Array(period - 1).fill(null);
      return [...padding, ...emaValues];
    };
    
    const ema9Padded = padEMA(ema9, 9);
    const ema20Padded = padEMA(ema20, 20);
    const ema60Padded = padEMA(ema60, 60);
    const ema200Padded = padEMA(ema200, 200);
    
    // RSI calculation
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const rsiPadded = padEMA(rsiValues, 14);
    
    // MACD calculation (for future use)
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const macdPadded = new Array(33).fill(null).concat(macdValues);
    
    // Keep custom implementations for proprietary indicators
    const mfi = calculateMFI(quotes, 14);
    const squeezeDeluxe = calculateSqueezeDeluxe(quotes);
    const ao = calculateAO(quotes);
    const aoDivergence = detectAODivergence(quotes, ao);
    const aoMomentum = detectAOMomentumShift(ao);

    const data = quotes.map((q: any, i: number) => {
      const macdData = macdPadded[i];
      return {
        ...q,
        ema9: ema9Padded[i],
        ema20: ema20Padded[i],
        ema60: ema60Padded[i],
        ema200: ema200Padded[i],
        rsi: rsiPadded[i],
        mfi: mfi[i],
        macd: macdData ? {
          macd: macdData.MACD,
          signal: macdData.signal,
          histogram: macdData.histogram
        } : null,
        squeezeDeluxe: squeezeDeluxe[i],
        ao: ao[i],
        aoDivergence: {
          bullish: aoDivergence.bullishDivergence[i],
          bearish: aoDivergence.bearishDivergence[i]
        },
        aoMomentum: {
          accelerating: aoMomentum.accelerating[i],
          decelerating: aoMomentum.decelerating[i]
        }
      };
    });

    // Calculate pivot points
    const prevDay = quotes[quotes.length - 2] || quotes[quotes.length - 1];
    const pivots = {
      p: (prevDay.high + prevDay.low + prevDay.close) / 3,
      r1: 2 * ((prevDay.high + prevDay.low + prevDay.close) / 3) - prevDay.low,
      s1: 2 * ((prevDay.high + prevDay.low + prevDay.close) / 3) - prevDay.high,
      r2: ((prevDay.high + prevDay.low + prevDay.close) / 3) + (prevDay.high - prevDay.low),
      s2: ((prevDay.high + prevDay.low + prevDay.close) / 3) - (prevDay.high - prevDay.low),
      r3: prevDay.high + 2 * (((prevDay.high + prevDay.low + prevDay.close) / 3) - prevDay.low),
      s3: prevDay.low - 2 * (prevDay.high - ((prevDay.high + prevDay.low + prevDay.close) / 3))
    };

    // Generate divergence-focused report
    const divergenceReport = generateDivergenceReport(data, originalInterval);

    // Get screener context
    const activeScreenerSignals = await getActiveScreenerSignals(symbol, 5);

    // Persist analysis
    const persistence = await persistTechnicalAnalysis({
      symbol,
      timeframe: originalInterval,
      candles: quotes,
      indicators: data,
      analysis: divergenceReport
    });

    console.log(`[API] ${symbol} ${originalInterval} divergence analysis: ${divergenceReport.verdict}, conviction=${divergenceReport.conviction}%`);

    return NextResponse.json({
      success: true,
      data,
      pivots,
      divergenceReport,
      screenerContext: activeScreenerSignals[0] || null,
      activeScreenerSignals,
      _debug: {
        conviction: divergenceReport.conviction,
        shouldReport: divergenceReport.shouldReport,
        persistence
      },
      ticker: symbol
    });
  } catch (error: any) {
    console.error(`Technical API Error for ${symbol}:`, error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Made with Bob
