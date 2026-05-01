const { calculateSqueezeDeluxe } = require('./utils/squeeze_logic');
const { ema, macd } = require('indicatorts');
const { rsi, mfi } = require('technicalindicators');

function analyzeCOALJAWA() {
  // COAL data for 2026-04-21
  const coalData = [
    { date: '2026-04-21', open: 53, high: 53, low: 51, close: 53, volume: 93573600 },
    { date: '2026-04-22', open: 53, high: 71, low: 53, close: 71, volume: 2068775600 },
    { date: '2026-04-23', open: 80, high: 88, low: 71, close: 76, volume: 86739604 },
    { date: '2026-04-24', open: 78, high: 78, low: 65, close: 65, volume: 1031466000 }
  ];

  // JAWA data for 2026-04-24
  const jawaData = [
    { date: '2026-04-24', open: 164, high: 165, low: 145, close: 153, volume: 722900 }
  ];

  // Calculate indicators for COAL
  const coalCloses = coalData.map(d => d.close);
  const coalHighs = coalData.map(d => d.high);
  const coalLows = coalData.map(d => d.low);
  const coalVolumes = coalData.map(d => d.volume);

  // EMA
  const ema20 = ema(coalCloses, { period: 20 });
  const ema50 = ema(coalCloses, { period: 50 });

  // MACD
  const macdResult = macd(coalCloses, { fast: 12, slow: 26, signal: 9 });
  const macdLine = macdResult.macdLine;
  const signalLine = macdResult.signalLine;

  // RSI
  const rsiValues = rsi({ period: 14, values: coalCloses });
  
  // MFI
  const mfiValues = mfi({
    high: coalHighs,
    low: coalLows,
    close: coalCloses,
    volume: coalVolumes,
    period: 14
  });

  // Pivot Points (using previous day data)
  const prevDay = { high: 53, low: 51, close: 53 };
  const pivotPoints = {
    p: (prevDay.high + prevDay.low + prevDay.close) / 3,
    r1: 2 * ((prevDay.high + prevDay.low + prevDay.close) / 3) - prevDay.low,
    s1: 2 * ((prevDay.high + prevDay.low + prevDay.close) / 3) - prevDay.high,
  };

  console.log('=== COAL.JK Analysis (2026-04-21) ===');
  console.log('Price:', coalData[0].close);
  console.log('RSI:', rsiValues[rsiValues.length - 1] || 'N/A');
  console.log('MFI:', mfiValues[mfiValues.length - 1] || 'N/A');
  console.log('MACD:', macdLine[macdLine.length - 1]);
  console.log('Signal Line:', signalLine[signalLine.length - 1]);
  console.log('EMA20:', ema20[ema20.length - 1]);
  console.log('EMA50:', ema50[ema50.length - 1]);
  console.log('Pivot Point:', pivotPoints.p);
  console.log('R1:', pivotPoints.r1);
  console.log('S1:', pivotPoints.s1);
}

analyzeCOALJAWA();