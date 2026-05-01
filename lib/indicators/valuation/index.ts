import { OHLCV } from '../types';

export interface WavePivot {
  index: number;
  price: number;
  type: 'high' | 'low';
  confirmed?: boolean;
}

/**
 * ZigZag Pivot Point Detection
 * Essential for identifying swing highs and lows.
 */
export function calculatePivots(quotes: OHLCV[], deviation = 5, confirmBars = 2): WavePivot[] {
  if (quotes.length < 3) return [];
  const threshold = Math.max(0.01, deviation / 100);
  const pivots: WavePivot[] = [];
  let trend: 'up' | 'down' | null = null;
  let candidateHigh: WavePivot = { index: 0, price: quotes[0].high, type: 'high', confirmed: true };
  let candidateLow: WavePivot = { index: 0, price: quotes[0].low, type: 'low', confirmed: true };

  const pushPivot = (pivot: WavePivot) => {
    const normalized = { ...pivot, confirmed: pivot.index <= quotes.length - 1 - confirmBars };
    const previous = pivots[pivots.length - 1];
    if (!previous) {
      pivots.push(normalized);
      return;
    }
    if (previous.type === normalized.type) {
      const isMoreExtreme = normalized.type === 'high'
        ? normalized.price > previous.price
        : normalized.price < previous.price;
      if (isMoreExtreme) pivots[pivots.length - 1] = normalized;
      return;
    }
    if (previous.index !== normalized.index) pivots.push(normalized);
  };

  for (let i = 1; i < quotes.length; i++) {
    const high = quotes[i].high;
    const low = quotes[i].low;

    if (high > candidateHigh.price) candidateHigh = { index: i, price: high, type: 'high', confirmed: true };
    if (low < candidateLow.price) candidateLow = { index: i, price: low, type: 'low', confirmed: true };

    if (!trend) {
      if (high >= candidateLow.price * (1 + threshold)) {
        pushPivot(candidateLow);
        trend = 'up';
        candidateHigh = { index: i, price: high, type: 'high', confirmed: true };
      } else if (low <= candidateHigh.price * (1 - threshold)) {
        pushPivot(candidateHigh);
        trend = 'down';
        candidateLow = { index: i, price: low, type: 'low', confirmed: true };
      }
      continue;
    }

    if (trend === 'up') {
      if (high > candidateHigh.price) candidateHigh = { index: i, price: high, type: 'high', confirmed: true };
      if (low <= candidateHigh.price * (1 - threshold)) {
        pushPivot(candidateHigh);
        trend = 'down';
        candidateLow = { index: i, price: low, type: 'low', confirmed: true };
      }
    } else {
      if (low < candidateLow.price) candidateLow = { index: i, price: low, type: 'low', confirmed: true };
      if (high >= candidateLow.price * (1 + threshold)) {
        pushPivot(candidateLow);
        trend = 'up';
        candidateHigh = { index: i, price: high, type: 'high', confirmed: true };
      }
    }
  }

  if (trend === 'up') pushPivot(candidateHigh);
  if (trend === 'down') pushPivot(candidateLow);

  return pivots;
}
