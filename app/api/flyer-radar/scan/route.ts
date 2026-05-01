import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const dynamic = "force-dynamic";

interface Quote {
  close: number;
  ema20: number;
  ema9: number;
  ema60: number;
  sma50: number;
  rsi: number;
  mfi: number;
  obv: number;
  cmf: number;
  ad: number;
  forceIndex: number;
  vwap: number;
  volume: number;
  high: number;
  low: number;
  squeezeDeluxe?: any;
}

function calculateEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      ema.push(closes[i]);
    } else if (i < period) {
      const sum = closes.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
      ema.push(sum);
    } else {
      ema.push(closes[i] * k + ema[i - 1] * (1 - k));
    }
  }
  return ema;
}

function calculateRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = [];
  let gains = 0, losses = 0;
  
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      rsi.push(50);
    } else {
      const change = closes[i] - closes[i - 1];
      gains = change > 0 ? (gains * (period - 1) + change) / period : gains * (period - 1) / period;
      losses = change < 0 ? (losses * (period - 1) + Math.abs(change)) / period : losses * (period - 1) / period;
      const rs = gains / (losses || 1);
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  return rsi;
}

function calculateMFI(quotes: any[], period = 14): number[] {
  const mfi: number[] = [];
  for (let i = 0; i < quotes.length; i++) {
    if (i < period) {
      mfi.push(50);
      continue;
    }
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const typical = (quotes[j].high + quotes[j].low + quotes[j].close) / 3;
      const prevTypical = (quotes[j - 1].high + quotes[j - 1].low + quotes[j - 1].close) / 3;
      const moneyFlow = typical * quotes[j].volume;
      if (typical > prevTypical) posFlow += moneyFlow;
      else negFlow += moneyFlow;
    }
    const mr = posFlow / (negFlow || 1);
    mfi.push(100 - (100 / (1 + mr)));
  }
  return mfi;
}

function calculateSqueezeDeluxeSimple(quotes: any[]): any[] {
  const result = [];
  const lookback = 20;
  
  for (let i = 0; i < quotes.length; i++) {
    if (i < lookback) {
      result.push({
        momentum: 0,
        signal: 0,
        flux: 0,
        buySignal: false,
        isBullDiv: false,
        squeeze: { low: false, mid: false, high: false }
      });
      continue;
    }
    
    const recent = quotes.slice(Math.max(0, i - lookback), i + 1);
    const avgVolume = recent.reduce((sum, q) => sum + q.volume, 0) / recent.length;
    const currentVolume = quotes[i].volume;
    const volumeRatio = currentVolume / (avgVolume || 1);
    
    const mom = i >= 1 ? quotes[i].close - quotes[i - 1].close : 0;
    const prevMom = i >= 2 ? quotes[i - 1].close - quotes[i - 2].close : mom;
    const signalVal = mom * 0.8 + prevMom * 0.2;
    const fluxVal = (volumeRatio - 1) * 10 + (quotes[i].close > quotes[i - 1].close ? 2 : -2);
    
    const range = Math.max(...recent.map(q => q.high)) - Math.min(...recent.map(q => q.low));
    const tightRange = (quotes[i].high - quotes[i].low) < range * 0.3;
    
    result.push({
      momentum: mom,
      signal: signalVal,
      flux: fluxVal,
      buySignal: mom > 0 && fluxVal > 0 && tightRange,
      isBullDiv: mom > prevMom && quotes[i].close < quotes[i - 1].close,
      squeeze: tightRange ? { low: true, mid: true, high: false } : { low: false, mid: false, high: false }
    });
  }
  
  return result;
}

function analyzeSilentFlyer(quotes: Quote[], squeezeData: any[]): {
  isSilentFlyer: boolean;
  confidence: number;
  squeezeDuration: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  reason: string;
} {
  const last = quotes[quotes.length - 1];
  const prev = quotes[quotes.length - 2];
  const prev5 = quotes[Math.max(0, quotes.length - 6)];
  
  if (!last || !prev) {
    return { isSilentFlyer: false, confidence: 0, squeezeDuration: 0, entryPrice: 0, targetPrice: 0, stopLoss: 0, reason: "Insufficient data" };
  }
  
  // Must be above EMA20 (not in downtrend)
  if (last.close < last.ema20) {
    return { isSilentFlyer: false, confidence: 0, squeezeDuration: 0, entryPrice: 0, targetPrice: 0, stopLoss: 0, reason: "Below EMA20" };
  }
  
  // Calculate squeeze duration
  let squeezeDuration = 0;
  for (let i = quotes.length - 1; i >= 0; i--) {
    const sqz = squeezeData[i];
    if (sqz && (sqz.squeeze.low || sqz.squeeze.mid || sqz.squeeze.high)) {
      squeezeDuration++;
    } else {
      break;
    }
  }
  
  // SILENT FLYER: Long squeeze + momentum building + RSI/MFI supportive
  // Need squeeze duration >= 8 bars (strong compression)
  if (squeezeDuration < 8) {
    return { isSilentFlyer: false, confidence: 0, squeezeDuration, entryPrice: 0, targetPrice: 0, stopLoss: 0, reason: `Squeeze only ${squeezeDuration} bars (need 8+)` };
  }
  
  // RSI supportive: not overbought (30-65 ideal for bounce)
  const rsiOk = last.rsi >= 30 && last.rsi <= 65;
  if (!rsiOk) {
    return { isSilentFlyer: false, confidence: 0, squeezeDuration, entryPrice: 0, targetPrice: 0, stopLoss: 0, reason: `RSI ${last.rsi.toFixed(1)} not supportive` };
  }
  
  // MFI supportive: not extreme (30-70 ideal)
  const mfiOk = last.mfi >= 30 && last.mfi <= 70;
  if (!mfiOk) {
    return { isSilentFlyer: false, confidence: 0, squeezeDuration, entryPrice: 0, targetPrice: 0, stopLoss: 0, reason: `MFI ${last.mfi.toFixed(1)} not supportive` };
  }
  
  // Volume indicators supportive
  const volumeScore = 
    (last.obv > prev.obv ? 1 : 0) +
    (last.cmf > 0 ? 1 : 0) +
    (last.ad > prev.ad ? 1 : 0) +
    (last.forceIndex > 0 ? 1 : 0) +
    (last.close > last.vwap ? 1 : 0);
  
  if (volumeScore < 3) {
    return { isSilentFlyer: false, confidence: 0, squeezeDuration, entryPrice: 0, targetPrice: 0, stopLoss: 0, reason: `Volume score ${volumeScore}/5 weak` };
  }
  
  // Momentum starting to build (just after squeeze)
  const lastSqz = squeezeData[squeezeData.length - 1];
  const momImproving = lastSqz.momentum > lastSqz.signal || lastSqz.momentum > 0;
  
  // Calculate entry, target, stop
  const entryPrice = last.close;
  const distFromEma20 = ((last.close - last.ema20) / last.ema20) * 100;
  
  // Target: 30%+ for Silent Flyer (as per user requirement)
  const targetMultiplier = 1.30 + (distFromEma20 < 2 ? 0.05 : 0);
  const targetPrice = Math.round(entryPrice * targetMultiplier);
  
  // Stop loss: Below EMA20 or recent low
  const recentLows = quotes.slice(-5).map(q => q.low);
  const stopLoss = Math.round(Math.min(last.ema20, Math.min(...recentLows)) * 0.995);
  
  // Confidence score based on multiple factors
  let confidence = 60;
  confidence += Math.min(15, squeezeDuration * 1.5); // Squeeze duration bonus
  confidence += rsiOk && last.rsi >= 40 && last.rsi <= 60 ? 15 : 5; // RSI sweet spot
  confidence += mfiOk && last.mfi >= 40 && last.mfi <= 60 ? 10 : 5; // MFI sweet spot
  confidence += volumeScore >= 4 ? 10 : 0;
  confidence += momImproving ? 10 : 0;
  confidence += distFromEma20 <= 3 ? 10 : Math.max(0, 10 - distFromEma20);
  
  const reason = `Squeeze ${squeezeDuration}d, RSI ${last.rsi.toFixed(0)}, MFI ${last.mfi.toFixed(0)}, Vol ${volumeScore}/5, Dist ${distFromEma20.toFixed(1)}%`;
  
  return {
    isSilentFlyer: true,
    confidence: Math.min(100, confidence),
    squeezeDuration,
    entryPrice,
    targetPrice,
    stopLoss,
    reason
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  
  try {
    if (ticker) {
      // Analyze single ticker
      const symbol = ticker.replace('.JK', '') + '.JK';
      const result = await yahooFinance.chart(symbol, { period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), period2: new Date(), interval: '1d' });
      
      if (!result.quotes || result.quotes.length < 30) {
        return NextResponse.json({ success: false, error: "Insufficient data" });
      }
      
      const closes = result.quotes.filter((q: any) => q.close !== null).map((q: any) => q.close);
      const quotes = result.quotes.filter((q: any) => q.close !== null).map((q: any, i: number) => {
        const ema20 = calculateEMA(closes, 20);
        const ema9 = calculateEMA(closes, 9);
        const ema60 = calculateEMA(closes, 60);
        const sma50 = calculateEMA(closes, 50);
        const rsi = calculateRSI(closes);
        const mfi = calculateMFI(result.quotes.filter((q: any) => q.close !== null));
        
        return {
          close: q.close,
          ema20: ema20[i],
          ema9: ema9[i],
          ema60: ema60[i],
          sma50: sma50[i],
          rsi: rsi[i],
          mfi: mfi[i],
          obv: 0, // simplified
          cmf: 0,
          ad: 0,
          forceIndex: 0,
          vwap: q.close,
          volume: q.volume || 0,
          high: q.high,
          low: q.low,
        };
      });
      
      const squeezeData = calculateSqueezeDeluxeSimple(quotes);
      const analysis = analyzeSilentFlyer(quotes, squeezeData);
      
      return NextResponse.json({
        success: true,
        ticker,
        analysis,
        lastPrice: quotes[quotes.length - 1].close
      });
    }
    
    // Return available silent flyers from DB
    await connectToDatabase();
    const { StockSignalModel } = await import("@/lib/models/StockSignal");
    
    const signals = await StockSignalModel.find({
      status: "pending",
      signalSource: { $regex: /SILENT FLYER/i }
    }).sort({ relevanceScore: -1 }).limit(50).lean();
    
    return NextResponse.json({
      success: true,
      count: signals.length,
      data: signals.map((s: any) => ({
        ticker: s.ticker,
        strategy: s.signalSource,
        buyArea: s.entryPrice,
        tp: s.targetPrice,
        sl: s.stopLossPrice,
        currentPrice: s.currentPrice,
        relevanceScore: s.relevanceScore,
        sector: s.sector,
        metadata: s.metadata
      }))
    });
    
  } catch (error) {
    console.error("Silent Flyer API Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}