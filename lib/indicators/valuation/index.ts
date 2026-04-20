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
export function calculateElliottFibonacci(quotes: OHLCV[], lookback = 100) {
  if (quotes.length < lookback) return null;

  const slice = quotes.slice(-lookback);
  const highs = slice.map(q => q.high);
  const lows = slice.map(q => q.low);

  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  
  const maxIdx = highs.indexOf(maxPrice);
  const minIdx = lows.indexOf(minPrice);

  const isUpTrend = minIdx < maxIdx; // Low terjadi sebelum High
  const diff = maxPrice - minPrice;

  // 1. Fibonacci Retracement (Batas Penurunan)
  // Dihitung dari Tren Terbesar (Low ke High)
  const retracement: FibonacciLevels = {
    h0: maxPrice,
    h236: maxPrice - (diff * 0.236),
    h382: maxPrice - (diff * 0.382),
    h500: maxPrice - (diff * 0.500),
    h618: maxPrice - (diff * 0.618),
    h786: maxPrice - (diff * 0.786),
    h100: minPrice
  };

  // 2. Fibonacci Extension (Target Kenaikan)
  // Prediksi Target Wave 3 atau Wave 5
  const extension: FibonacciLevels = {
    h0: minPrice,
    h236: minPrice + (diff * 0.236),
    h100: maxPrice,
    h1618: maxPrice + (diff * 0.618), // 1.618 extension relative to move
    h2618: maxPrice + (diff * 1.618), // 2.618 extension relative to move
    // Standar Elliott: Target = min + (diff * ratio)
    h382: minPrice + (diff * 0.382),
    h500: minPrice + (diff * 0.500),
    h618: minPrice + (diff * 0.618),
    h786: minPrice + (diff * 0.786),
  };

  return {
    trend: isUpTrend ? 'BULLISH' : 'BEARISH',
    range: { maxPrice, minPrice, diff },
    retracement,
    extension,
    // Elliott Wave Interpretation
    interpretation: isUpTrend 
      ? `Strong move detected. Support at ${retracement.h618.toFixed(2)} (61.8%). Target Wave 3 at ${extension.h1618?.toFixed(2)}.`
      : `Corrective phase (A-B-C) or Bearish trend. Major support at ${minPrice.toFixed(2)}. Resistance at ${retracement.h618.toFixed(2)}.`
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
