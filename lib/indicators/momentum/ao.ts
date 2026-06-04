import { OHLCV } from '../types';
import { calculateSMA } from '../trend';

/**
 * Accelerator Oscillator (AO)
 * AO = SMA(Median Price, 5) - SMA(Median Price, 34)
 * Median Price = (High + Low) / 2
 */
export function calculateAO(quotes: OHLCV[]): number[] {
  const medianPrices = quotes.map(q => (q.high + q.low) / 2);
  const sma5 = calculateSMA(medianPrices, 5);
  const sma34 = calculateSMA(medianPrices, 34);
  
  return sma5.map((value, i) => {
    const s34 = sma34[i];
    if (!Number.isFinite(value) || !Number.isFinite(s34)) {
      return Number.NaN;
    }
    return value - s34;
  });
}

/**
 * Detect AO divergences
 * Returns bullish and bearish divergence signals
 */
export function detectAODivergence(quotes: OHLCV[], ao: number[], lookback = 14) {
  const bullishDivergence: boolean[] = Array(quotes.length).fill(false);
  const bearishDivergence: boolean[] = Array(quotes.length).fill(false);
  
  for (let i = lookback; i < quotes.length; i++) {
    // Find previous swing low/high within lookback period
    let prevLowIdx = -1;
    let prevHighIdx = -1;
    let prevLowPrice = Infinity;
    let prevHighPrice = -Infinity;
    
    for (let j = i - lookback; j < i - 2; j++) {
      if (quotes[j].low < prevLowPrice) {
        prevLowPrice = quotes[j].low;
        prevLowIdx = j;
      }
      if (quotes[j].high > prevHighPrice) {
        prevHighPrice = quotes[j].high;
        prevHighIdx = j;
      }
    }
    
    // Bullish divergence: price makes lower low, but AO makes higher low
    if (prevLowIdx >= 0 && 
        quotes[i].low < prevLowPrice && 
        Number.isFinite(ao[i]) && 
        Number.isFinite(ao[prevLowIdx]) &&
        ao[i] > ao[prevLowIdx] &&
        ao[i] < 0) {
      bullishDivergence[i] = true;
    }
    
    // Bearish divergence: price makes higher high, but AO makes lower high
    if (prevHighIdx >= 0 && 
        quotes[i].high > prevHighPrice && 
        Number.isFinite(ao[i]) && 
        Number.isFinite(ao[prevHighIdx]) &&
        ao[i] < ao[prevHighIdx] &&
        ao[i] > 0) {
      bearishDivergence[i] = true;
    }
  }
  
  return { bullishDivergence, bearishDivergence };
}

/**
 * Detect AO momentum shifts
 */
export function detectAOMomentumShift(ao: number[]): {
  accelerating: boolean[];
  decelerating: boolean[];
} {
  const accelerating: boolean[] = Array(ao.length).fill(false);
  const decelerating: boolean[] = Array(ao.length).fill(false);
  
  for (let i = 2; i < ao.length; i++) {
    const current = ao[i];
    const prev = ao[i - 1];
    const prevPrev = ao[i - 2];
    
    if (!Number.isFinite(current) || !Number.isFinite(prev) || !Number.isFinite(prevPrev)) {
      continue;
    }
    
    // Accelerating: AO is rising and rate of change is increasing
    if (current > prev && prev > prevPrev && (current - prev) > (prev - prevPrev)) {
      accelerating[i] = true;
    }
    
    // Decelerating: AO is falling and rate of change is increasing
    if (current < prev && prev < prevPrev && (prev - current) > (prevPrev - prev)) {
      decelerating[i] = true;
    }
  }
  
  return { accelerating, decelerating };
}

// Made with Bob
