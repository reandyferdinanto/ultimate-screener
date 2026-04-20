import { bb as i_bb, rma as i_rma } from 'indicatorts';
import { OHLCV } from '../types';
import { calculateSMA, calculateRMA } from '../trend';

/**
 * Bollinger Bands
 */
export function calculateBollingerBands(data: number[], period = 20) {
  const result = i_bb(data, { period });
  return {
    sma: result.middle,
    upper: result.upper,
    lower: result.lower
  };
}

/**
 * Average True Range
 */
export function calculateATR(quotes: OHLCV[], period = 14): number[] {
  const tr = calculateTR(quotes);
  return i_rma(tr, { period });
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

/**
 * Standard Deviation
 */
export function calculateStdev(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(0);
      continue;
    }
    const window = data.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    result.push(Math.sqrt(variance));
  }
  return result;
}

/**
 * Linear Regression (used for momentum smoothing)
 */
export function calculateLinreg(data: number[], period: number): number[] {
  const result: number[] = [];
  const xSum = (period * (period - 1)) / 2;
  const x2Sum = (period * (period - 1) * (2 * period - 1)) / 6;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1 || data.slice(i - period + 1, i + 1).some(v => isNaN(v))) {
      result.push(0);
      continue;
    }
    let ySum = 0;
    let xySum = 0;
    for (let j = 0; j < period; j++) {
      const val = data[i - (period - 1) + j];
      ySum += val;
      xySum += j * val;
    }
    const divisor = (period * x2Sum - xSum * xSum);
    const b = divisor === 0 ? 0 : (period * xySum - xSum * ySum) / divisor;
    const a = (ySum - b * xSum) / period;
    result.push(a + b * (period - 1));
  }
  return result;
}

/**
 * Squeeze Pro / Deluxe Indicator with 3 Levels of Compression
 * and Bullish Divergence detection.
 */
export function calculateSqueezeDeluxe(quotes: OHLCV[], len = 20, sig = 3, dfl = 30) {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  const hl2 = quotes.map(q => (q.high + q.low) / 2);
  
  const smaHl2 = calculateSMA(hl2, len);
  const atrVal = calculateATR(quotes, len);
  
  // 1. Momentum Oscillator (TTM Style)
  const rawOsc = closes.map((c, i) => {
    const av = smaHl2[i] || hl2[i];
    const syntheticAvgVal = (hl2[i] + av) / 2;
    const denom = atrVal[i] || 1;
    return ((c - syntheticAvgVal) / denom) * 100;
  });
  const momentum = calculateLinreg(rawOsc, len);
  const signal = calculateSMA(momentum, sig);

  // 2. Squeeze Pro Logic (3 Levels)
  // Level 1 (Black): BB 2.0 / KC 1.5
  // Level 2 (Red): BB 2.0 / KC 1.0
  // Level 3 (Orange): BB 2.0 / KC 0.5 (Extreme)
  const dev = calculateStdev(closes, len);
  const sqzItems = dev.map((d, i) => {
    const a = atrVal[i] || 1;
    return {
      low: d < a * 1.5,      // Black: Standard
      mid: d < a * 1.0,      // Red: Tight
      high: d < a * 0.5      // Orange: Extreme
    };
  });

  // 3. Directional Flux (DFO)
  const changeH = highs.map((h, i) => i === 0 ? 0 : Math.max(0, h - highs[i-1]));
  const changeL = lows.map((l, i) => i === 0 ? 0 : Math.max(0, lows[i-1] - l));
  
  const up = calculateRMA(changeH, dfl).map((v, i) => v / (atrVal[i] || 1));
  const dn = calculateRMA(changeL, dfl).map((v, i) => v / (atrVal[i] || 1));
  
  const fluxRatio = up.map((u, i) => {
    const sum = u + dn[i];
    return sum === 0 ? 0 : (u - dn[i]) / sum;
  });
  
  const flux = calculateRMA(fluxRatio, Math.floor(dfl / 2)).map(v => v * 100);

  // 4. Bullish Divergence Detection
  // Rule: Price makes Lower Low, Momentum makes Higher Low
  const isBullDiv = momentum.map((m, i) => {
    if (i < 20) return false;
    
    // Check if current momentum is a local pivot low
    const isMomPivotLow = m > momentum[i-1] && momentum[i-2] > momentum[i-1];
    if (!isMomPivotLow) return false;

    // Search for a previous momentum pivot low within 20 candles
    let prevMomLowIdx = -1;
    for (let j = i - 2; j > i - 20; j--) {
        if (momentum[j] < momentum[j-1] && momentum[j] < momentum[j+1]) {
            prevMomLowIdx = j;
            break;
        }
    }
    if (prevMomLowIdx === -1) return false;

    const currentMomLow = momentum[i-1];
    const prevMomLow = momentum[prevMomLowIdx];
    const currentPriceLow = lows[i-1];
    const prevPriceLow = lows[prevMomLowIdx];

    // Bullish Divergence: Lower price low BUT higher momentum low
    // Only valid if momentum is deep (below -10)
    return currentPriceLow < prevPriceLow && currentMomLow > prevMomLow && currentMomLow < -10;
  });

  return momentum.map((m, i) => ({
    momentum: m,
    signal: signal[i],
    flux: flux[i],
    squeeze: sqzItems[i],
    isBullDiv: isBullDiv[i],
    // High Conviction Entry: Squeeze fired (black/red gone) + Bullish Divergence + Momentum improving
    isHighConviction: isBullDiv[i] && (sqzItems[i-1].low || sqzItems[i-1].mid) && m > momentum[i-1]
  }));
}

function calculateHighest(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - period + 1);
    result.push(Math.max(...data.slice(start, i + 1)));
  }
  return result;
}

function calculateLowest(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - period + 1);
    result.push(Math.min(...data.slice(start, i + 1)));
  }
  return result;
}
