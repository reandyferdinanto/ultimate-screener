const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { rsi, mfi, ema } = require('indicatorts');
const { Client } = require('pg');

const MONGODB_URI = "mongodb+srv://reandy:XuISHforC8mWVEKd@cluster0.ybmffcl.mongodb.net/ultimate_screener?retryWrites=true&w=majority&appName=Cluster0";
const PG_CONN = 'postgresql://reandyapp:reandy123456@127.0.0.1:5432/cerita_saham';

const indonesiaStockSchema = new mongoose.Schema({
  ticker: String,
  active: Boolean,
}, { collection: "indonesiastocks" });
const IndonesiaStock = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema);

const pgClient = new Client({ connectionString: PG_CONN });

async function getPreBreakoutTechnicals(quotes, breakoutIdx) {
    if (breakoutIdx < 20) return null;
    const subset = quotes.slice(0, breakoutIdx);
    const closes = subset.map(q => q.close);
    const highs = subset.map(q => q.high);
    const lows = subset.map(q => q.low);
    const volumes = subset.map(q => q.volume);
    
    const rsiArr = rsi(closes, { period: 14 });
    const mfiArr = mfi(highs, lows, closes, volumes, { period: 14 });
    const ema20Arr = ema(closes, { period: 20 });
    
    const lastPrice = closes[closes.length - 1];
    const lastVol = volumes[volumes.length - 1];
    const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

    return {
        rsi: rsiArr[rsiArr.length - 1],
        mfi: mfiArr[mfiArr.length - 1],
        ema20: ema20Arr[ema20Arr.length - 1],
        distEma20: ((lastPrice - ema20Arr[ema20Arr.length - 1]) / ema20Arr[ema20Arr.length - 1]) * 100,
        volRatio: lastVol / avgVol20,
        consolidation_score: Math.abs(closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 1] * 100 // % variance last 3 days
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
              const preTech = await getPreBreakoutTechnicals(d1_60.quotes, breakoutIdx);

              if (preTech) {
                  await pgClient.query(`
                    INSERT INTO secret_sauce_samples (ticker, breakout_date, gain_percentage, data_1d, data_1h, data_15m, pre_breakout_technicals)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (ticker, breakout_date) DO UPDATE 
                    SET gain_percentage = EXCLUDED.gain_percentage, data_1d = EXCLUDED.data_1d, data_1h = EXCLUDED.data_1h, data_15m = EXCLUDED.data_15m, pre_breakout_technicals = EXCLUDED.pre_breakout_technicals
                  `, [
                      stock.ticker, 
                      current.date.toISOString().split('T')[0], 
                      gain, 
                      JSON.stringify(d1_60.quotes), 
                      JSON.stringify(h1_5.quotes), 
                      JSON.stringify(m15_2.quotes), 
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
