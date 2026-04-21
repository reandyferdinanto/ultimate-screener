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

    // Generate text interpretations calculating realistic w5 target as per Elliott rules
    const lastPrice = quotes[quotes.length - 1].close;

    // Find nearest authentic Fibo support below lastPrice
    let w4FiboRatio = "38.2%";
    let w4TargetValue = retracement.h382;
    if (lastPrice <= retracement.h382) { w4TargetValue = retracement.h500; w4FiboRatio = "50.0%"; }
    if (lastPrice <= retracement.h500) { w4TargetValue = retracement.h618; w4FiboRatio = "61.8%"; }
    if (lastPrice <= retracement.h618) { w4TargetValue = retracement.h786; w4FiboRatio = "78.6%"; }

    const w4TargetText = w4TargetValue.toFixed(0);
    const w5TargetText = Math.max(maxPrice * 1.02, w4TargetValue + (diff * 0.618)).toFixed(0);

    const interpretation = isUpTrend 
      ? `Terdeteksi fase Akselerasi Bullish (Potensi rentang target Wave 5). Jika terjadi gelombang pullback/koreksi sehat sebagai penanda Wave 4, pantau ketat resiliensi harga di ambang support Fibo ${w4FiboRatio} (${w4TargetText}). Dari titik pantulan tersebut, proyeksi ekstensi agresif Wave 5 (mengamplifikasi 0.618x energi gelombang sebelumnya) dapat menyapu area puncak baru di sekitar level ${w5TargetText} dalam estimasi 10-15 bar ke depan.`
      : `Terdeteksi fase Korektif (A-B-C) pasca-puncak. Struktur harga berpotensi anjlok menembus support terdekat (Wave A) menuju area pijakan Fibo ${w4FiboRatio} (${w4TargetText}). Jika pantulan ke atas (potensi Wave B semu) terjadi hingga resistance Fibo 61.8% (${retracement.h618.toFixed(0)}), bersiaplah untuk menghadapi terjunan lebih dalam menuju dasar Wave C di kisaran support ekstrim ${retracement.h100.toFixed(0)}.`;

  return {
    trend: isUpTrend ? 'BULLISH' : 'BEARISH',
    range: { maxPrice, minPrice, diff },
    retracement,
    extension,
    // Elliott Wave Interpretation
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
