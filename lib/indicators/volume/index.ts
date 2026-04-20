import { obv as i_obv, vwap as i_vwap, ad as i_ad, cmf as i_cmf, forceIndex as i_forceIndex, nvi as i_nvi, vpt as i_vpt, emv as i_emv } from 'indicatorts';
import { OHLCV } from '../types';

/**
 * On-Balance Volume
 */
export function calculateOBV(quotes: OHLCV[]): number[] {
  return i_obv(
    quotes.map(q => q.close),
    quotes.map(q => q.volume)
  );
}

/**
 * Accumulation/Distribution
 */
export function calculateAD(quotes: OHLCV[]): number[] {
  return i_ad(
    quotes.map(q => q.high),
    quotes.map(q => q.low),
    quotes.map(q => q.close),
    quotes.map(q => q.volume)
  );
}

/**
 * Chaikin Money Flow
 */
export function calculateCMF(quotes: OHLCV[], period = 20): number[] {
  return i_cmf(
    quotes.map(q => q.high),
    quotes.map(q => q.low),
    quotes.map(q => q.close),
    quotes.map(q => q.volume),
    { period }
  );
}

/**
 * Ease of Movement
 */
export function calculateEMV(quotes: OHLCV[], period = 14): number[] {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const volumes = quotes.map(q => q.volume);
  return i_emv(highs, lows, volumes, { period });
}

/**
 * Force Index
 */
export function calculateForceIndex(quotes: OHLCV[], period = 13): number[] {
  return i_forceIndex(
    quotes.map(q => q.close),
    quotes.map(q => q.volume),
    { period }
  );
}

/**
 * Negative Volume Index
 */
export function calculateNVI(quotes: OHLCV[]): number[] {
  return i_nvi(
    quotes.map(q => q.close),
    quotes.map(q => q.volume)
  );
}

/**
 * Volume Price Trend
 */
export function calculateVPT(quotes: OHLCV[]): number[] {
  return i_vpt(
    quotes.map(q => q.close),
    quotes.map(q => q.volume)
  );
}

/**
 * Volume Weighted Average Price
 */
export function calculateVWAP(quotes: OHLCV[], period = 20): number[] {
  return i_vwap(
    quotes.map(q => q.close),
    quotes.map(q => q.volume),
    { period }
  );
}

/**
 * Cumulative Volume Delta (Proxy)
 * Since we don't have buy/sell split, we use price action relative to range
 */
export function calculateCVD(quotes: OHLCV[]): number[] {
  const deltas: number[] = quotes.map(q => {
    const range = q.high - q.low;
    if (range === 0) return 0;
    // (Close - Low) - (High - Close) / Range  => multiplier between -1 and 1
    const multiplier = ((q.close - q.low) - (q.high - q.close)) / range;
    return multiplier * q.volume;
  });

  const cvd: number[] = [];
  let current = 0;
  for (const d of deltas) {
    current += d;
    cvd.push(current);
  }
  return cvd;
}
