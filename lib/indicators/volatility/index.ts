import { bb as i_bb, rma as i_rma } from 'indicatorts';
import { OHLCV } from '../types';

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

export function calculateATRP(quotes: OHLCV[], period = 14): number[] {
  const atr = calculateATR(quotes, period);
  return quotes.map((quote, i) => {
    const value = atr[i];
    return isFiniteNumber(value) && quote.close ? (value / quote.close) * 100 : Number.NaN;
  });
}

export function calculateChandelierExit(quotes: OHLCV[], period = 22, multiplier = 3) {
  const atr = calculateATR(quotes, period);
  const highs = quotes.map(quote => quote.high);
  const lows = quotes.map(quote => quote.low);
  const highestHigh = calculateHighest(highs, period);
  const lowestLow = calculateLowest(lows, period);

  return {
    long: quotes.map((_, i) => {
      const value = atr[i];
      return isFiniteNumber(value) ? highestHigh[i] - value * multiplier : Number.NaN;
    }),
    short: quotes.map((_, i) => {
      const value = atr[i];
      return isFiniteNumber(value) ? lowestLow[i] + value * multiplier : Number.NaN;
    })
  };
}

export function calculateKeltnerChannels(quotes: OHLCV[], ema: number[], atrPeriod = 10, multiplier = 2) {
  const atr = calculateATR(quotes, atrPeriod);
  return {
    middle: ema,
    upper: ema.map((value, i) => isFiniteNumber(value) && isFiniteNumber(atr[i]) ? value + atr[i] * multiplier : Number.NaN),
    lower: ema.map((value, i) => isFiniteNumber(value) && isFiniteNumber(atr[i]) ? value - atr[i] * multiplier : Number.NaN)
  };
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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const nz = (value: number | undefined) => isFiniteNumber(value) ? value : 0;

/**
 * Standard Deviation
 */
export function calculateStdev(data: number[], period: number): number[] {
  return data.map((_, i) => {
    let sq = 0;
    let previousSq = 0;
    let sum = 0;

    for (let k = 0; k < period; k++) {
      const value = nz(data[i - k]);
      previousSq = sq;
      sq += (value - sq) / (1 + k);
      sum += (value - sq) * (value - previousSq);
    }

    return period > 1 ? Math.sqrt(sum / (period - 1)) : 0;
  });
}

function calculatePineSMA(data: number[], period: number): number[] {
  return data.map((_, i) => {
    if (i < period - 1) return Number.NaN;

    const window = data.slice(i - period + 1, i + 1);
    if (window.some(value => !isFiniteNumber(value))) return Number.NaN;

    return window.reduce((sum, value) => sum + value, 0) / period;
  });
}

function calculatePineRMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const seedValues: number[] = [];
  let previous = Number.NaN;

  for (const value of data) {
    if (!isFiniteNumber(value)) {
      result.push(Number.NaN);
      continue;
    }

    if (isFiniteNumber(previous)) {
      previous = (value + (period - 1) * previous) / period;
      result.push(previous);
      continue;
    }

    seedValues.push(value);
    if (seedValues.length < period) {
      result.push(Number.NaN);
      continue;
    }

    previous = seedValues.slice(-period).reduce((sum, item) => sum + item, 0) / period;
    result.push(previous);
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
    const window = data.slice(i - period + 1, i + 1);
    if (i < period - 1 || window.some(value => !isFiniteNumber(value))) {
      result.push(Number.NaN);
      continue;
    }

    let ySum = 0;
    let xySum = 0;
    for (let j = 0; j < period; j++) {
      const value = window[j];
      ySum += value;
      xySum += j * value;
    }

    const divisor = period * x2Sum - xSum * xSum;
    const slope = divisor === 0 ? 0 : (period * xySum - xSum * ySum) / divisor;
    const intercept = (ySum - slope * xSum) / period;
    result.push(intercept + slope * (period - 1));
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

function calculateTrueRangeFromSeries(highs: number[], lows: number[], closes: number[]): number[] {
  return highs.map((high, i) => {
    const low = lows[i];
    if (i === 0) return high - low;

    const previousClose = closes[i - 1];
    return Math.max(
      high - low,
      Math.abs(high - previousClose),
      Math.abs(low - previousClose)
    );
  });
}

function calculateAtrFromSeries(highs: number[], lows: number[], closes: number[], period = 1): number[] {
  const trueRange = calculateTrueRangeFromSeries(highs, lows, closes);
  return period === 1 ? trueRange : calculatePineRMA(trueRange, period);
}

function calculateHeikinAshiQuotes(quotes: OHLCV[]): OHLCV[] {
  const result: OHLCV[] = [];

  for (const quote of quotes) {
    const close = (quote.open + quote.high + quote.low + quote.close) / 4;
    const previous = result[result.length - 1];
    const open = previous
      ? (previous.open + previous.close) / 2
      : (quote.open + quote.close) / 2;

    result.push({
      ...quote,
      open,
      high: Math.max(quote.high, open, close),
      low: Math.min(quote.low, open, close),
      close
    });
  }

  return result;
}

function isCrossover(source: number[], target: number[], index: number) {
  return index > 0 &&
    isFiniteNumber(source[index]) &&
    isFiniteNumber(target[index]) &&
    isFiniteNumber(source[index - 1]) &&
    isFiniteNumber(target[index - 1]) &&
    source[index] > target[index] &&
    source[index - 1] <= target[index - 1];
}

function isCrossunder(source: number[], target: number[], index: number) {
  return index > 0 &&
    isFiniteNumber(source[index]) &&
    isFiniteNumber(target[index]) &&
    isFiniteNumber(source[index - 1]) &&
    isFiniteNumber(target[index - 1]) &&
    source[index] < target[index] &&
    source[index - 1] >= target[index - 1];
}

function detectSqueezeDivergences(quotes: OHLCV[], momentum: number[], signal: number[], threshold: number) {
  const isBullDiv = Array(quotes.length).fill(false);
  const isBearDiv = Array(quotes.length).fill(false);
  let divergencePrice = Number.NaN;
  let divergenceSignal = Number.NaN;

  for (let i = 1; i < quotes.length; i++) {
    const signalValue = signal[i];
    if (!isFiniteNumber(signalValue)) continue;

    if (momentum[i] > threshold && isCrossunder(momentum, signal, i)) {
      if (!isFiniteNumber(divergencePrice)) {
        divergencePrice = quotes[i].high;
        divergenceSignal = signalValue;
      } else if (quotes[i].high > divergencePrice && signalValue < divergenceSignal) {
        isBearDiv[i] = true;
        divergencePrice = Number.NaN;
        divergenceSignal = Number.NaN;
      } else {
        divergencePrice = quotes[i].high;
        divergenceSignal = signalValue;
      }
    } else if (momentum[i] < -threshold && isCrossover(momentum, signal, i)) {
      if (!isFiniteNumber(divergencePrice)) {
        divergencePrice = quotes[i].low;
        divergenceSignal = signalValue;
      } else if (quotes[i].low < divergencePrice && signalValue > divergenceSignal) {
        isBullDiv[i] = true;
        divergencePrice = Number.NaN;
        divergenceSignal = Number.NaN;
      } else {
        divergencePrice = quotes[i].low;
        divergenceSignal = signalValue;
      }
    }
  }

  return { isBullDiv, isBearDiv };
}

/**
 * EliCobra Squeeze Momentum Deluxe parity implementation.
 */
export function calculateSqueezeDeluxe(quotes: OHLCV[], len = 20, sig = 3, dfl = 30, dfh = false, trs = 25) {
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  const hl2 = quotes.map(q => (q.high + q.low) / 2);

  const smaHl2 = calculatePineSMA(hl2, len);
  const highestHigh = calculateHighest(highs, len);
  const lowestLow = calculateLowest(lows, len);
  const syntheticHl2 = highestHigh.map((high, i) => (high + lowestLow[i]) / 2);
  const syntheticAtr = calculateAtrFromSeries(highestHigh, lowestLow, closes, 1);

  const rawOsc = closes.map((close, i) => {
    const baseline = (syntheticHl2[i] + smaHl2[i]) / 2;
    const range = syntheticAtr[i];
    return isFiniteNumber(baseline) && isFiniteNumber(range) && range !== 0
      ? ((close - baseline) / range) * 100
      : Number.NaN;
  });

  const momentum = calculateLinreg(rawOsc, len);
  const signal = calculatePineSMA(momentum, sig);

  const atrLen = calculateAtrFromSeries(highs, lows, closes, len);
  const stdev = calculateStdev(closes, len);
  const squeeze = stdev.map((deviation, i) => {
    const atr = atrLen[i];
    return {
      high: isFiniteNumber(atr) && deviation < atr * 0.5,
      mid: isFiniteNumber(atr) && deviation < atr * 0.75,
      low: isFiniteNumber(atr) && deviation < atr
    };
  });

  const fluxQuotes = dfh ? calculateHeikinAshiQuotes(quotes) : quotes;
  const fluxHighs = fluxQuotes.map(q => q.high);
  const fluxLows = fluxQuotes.map(q => q.low);
  const fluxCloses = fluxQuotes.map(q => q.close);
  const fluxAtr = calculateAtrFromSeries(fluxHighs, fluxLows, fluxCloses, dfl);
  const highChange = fluxHighs.map((high, i) => i === 0 ? 0 : Math.max(high - fluxHighs[i - 1], 0));
  const lowChange = fluxLows.map((low, i) => i === 0 ? 0 : Math.max((low - fluxLows[i - 1]) * -1, 0));
  const up = calculatePineRMA(highChange, dfl).map((value, i) =>
    isFiniteNumber(value) && isFiniteNumber(fluxAtr[i]) && fluxAtr[i] !== 0 ? value / fluxAtr[i] : Number.NaN
  );
  const down = calculatePineRMA(lowChange, dfl).map((value, i) =>
    isFiniteNumber(value) && isFiniteNumber(fluxAtr[i]) && fluxAtr[i] !== 0 ? value / fluxAtr[i] : Number.NaN
  );
  const fluxRatio = up.map((value, i) => {
    const total = value + down[i];
    return isFiniteNumber(value) && isFiniteNumber(down[i]) && total !== 0
      ? (value - down[i]) / total
      : Number.NaN;
  });
  const flux = calculatePineRMA(fluxRatio, Math.floor(dfl / 2)).map(value =>
    isFiniteNumber(value) ? value * 100 : Number.NaN
  );
  const overflux = flux.map(value => {
    if (!isFiniteNumber(value)) return Number.NaN;
    if (value > 25) return value - 25;
    if (value < -25) return value + 25;
    return Number.NaN;
  });

  const { isBullDiv, isBearDiv } = detectSqueezeDivergences(quotes, momentum, signal, trs);
  const zeroLine = quotes.map(() => 0);

  return momentum.map((value, i) => {
    const previousSqueeze = squeeze[i - 1];
    const previousMomentum = momentum[i - 1];
    const swingBullish = isCrossover(momentum, signal, i);
    const swingBearish = isCrossunder(momentum, signal, i);

    return {
      momentum: value,
      signal: signal[i],
      flux: flux[i],
      overflux: overflux[i],
      squeeze: squeeze[i],
      isBullDiv: isBullDiv[i],
      isBearDiv: isBearDiv[i],
      buySignal: swingBullish && value < -40 && flux[i] < 0,
      sellSignal: swingBearish && value > 40 && flux[i] > 0,
      momentumBullish: isCrossover(momentum, zeroLine, i),
      momentumBearish: isCrossunder(momentum, zeroLine, i),
      fluxBullish: isCrossover(flux, zeroLine, i),
      fluxBearish: isCrossunder(flux, zeroLine, i),
      swingBullish,
      swingBearish,
      isHighConviction: isBullDiv[i] &&
        Boolean(previousSqueeze?.low || previousSqueeze?.mid) &&
        isFiniteNumber(previousMomentum) &&
        value > previousMomentum
    };
  });
}
