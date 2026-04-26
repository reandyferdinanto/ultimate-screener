function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nz(value) {
  return isFiniteNumber(value) ? value : 0;
}

function calculateStdev(data, period) {
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

function calculateSMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return Number.NaN;

    const window = data.slice(i - period + 1, i + 1);
    if (window.some(value => !isFiniteNumber(value))) return Number.NaN;

    return window.reduce((sum, value) => sum + value, 0) / period;
  });
}

function calculateRMA(data, period) {
  const result = [];
  const seedValues = [];
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

function calculateLinreg(data, period) {
  const result = [];
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

function calculateHighest(data, period) {
  return data.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    return Math.max(...data.slice(start, i + 1));
  });
}

function calculateLowest(data, period) {
  return data.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    return Math.min(...data.slice(start, i + 1));
  });
}

function calculateTrueRangeFromSeries(highs, lows, closes) {
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

function calculateATRFromSeries(highs, lows, closes, period = 1) {
  const trueRange = calculateTrueRangeFromSeries(highs, lows, closes);
  return period === 1 ? trueRange : calculateRMA(trueRange, period);
}

function calculateHeikinAshiQuotes(quotes) {
  const result = [];

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

function isCrossover(source, target, index) {
  return index > 0 &&
    isFiniteNumber(source[index]) &&
    isFiniteNumber(target[index]) &&
    isFiniteNumber(source[index - 1]) &&
    isFiniteNumber(target[index - 1]) &&
    source[index] > target[index] &&
    source[index - 1] <= target[index - 1];
}

function isCrossunder(source, target, index) {
  return index > 0 &&
    isFiniteNumber(source[index]) &&
    isFiniteNumber(target[index]) &&
    isFiniteNumber(source[index - 1]) &&
    isFiniteNumber(target[index - 1]) &&
    source[index] < target[index] &&
    source[index - 1] >= target[index - 1];
}

function detectDivergences(quotes, momentum, signal, threshold) {
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

function calculateSqueezeDeluxe(quotes, len = 20, sig = 3, dfl = 30, dfh = false, trs = 25) {
  if (quotes.length < Math.max(len, dfl) + 20) return null;

  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  const hl2 = quotes.map(q => (q.high + q.low) / 2);

  const smaHl2 = calculateSMA(hl2, len);
  const highestHigh = calculateHighest(highs, len);
  const lowestLow = calculateLowest(lows, len);
  const syntheticHl2 = highestHigh.map((high, i) => (high + lowestLow[i]) / 2);
  const syntheticAtr = calculateATRFromSeries(highestHigh, lowestLow, closes, 1);

  const rawOsc = closes.map((close, i) => {
    const baseline = (syntheticHl2[i] + smaHl2[i]) / 2;
    const range = syntheticAtr[i];
    return isFiniteNumber(baseline) && isFiniteNumber(range) && range !== 0
      ? ((close - baseline) / range) * 100
      : Number.NaN;
  });

  const momentum = calculateLinreg(rawOsc, len);
  const signal = calculateSMA(momentum, sig);

  const atrLen = calculateATRFromSeries(highs, lows, closes, len);
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
  const fluxAtr = calculateATRFromSeries(fluxHighs, fluxLows, fluxCloses, dfl);
  const highChange = fluxHighs.map((high, i) => i === 0 ? 0 : Math.max(high - fluxHighs[i - 1], 0));
  const lowChange = fluxLows.map((low, i) => i === 0 ? 0 : Math.max((low - fluxLows[i - 1]) * -1, 0));
  const up = calculateRMA(highChange, dfl).map((value, i) =>
    isFiniteNumber(value) && isFiniteNumber(fluxAtr[i]) && fluxAtr[i] !== 0 ? value / fluxAtr[i] : Number.NaN
  );
  const down = calculateRMA(lowChange, dfl).map((value, i) =>
    isFiniteNumber(value) && isFiniteNumber(fluxAtr[i]) && fluxAtr[i] !== 0 ? value / fluxAtr[i] : Number.NaN
  );
  const fluxRatio = up.map((value, i) => {
    const total = value + down[i];
    return isFiniteNumber(value) && isFiniteNumber(down[i]) && total !== 0
      ? (value - down[i]) / total
      : Number.NaN;
  });
  const flux = calculateRMA(fluxRatio, Math.floor(dfl / 2)).map(value =>
    isFiniteNumber(value) ? value * 100 : Number.NaN
  );
  const overflux = flux.map(value => {
    if (!isFiniteNumber(value)) return Number.NaN;
    if (value > 25) return value - 25;
    if (value < -25) return value + 25;
    return Number.NaN;
  });

  const { isBullDiv, isBearDiv } = detectDivergences(quotes, momentum, signal, trs);
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
        Boolean(previousSqueeze && (previousSqueeze.low || previousSqueeze.mid)) &&
        isFiniteNumber(previousMomentum) &&
        value > previousMomentum
    };
  });
}

module.exports = { calculateSqueezeDeluxe };
