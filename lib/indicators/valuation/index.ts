import { OHLCV } from '../types';

export interface FibonacciLevels {
  h0: number;    // 0%
  h236: number;  // 23.6%
  h382: number;  // 38.2%
  h500: number;  // 50%
  h618: number;  // 61.8%
  h786: number;  // 78.6%
  h100: number;  // 100%
  h1618?: number; // 161.8% (Target)
  h2618?: number; // 261.8% (Extended Target)
}

/**
 * Automates Fibonacci Drawing based on the largest wave detected in the sample.
 * Supports Upside Targets (Extension) and Downside Limits (Retracement).
 */
export function calculateElliottFibonacci(quotes: OHLCV[], lookback = 250, squeezeDeluxe?: any[], pivots: any[] = []) {
  if (quotes.length < 50) return null; // Minimum data safety

  // Use a larger window to find the "Major Cycle"
  const actualLookback = Math.min(quotes.length, lookback);
  const slice = quotes.slice(-actualLookback);
  const highs = slice.map(q => q.high);
  const lows = slice.map(q => q.low);

  // 1. Find the Absolute Peak (Potential W3 or W5)
  const maxPrice = Math.max(...highs);
  const maxIdxInSlice = highs.indexOf(maxPrice);
  const maxIdxGlobal = (quotes.length - actualLookback) + maxIdxInSlice;

  // 2. Find the "True Origin" (Wave 0)
  // We look for the lowest point BEFORE the absolute peak to identify the start of the trend
  const prePeakLows = slice.slice(0, maxIdxInSlice + 1).map(q => q.low);
  const minPrice = Math.min(...prePeakLows);
  const minIdxInSlice = prePeakLows.indexOf(minPrice);
  const minIdxGlobal = (quotes.length - actualLookback) + minIdxInSlice;

  const diff = maxPrice - minPrice;
  const isUpTrend = maxIdxGlobal > minIdxGlobal && diff > 0;

  // RECONCILIATION: Check if this is a "Bottoming Squeeze"
  const lastSqz = squeezeDeluxe ? squeezeDeluxe[squeezeDeluxe.length - 1] : null;
  const isBottomingSqueeze = !isUpTrend && lastSqz && lastSqz.flux > 0 && lastSqz.momentum > lastSqz.signal;

  // Fibonacci Retracement (Anchored to the True Cycle Origin)
  const retracement: FibonacciLevels = {
    h0: maxPrice,
    h236: maxPrice - (diff * 0.236),
    h382: maxPrice - (diff * 0.382),
    h500: maxPrice - (diff * 0.500),
    h618: maxPrice - (diff * 0.618),
    h786: maxPrice - (diff * 0.786),
    h100: minPrice
  };

  // 2. Fibonacci Extension (Standard levels based on range)
  const extension: FibonacciLevels = {
    h0: minPrice,
    h236: minPrice + (diff * 0.236),
    h100: maxPrice,
    h1618: maxPrice + (diff * 0.618),
    h2618: maxPrice + (diff * 1.618),
    h382: minPrice + (diff * 0.382),
    h500: minPrice + (diff * 0.500),
    h618: minPrice + (diff * 0.618),
    h786: minPrice + (diff * 0.786),
  };

    const lastPrice = quotes[quotes.length - 1].close;

    // Determine Squeeze Momentum Energy
    const isSqzFired = lastSqz ? (!lastSqz.squeeze.low && !lastSqz.squeeze.mid) : true;
    const isMomBullish = lastSqz ? (lastSqz.momentum > lastSqz.signal && lastSqz.flux > 0) : true;
    const energyLevel = isSqzFired && isMomBullish ? "HIGH" : (isSqzFired || isMomBullish ? "MODERATE" : "LOW");

    // ELLIOTT WAVE REFINEMENT: Identification of W1, W2, W3
    let w1Height = diff * 0.3; // Default fallback
    let w3Height = diff;
    let w4TargetValue = retracement.h382;
    let w4FiboRatio = "38.2%";

    if (isUpTrend && pivots.length >= 4) {
        // Assuming Bullish: W0(Low), W1(High), W2(Low), W3(High)
        // Ensure we only pick pivots AFTER the Major Cycle Low (minIdxGlobal)
        const pts = [...pivots].filter(p => p.index >= minIdxGlobal).slice(-4);
        if (pts.length === 4) {
            const [p0, p1, p2, p3] = pts; // p0=W0, p1=W1, p2=W2, p3=W3
            w1Height = p1.price - p0.price;
            w3Height = p3.price - p2.price;
            
            // Check if W3 is reasonable extension of W1 (e.g. >= 100%)
            const w3w1Ratio = w3Height / w1Height;
            
            // W4 target: Usually 38.2% of W3 length
            w4TargetValue = p3.price - (w3Height * 0.382);
            w4FiboRatio = "38.2% (of W3)";
            
            // If already below 38.2%, target 50% or 61.8%
            if (lastPrice <= w4TargetValue) {
                w4TargetValue = p3.price - (w3Height * 0.5);
                w4FiboRatio = "50.0% (of W3)";
            }
            if (lastPrice <= p3.price - (w3Height * 0.5)) {
                w4TargetValue = p3.price - (w3Height * 0.618);
                w4FiboRatio = "61.8% (of W3)";
            }
        }
    } else {
        // Fallback for when pivots aren't ideal
        if (lastPrice <= retracement.h382) { w4TargetValue = retracement.h500; w4FiboRatio = "50.0%"; }
        if (lastPrice <= retracement.h500) { w4TargetValue = retracement.h618; w4FiboRatio = "61.8%"; }
    }

    // Wave 5 Target Calculation
    // Aggressive: W3 height * 0.618 extended from W4
    // Realistic: Previous High (W3) + 0.382 of W3 height
    const aggressiveW5 = w4TargetValue + (w3Height * 0.618);
    const realisticW5 = Math.max(maxPrice * 1.02, w4TargetValue + (w3Height * 0.382));
    
    // Final Target Selection based on Squeeze Energy
    const finalTarget = energyLevel === "HIGH" ? aggressiveW5 : realisticW5;
    const reachability = energyLevel === "HIGH" ? "TINGGI (Sqz Fired & Bullish Flux)" : (energyLevel === "MODERATE" ? "MODERAT" : "RENDAH (Tight Squeeze/Bearish Flow)");

    let interpretation = "";
    if (isUpTrend) {
        interpretation = `Terdeteksi fase Akselerasi Bullish (Potensi Wave 5). Struktur Wave 3 terkonfirmasi di harga ${maxPrice.toFixed(0)}. Berdasarkan Squeeze Deluxe, probabilitas mencapai target ekstensi Wave 5 di area ${aggressiveW5.toFixed(0)} adalah ${reachability}. Support Wave 4 ideal berada di kisaran Fibo ${w4FiboRatio} (${w4TargetValue.toFixed(0)}).`;
    } else if (isBottomingSqueeze) {
        interpretation = `STRUKTUR REVERSAL: Meskipun tren jangka panjang masih Bearish, Squeeze Deluxe mendeteksi AKUMULASI KUAT (Flux Positif) di area dasar. Ini adalah indikasi fase 'Bottoming Out'. Jika harga berhasil breakout dari Squeeze ini, target pemulihan terdekat adalah Fibo 38.2% (${retracement.h382.toFixed(0)}) hingga 61.8% (${retracement.h618.toFixed(0)}) sebagai konfirmasi awal pergantian tren ke Bullish.`;
    } else {
        interpretation = `Terdeteksi fase Korektif (A-B-C) pasca-puncak Wave 3. Struktur harga berpotensi anjlok menembus support terdekat (Wave A) menuju area pijakan Fibo ${w4FiboRatio} (${w4TargetValue.toFixed(0)}). Proyeksi Wave C mengarah ke kisaran support ekstrim ${retracement.h100.toFixed(0)}.`;
    }

  return {
    trend: isBottomingSqueeze ? 'BOTTOMING' : (isUpTrend ? 'BULLISH' : 'BEARISH'),
    range: { maxPrice, minPrice, diff },
    retracement,
    extension,
    w5Target: {
        aggressive: aggressiveW5,
        realistic: realisticW5,
        current: finalTarget,
        energyLevel,
        reachability
    },
    interpretation
  };
}

/**
 * ZigZag Pivot Point Detection
 * Essential for identifying Elliott Wave start/end points
 */
export function calculatePivots(quotes: OHLCV[], deviation = 5) {
  const pivots: { index: number, price: number, type: 'high' | 'low' }[] = [];
  
  // Basic ZigZag implementation logic
  // This helps identify where waves start and end
  let lastPivot = { price: quotes[0].close, type: 'none' as 'high' | 'low' | 'none', index: 0 };
  
  for (let i = 1; i < quotes.length; i++) {
    const price = quotes[i].close;
    const diff = ((price - lastPivot.price) / lastPivot.price) * 100;

    if (Math.abs(diff) >= deviation) {
        const type = diff > 0 ? 'high' : 'low';
        if (type !== lastPivot.type) {
            pivots.push({ index: i, price, type });
            lastPivot = { index: i, price, type };
        } else {
            // Update current pivot if it's more extreme
            if ((type === 'high' && price > lastPivot.price) || (type === 'low' && price < lastPivot.price)) {
                pivots.pop();
                pivots.push({ index: i, price, type });
                lastPivot = { index: i, price, type };
            }
        }
    }
  }
  
  return pivots;
}
