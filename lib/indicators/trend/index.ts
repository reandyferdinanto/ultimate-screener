import { ema as i_ema, sma as i_sma, macd as i_macd, rma as i_rma } from 'indicatorts';
import { OHLCV } from '../types';

/**
 * Exponential Moving Average
 */
export function calculateEMA(data: number[], period: number): number[] {
  return i_ema(data, { period });
}

/**
 * Simple Moving Average
 */
export function calculateSMA(data: number[], period: number): number[] {
  return i_sma(data, { period });
}

/**
 * Moving Average Convergence Divergence
 */
export function calculateMACD(data: number[], fast = 12, slow = 26, signal = 9) {
  const result = i_macd(data, { fast, slow, signal });
  return {
    macdLine: result.macdLine,
    signalLine: result.signalLine,
    histogram: result.macdLine.map((m, i) => m - result.signalLine[i])
  };
}

/**
 * Relative Moving Average (used in RSI/ATR)
 */
export function calculateRMA(data: number[], period: number): number[] {
  return i_rma(data, { period });
}

/**
 * SuperTrend Indicator
 */
export function calculateSuperTrend(quotes: OHLCV[], period = 10, multiplier = 3) {
  const tr = calculateTR(quotes);
  const atrValues = i_rma(tr, { period });
  const upperBand: number[] = [];
  const lowerBand: number[] = [];
  const superTrend: number[] = [];
  const direction: number[] = [];

  for (let i = 0; i < quotes.length; i++) {
    const hl2 = (quotes[i].high + quotes[i].low) / 2;
    const basicUpper = hl2 + multiplier * atrValues[i];
    const basicLower = hl2 - multiplier * atrValues[i];

    if (i === 0) {
      upperBand.push(basicUpper);
      lowerBand.push(basicLower);
      superTrend.push(basicUpper);
      direction.push(-1);
      continue;
    }

    if (basicUpper < upperBand[i - 1] || quotes[i - 1].close > upperBand[i - 1]) {
      upperBand.push(basicUpper);
    } else {
      upperBand.push(upperBand[i - 1]);
    }

    if (basicLower > lowerBand[i - 1] || quotes[i - 1].close < lowerBand[i - 1]) {
      lowerBand.push(basicLower);
    } else {
      lowerBand.push(lowerBand[i - 1]);
    }

    let dir = direction[i - 1];
    if (dir === -1 && quotes[i].close > upperBand[i]) dir = 1;
    else if (dir === 1 && quotes[i].close < lowerBand[i]) dir = -1;
    direction.push(dir);
    superTrend.push(dir === 1 ? lowerBand[i] : upperBand[i]);
  }

  return { superTrend, direction };
}

/**
 * Helper: True Range
 */
function calculateTR(quotes: OHLCV[]): number[] {
  const tr: number[] = [];
  for (let i = 0; i < quotes.length; i++) {
    if (i === 0) {
      tr.push(quotes[i].high - quotes[i].low);
    } else {
      const high = quotes[i].high;
      const low = quotes[i].low;
      const prevClose = quotes[i - 1].close;
      tr.push(Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      ));
    }
  }
  return tr;
}
