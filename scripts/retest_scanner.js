const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const { ema, forceIndex, kdj, vortex } = require('indicatorts');
const TelegramBot = require('node-telegram-bot-api');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

// Schemas
const settingsSchema = new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed });
const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

const indonesiaStockSchema = new mongoose.Schema({
  ticker: String,
  active: Boolean,
  name: String,
}, { collection: "indonesiastocks" });
const IndonesiaStock = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema);

const stockSignalSchema = new mongoose.Schema({
  ticker: String,
  signalSource: String,
  entryDate: Date,
  entryPrice: Number,
  targetPrice: Number,
  stopLossPrice: Number,
  status: { type: String, default: 'pending' },
  daysHeld: { type: Number, default: 0 },
  currentPrice: Number,
  priceHistory: [{
    date: Date,
    price: Number
  }],
  metadata: Object,
}, { timestamps: true });
const StockSignal = mongoose.models.StockSignal || mongoose.model("StockSignal", stockSignalSchema);

async function sendAlert(results) {
    const config = await Settings.findOne({ key: "telegram_config" });
    if (!config || !config.value.botToken || !config.value.channelId) {
        console.log("Telegram alert skipped: Config missing.");
        return;
    }

    const bot = new TelegramBot(config.value.botToken);
    const channelId = config.value.channelId;

    let message = `🎯 *PERFECT RETEST ALERT* 🎯\n`;
    message += `Found ${results.length} stocks bouncing at EMA20\n\n`;

    // Ambil 5 terbaik berdasarkan Jarak ke EMA20 paling rapat
    const top5 = results.sort((a, b) => Math.abs(a.metadata.dist20) - Math.abs(b.metadata.dist20)).slice(0, 5);

    top5.forEach(s => {
        message += `🚀 *${s.ticker}*\n`;
        message += `💰 Price: ${s.entryPrice} | Dist: ${s.metadata.dist20}%\n`;
        message += `📈 KDJ-J: ${s.metadata.kdj_j} ↑\n`;
        message += `🎯 Target: ${s.targetPrice} | SL: ${s.stopLossPrice}\n`;
        message += `[Analyze Here](https://ultimate-screener.ebite.biz.id/search?symbol=${s.ticker})\n\n`;
    });

    try {
        await bot.sendMessage(channelId, message, { parse_mode: 'Markdown' });
        console.log("Telegram alert sent!");
    } catch (e) {
        console.error("Failed to send Telegram alert:", e.message);
    }
}

async function analyzeRetest(stock) {
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - 60);
    const result = await yahooFinance.chart(stock.ticker, { period1, interval: "1d" });
    
    if (!result || !result.quotes || result.quotes.length < 30) return null;
    const quotes = result.quotes.filter(q => q.close !== null);
    
    const closes = quotes.map(q => q.close);
    const highs = quotes.map(q => q.high);
    const lows = quotes.map(q => q.low);
    const volumes = quotes.map(q => q.volume);
    
    const lastIdx = quotes.length - 1;
    const price = closes[lastIdx];
    const prevPrice = closes[lastIdx - 1];

    if (price <= 50) return null;

    // 1. EMA20 Area
    const ema20Arr = ema(closes, { period: 20 });
    const lastEma20 = ema20Arr[ema20Arr.length - 1];
    const dist20 = ((price - lastEma20) / lastEma20) * 100;

    // 2. Force Index
    const fiArr = forceIndex(closes, volumes, { period: 13 });
    const lastFI = fiArr[fiArr.length - 1];
    const prevFI = fiArr[fiArr.length - 2];

    // 3. KDJ
    const kdjResult = kdj(highs, lows, closes, { rPeriod: 9, kPeriod: 3, dPeriod: 3 });
    const lastJ = kdjResult.j[kdjResult.j.length - 1];
    const prevJ = kdjResult.j[kdjResult.j.length - 2];

    // 4. Vortex
    const viResult = vortex(highs, lows, closes, { period: 14 });
    const viPlus = viResult.plus[viResult.plus.length - 1];
    const viMinus = viResult.minus[viResult.minus.length - 1];

    // CRITERIA: THE PERFECT RETEST
    const isRetestZone = dist20 >= -1.0 && dist20 <= 3.5;
    const isBouncing = lastFI > prevFI && lastJ > prevJ;
    const isTrendBullish = viPlus > viMinus;

    if (isRetestZone && isBouncing && isTrendBullish) {
        return {
            ticker: stock.ticker,
            signalSource: "The Perfect Retest (EMA20)", 
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.15), // Target 15%
            stopLossPrice: Math.round(lastEma20 * 0.97), // SL 3% di bawah EMA20
            daysHeld: 0,
            priceHistory: [{ date: new Date(), price: price }],
            metadata: { 
                dist20: dist20.toFixed(2),
                forceIndex: lastFI.toFixed(0),
                kdj_j: lastJ.toFixed(1),
                vortex: "Bullish"
            }
        };
    }
    return null;
  } catch (err) { return null; }
}

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const stocks = await IndonesiaStock.find({ active: true });
    console.log(`Scanning for Perfect Retest in ${stocks.length} stocks...`);
    
    const results = [];
    for (let i = 0; i < stocks.length; i += 15) {
        const batch = stocks.slice(i, i + 15);
        const batchResults = await Promise.all(batch.map(s => analyzeRetest(s)));
        results.push(...batchResults.filter(r => r !== null));
        if (i % 150 === 0) console.log(`Progress: ${i}/${stocks.length}`);
    }

    if (results.length > 0) {
      await StockSignal.updateMany({ signalSource: "The Perfect Retest (EMA20)", status: 'pending' }, { $set: { status: 'archived' } });
      await StockSignal.insertMany(results);
      console.log(`Success: ${results.length} Retest signals saved.`);
      
      // KIRIM ALERT KE TELEGRAM
      await sendAlert(results);
    } else {
      console.log("No new Retest signals found.");
    }
  } finally {
    await mongoose.disconnect();
  }
}
run();
