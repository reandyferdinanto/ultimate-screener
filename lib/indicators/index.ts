import { 
  ema, 
  sma,
  macd, 
  mfi, 
  bb, 
  atr,
  ad,
  cmf,
  emv,
  forceIndex,
  nvi,
  obv,
  vpt,
  vwap,
  vortex,
  kdj,
  rma
} from 'indicatorts';

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// EMA
export function calculateEMA(data: number[], period: number): number[] {
  return ema(data, { period });
}

// SMA
export function calculateSMA(data: number[], period: number): number[] {
  return sma(data, { period });
}

// MACD
export function calculateMACD(data: number[], fast = 12, slow = 26, signal = 9) {
  const result = macd(data, { fast, slow, signal });
  return {
    macdLine: result.macdLine,
    signalLine: result.signalLine,
    histogram: result.macdLine.map((m, i) => m - result.signalLine[i])
  };
}

// Bollinger Bands
export function calculateBollingerBands(data: number[], period = 20) {
  const result = bb(data, { period }); // multiplier is fixed at 2 in indicatorts bb
  return {
    sma: result.middle,
    upper: result.upper,
    lower: result.lower
  };
}

// MFI
export function calculateMFI(quotes: OHLCV[], period = 14): number[] {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  const volumes = quotes.map(q => q.volume);
  return mfi(highs, lows, closes, volumes, { period });
}

// Volume Indicators
export function calculateAD(quotes: OHLCV[]): number[] {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  const volumes = quotes.map(q => q.volume);
  return ad(highs, lows, closes, volumes);
}

export function calculateCMF(quotes: OHLCV[], period = 20): number[] {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  const volumes = quotes.map(q => q.volume);
  return cmf(highs, lows, closes, volumes, { period });
}

export function calculateEMV(quotes: OHLCV[], period = 14): number[] {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const volumes = quotes.map(q => q.volume);
  return emv(highs, lows, volumes, { period });
}

export function calculateForceIndex(quotes: OHLCV[], period = 13): number[] {
  const closes = quotes.map(q => q.close);
  const volumes = quotes.map(q => q.volume);
  return forceIndex(closes, volumes, { period });
}

export function calculateNVI(quotes: OHLCV[]): number[] {
  const closes = quotes.map(q => q.close);
  const volumes = quotes.map(q => q.volume);
  return nvi(closes, volumes);
}

export function calculateOBV(quotes: OHLCV[]): number[] {
  const closes = quotes.map(q => q.close);
  const volumes = quotes.map(q => q.volume);
  return obv(closes, volumes);
}

export function calculateVPT(quotes: OHLCV[]): number[] {
  const closes = quotes.map(q => q.close);
  const volumes = quotes.map(q => q.volume);
  return vpt(closes, volumes);
}

export function calculateVWAP(quotes: OHLCV[], period = 20): number[] {
  const closes = quotes.map(q => q.close);
  const volumes = quotes.map(q => q.volume);
  return vwap(closes, volumes, { period });
}

export function calculateVortex(quotes: OHLCV[], period = 14) {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  return vortex(highs, lows, closes, { period });
}

export function calculateKDJ(quotes: OHLCV[], rPeriod = 9, kPeriod = 3, dPeriod = 3) {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  return kdj(highs, lows, closes, { rPeriod, kPeriod, dPeriod });
}

// Helpers for complex indicators
function calculateStdev(data: number[], period: number): number[] {
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

function calculateLinreg(data: number[], period: number): number[] {
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

function calculateRMA(data: number[], period: number): number[] {
  return rma(data, { period });
}

export function calculateSqueezeDeluxe(quotes: OHLCV[], len = 20, sig = 3, dfl = 30) {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  const hl2 = quotes.map(q => (q.high + q.low) / 2);
  
  const smaHl2 = calculateSMA(hl2, len);
  const highestLen = calculateHighest(highs, len);
  const lowestLen = calculateLowest(lows, len);
  
  // 1. Momentum Oscillator (Pine Script method osc)
  const rawOsc = closes.map((c, i) => {
    const zH = highestLen[i];
    const zL = lowestLen[i];
    const zC = c;
    const zHl2 = (zH + zL) / 2;
    const av = smaHl2[i] || zHl2;
    const syntheticAvgVal = (zHl2 + av) / 2;
    
    // z.atr() with len=1 is True Range of the synthetic bar z
    const prevClose = i === 0 ? (zH + zL) / 2 : closes[i-1];
    const zTr = Math.max(zH - zL, Math.abs(zH - prevClose), Math.abs(zL - prevClose));
    
    const denom = zTr || 1;
    return ((zC - syntheticAvgVal) / denom) * 100;
  });
  const momentum = calculateLinreg(rawOsc, len);
  const signal = calculateSMA(momentum, sig);

  // 2. Squeeze Logic (Pine Script method sqz)
  const atrVal = calculateATR(quotes, len);
  const dev = calculateStdev(closes, len);
  const sqzItems = dev.map((d, i) => {
    const a = atrVal[i] || 1;
    return {
      high: d < a * 0.5,
      mid: d < a * 0.75,
      low: d < a * 1.0
    };
  });

  // 3. Directional Flux (Pine Script method dfo)
  const changeH = highs.map((h, i) => i === 0 ? 0 : Math.max(0, h - highs[i-1]));
  const changeL = lows.map((l, i) => i === 0 ? 0 : Math.max(0, lows[i-1] - l));
  
  const up = calculateRMA(changeH, dfl).map((v, i) => v / (atrVal[i] || 1));
  const dn = calculateRMA(changeL, dfl).map((v, i) => v / (atrVal[i] || 1));
  
  const fluxRatio = up.map((u, i) => {
    const sum = u + dn[i];
    return sum === 0 ? 0 : (u - dn[i]) / sum;
  });
  
  const flux = calculateRMA(fluxRatio, Math.floor(dfl / 2)).map(v => v * 100);
  const overflux = flux.map(f => {
    if (f > 25) return f - 25;
    if (f < -25) return f + 25;
    return 0;
  });

  // 4. Divergence Detection (Bullish)
  const isBullDiv = momentum.map((m, i) => {
    if (i < 20) return false;
    
    const isMomPivotLow = m > momentum[i-1] && momentum[i-2] > momentum[i-1];
    if (!isMomPivotLow) return false;

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

    return currentPriceLow < prevPriceLow && currentMomLow > prevMomLow && currentMomLow < -10;
  });

  return momentum.map((m, i) => ({
    momentum: m || 0,
    signal: signal[i] || 0,
    flux: flux[i] || 0,
    overflux: overflux[i] || 0,
    squeeze: sqzItems[i],
    isBullDiv: isBullDiv[i]
  }));
}

// ATR (Standard)
export function calculateATR(quotes: OHLCV[], period = 14): number[] {
  const tr = calculateTR(quotes);
  return calculateRMA(tr, period);
}

// Pivot Points (Manual Implementation)
export function calculatePivotPoints(prevDay: OHLCV) {
  const { high, low, close } = prevDay;
  const p = (high + low + close) / 3;
  const range = high - low;

  return {
    // Standard/Classic
    p,
    r1: 2 * p - low,
    s1: 2 * p - high,
    r2: p + range,
    s2: p - range,
    r3: high + 2 * (p - low),
    s3: low - 2 * (high - p),
    
    // Camarilla
    cR1: close + range * 1.1 / 12,
    cR2: close + range * 1.1 / 6,
    cR3: close + range * 1.1 / 4,
    cR4: close + range * 1.1 / 2,
    cS1: close - range * 1.1 / 12,
    cS2: close - range * 1.1 / 6,
    cS3: close - range * 1.1 / 4,
    cS4: close - range * 1.1 / 2,

    // Woodie
    wP: (high + low + 2 * close) / 4,
  };
}

export function calculatePivotPointsSeries(quotes: OHLCV[]) {
  return quotes.map((q, i) => {
    if (i === 0) return null;
    return calculatePivotPoints(quotes[i-1]);
  });
}

// SuperTrend (indicatorts doesn't have it, use manual translation from indicator Go)
export function calculateSuperTrend(quotes: OHLCV[], period = 10, multiplier = 3) {
  const atrValues = calculateATR(quotes, period);
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
