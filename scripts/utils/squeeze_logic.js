const { sma, ema, rma, atr } = require('indicatorts');

function calculateStdev(data, period) {
  const result = [];
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

function calculateLinreg(data, period) {
  const result = [];
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

function calculateSqueezeDeluxe(quotes, len = 20, sig = 3, dfl = 30) {
  if (quotes.length < Math.max(len, dfl) + 20) return null;

  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const closes = quotes.map(q => q.close);
  const hl2 = quotes.map(q => (q.high + q.low) / 2);
  
  const smaHl2 = sma(hl2, { period: len });
  const atrRes = atr(highs, lows, closes, { period: len });
  const atrVal = atrRes.atrLine;
  
  // 1. Momentum Oscillator
  const rawOsc = closes.map((c, i) => {
    const avgVal = (hl2[i] + (smaHl2[i] || hl2[i])) / 2;
    const denom = atrVal[i] || 1;
    return ((c - avgVal) / denom) * 100;
  });
  const momentum = calculateLinreg(rawOsc, len);
  const signal = sma(momentum, { period: sig });

  // 2. Squeeze Logic
  const dev = calculateStdev(closes, len);
  const sqzItems = dev.map((d, i) => {
    const a = atrVal[i] || 1;
    return {
      high: d < a * 0.5,
      mid: d < a * 0.75,
      low: d < a * 1.0
    };
  });

  // 3. Directional Flux (DFO)
  const changeH = highs.map((h, i) => i === 0 ? 0 : Math.max(0, h - highs[i-1]));
  const changeL = lows.map((l, i) => i === 0 ? 0 : Math.max(0, lows[i-1] - l));
  
  const up = rma(changeH, { period: dfl }).map((v, i) => v / (atrVal[i] || 1));
  const dn = rma(changeL, { period: dfl }).map((v, i) => v / (atrVal[i] || 1));
  
  const fluxRatio = up.map((u, i) => {
    const sum = u + dn[i];
    return sum === 0 ? 0 : (u - dn[i]) / sum;
  });
  
  const flux = rma(fluxRatio, { period: Math.floor(dfl / 2) }).map(v => v * 100);

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
    momentum: m,
    signal: signal[i],
    flux: flux[i],
    squeeze: sqzItems[i],
    isBullDiv: isBullDiv[i]
  }));
}

module.exports = { calculateSqueezeDeluxe };
