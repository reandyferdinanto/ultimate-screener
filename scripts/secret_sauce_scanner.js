const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { RSI, MFI, EMA } = require('technicalindicators');
const { Client } = require('pg');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";
const PG_CONN = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham';

const indonesiaStockSchema = new mongoose.Schema({
  ticker: String,
  active: Boolean,
}, { collection: "indonesiastocks" });
const IndonesiaStock = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema);

const pgClient = new Client({ connectionString: PG_CONN });

function buildPreBreakoutWindow(quotes, breakoutIdx, windowSize = 10) {
    if (breakoutIdx < 20) return null;

    const subset = quotes.slice(0, breakoutIdx);
    const closes = subset.map(q => q.close).filter(value => value != null);
    const highs = subset.map(q => q.high).filter(value => value != null);
    const lows = subset.map(q => q.low).filter(value => value != null);
    const volumes = subset.map(q => q.volume).filter(value => value != null);

    if (closes.length < 20) return null;

    const rsiArr = RSI.calculate({ period: 14, values: closes });
    const mfiArr = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 });
    const ema20Arr = EMA.calculate({ period: 20, values: closes });

    const start = Math.max(19, subset.length - windowSize);
    const window = [];

    for (let i = start; i < subset.length; i++) {
        const quote = subset[i];
        const price = quote.close;
        const ema20 = ema20Arr[i - 19];
        const rsi = rsiArr[i - 14];
        const mfi = mfiArr[i - 14];
        const recentVolumes = volumes.slice(Math.max(0, i - 10), i);
        const avgVol = recentVolumes.length > 0 ? recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length : quote.volume;
        const range = (quote.high || price) - (quote.low || price);

        window.push({
            date: quote.date.toISOString().split('T')[0],
            close: price,
            volume: quote.volume,
            rsi: Number((rsi || 0).toFixed(2)),
            mfi: Number((mfi || 0).toFixed(2)),
            distEma20Pct: ema20 ? Number((((price - ema20) / ema20) * 100).toFixed(2)) : null,
            volRatio: avgVol > 0 ? Number((quote.volume / avgVol).toFixed(2)) : 1,
            rangePct: price > 0 ? Number(((range / price) * 100).toFixed(2)) : 0,
            closeNearHighPct: range > 0 ? Number((((price - quote.low) / range) * 100).toFixed(2)) : 100,
        });
    }

    return window;
}

function summarizeWindow(window) {
    if (!window || window.length === 0) return null;

    const closes = window.map(item => item.close);
    const last3 = closes.slice(-3);

    const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

    return {
        windowCandles: window.length,
        avgRsi: Number(avg(window.map(item => item.rsi)).toFixed(2)),
        avgMfi: Number(avg(window.map(item => item.mfi)).toFixed(2)),
        minDistEma20Pct: Number(Math.min(...window.map(item => item.distEma20Pct ?? 0)).toFixed(2)),
        maxDistEma20Pct: Number(Math.max(...window.map(item => item.distEma20Pct ?? 0)).toFixed(2)),
        avgVolRatio: Number(avg(window.map(item => item.volRatio)).toFixed(2)),
        maxVolRatio: Number(Math.max(...window.map(item => item.volRatio)).toFixed(2)),
        avgCompressionPct: Number(avg(window.map(item => item.rangePct)).toFixed(2)),
        avgCloseNearHighPct: Number(avg(window.map(item => item.closeNearHighPct)).toFixed(2)),
        last3TightnessPct: closes.length >= 3 ? Number((((Math.max(...last3) - Math.min(...last3)) / closes[closes.length - 1]) * 100).toFixed(2)) : null,
    };
}

async function scan() {
  try {
    await mongoose.connect(MONGODB_URI);
    await pgClient.connect();
    console.log('Connected to DBs');

    const stocks = await IndonesiaStock.find({ active: true });
    console.log(`Scanning ${stocks.length} stocks for historical winners...`);

    const batchSize = 10;
    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);
      await Promise.all(batch.map(async (stock) => {
        try {
          // Check last 5 days for a breakout
          const chart = await yahooFinance.chart(stock.ticker, { period1: new Date(Date.now() - 7 * 86400000), interval: '1d' });
          if (!chart || !chart.quotes) return;
          
          const quotes = chart.quotes.filter(q => q.close !== null);
          if (quotes.length < 2) return;

          for (let j = 1; j < quotes.length; j++) {
            const current = quotes[j];
            const prev = quotes[j - 1];
            const gain = ((current.close - prev.close) / prev.close) * 100;
            
            // Sustained gain filter: Gain > 20% AND closed near high
            const range = current.high - current.low;
            const sustainedLevel = range > 0 ? (current.close - current.low) / range : 1;
            
            if (gain >= 20 && sustainedLevel > 0.8) {
              console.log(`[CANDIDATE] ${stock.ticker} on ${current.date.toISOString().split('T')[0]} | Gain: ${gain.toFixed(2)}% | Sustained: ${sustainedLevel.toFixed(2)}`);
              
              // Pull more context
              const [d1_60, h1_5, m15_2] = await Promise.all([
                  yahooFinance.chart(stock.ticker, { period1: new Date(current.date.getTime() - 60 * 86400000), period2: new Date(current.date.getTime() + 86400000), interval: '1d' }),
                  yahooFinance.chart(stock.ticker, { period1: new Date(current.date.getTime() - 5 * 86400000), period2: new Date(current.date.getTime() + 86400000), interval: '1h' }),
                  yahooFinance.chart(stock.ticker, { period1: new Date(current.date.getTime() - 2 * 86400000), period2: new Date(current.date.getTime() + 86400000), interval: '15m' })
              ]);

              // Calculate pre-breakout technicals from d1_60
              const breakoutIdx = d1_60.quotes.findIndex(q => q.date.toISOString().split('T')[0] === current.date.toISOString().split('T')[0]);
              console.log(`[DEBUG] ${stock.ticker} breakoutIdx: ${breakoutIdx}`);
              const preWindow = buildPreBreakoutWindow(d1_60.quotes, breakoutIdx, 10);
              const preTech = summarizeWindow(preWindow);

              if (preTech && preWindow) {
                  await pgClient.query(`
                    INSERT INTO secret_sauce_samples (ticker, breakout_date, gain_percentage, data_1d, data_1h, data_15m, pre_breakout_technicals, pre_breakout_window, pre_breakout_summary)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (ticker, breakout_date) DO UPDATE 
                    SET gain_percentage = EXCLUDED.gain_percentage,
                        data_1d = EXCLUDED.data_1d,
                        data_1h = EXCLUDED.data_1h,
                        data_15m = EXCLUDED.data_15m,
                        pre_breakout_technicals = EXCLUDED.pre_breakout_technicals,
                        pre_breakout_window = EXCLUDED.pre_breakout_window,
                        pre_breakout_summary = EXCLUDED.pre_breakout_summary
                  `, [
                      stock.ticker, 
                      current.date.toISOString().split('T')[0], 
                      gain, 
                      JSON.stringify(d1_60.quotes), 
                      JSON.stringify(h1_5.quotes), 
                      JSON.stringify(m15_2.quotes), 
                      JSON.stringify(preTech),
                      JSON.stringify(preWindow),
                      JSON.stringify(preTech)
                  ]);
                  console.log(`[SAVED] ${stock.ticker} for ${current.date.toISOString().split('T')[0]}`);
              } else {
                  console.log(`[SKIP] ${stock.ticker} - Insufficient historical data for indicators`);
              }
              break; // One sample per ticker per week is enough for pattern discovery
            }
          }
        } catch (e) {
          // ignore individual ticker errors
        }
      }));
      console.log(`Progress: ${i}/${stocks.length}`);
      await new Promise(r => setTimeout(r, 500));
    }

    console.log('Historical scan completed.');
  } finally {
    await mongoose.disconnect();
    await pgClient.end();
  }
}

scan();
