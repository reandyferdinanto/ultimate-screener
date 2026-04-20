export * from './types';
export * from './trend';
export * from './momentum';
export * from './volatility';
export * from './volume';
export * from './valuation';

import { OHLCV } from './types';
import { calculateATR } from './volatility';

/**
 * Pivot Points (Classic + Camarilla)
 */
export function calculatePivotPoints(prevDay: OHLCV) {
  const { high, low, close } = prevDay;
  const p = (high + low + close) / 3;
  const range = high - low;

  return {
    p,
    r1: 2 * p - low,
    s1: 2 * p - high,
    r2: p + range,
    s2: p - range,
    r3: high + 2 * (p - low),
    s3: low - 2 * (high - p),
    
    cR1: close + range * 1.1 / 12,
    cR2: close + range * 1.1 / 6,
    cR3: close + range * 1.1 / 4,
    cR4: close + range * 1.1 / 2,
    cS1: close - range * 1.1 / 12,
    cS2: close - range * 1.1 / 6,
    cS3: close - range * 1.1 / 4,
    cS4: close - range * 1.1 / 2,
    wP: (high + low + 2 * close) / 4,
  };
}

export function calculatePivotPointsSeries(quotes: OHLCV[]) {
  return quotes.map((q, i) => {
    if (i === 0) return null;
    return calculatePivotPoints(quotes[i-1]);
  });
}
