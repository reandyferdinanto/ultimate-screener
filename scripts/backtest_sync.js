const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

const MONGODB_URI = "mongodb+srv://reandy:XuISHforC8mWVEKd@cluster0.ybmffcl.mongodb.net/ultimate_screener?retryWrites=true&w=majority&appName=Cluster0";

// Define Schemas manually for standalone script
const stockSignalSchema = new mongoose.Schema({
  ticker: String,
  entryDate: Date,
  entryPrice: Number,
  targetPrice: Number,
  stopLossPrice: Number,
  status: String,
  daysHeld: { type: Number, default: 0 },
  currentPrice: Number,
  priceHistory: [{ date: Date, price: Number }],
  signalSource: String,
}, { timestamps: true });
const StockSignal = mongoose.models.StockSignal || mongoose.model("StockSignal", stockSignalSchema);

const signalPerformanceSchema = new mongoose.Schema({
  ticker: String,
  entryDate: Date,
  exitDate: Date,
  entryPrice: Number,
  exitPrice: Number,
  durationDays: Number,
  isSuccess: Boolean,
  gainPct: Number,
  signalSource: String,
  priceHistory: [{ date: Date, price: Number }],
}, { timestamps: true });
const SignalPerformance = mongoose.models.SignalPerformance || mongoose.model("SignalPerformance", signalPerformanceSchema);

async function syncProgress() {
  try {
    await mongoose.connect(MONGODB_URI);
    const activeSignals = await StockSignal.find({ status: 'pending' });
    console.log(`Syncing progress for ${activeSignals.length} active signals...`);

    for (const signal of activeSignals) {
      try {
        const quote = await yahooFinance.quote(signal.ticker);
        const currentPrice = quote.regularMarketPrice;
        const now = new Date();

        // 1. Initialize History if empty
        if (!signal.priceHistory || signal.priceHistory.length === 0) {
            signal.priceHistory = [{ date: signal.entryDate, price: signal.entryPrice }];
        }

        // 2. Add today's price to history if it's a new day
        const lastRecord = signal.priceHistory[signal.priceHistory.length - 1];
        const lastDate = new Date(lastRecord.date).toDateString();
        const todayDate = now.toDateString();

        if (lastDate !== todayDate) {
            signal.priceHistory.push({ date: now, price: currentPrice });
            signal.daysHeld += 1;
        }

        signal.currentPrice = currentPrice;

        // 3. Check for TP/SL
        let shouldExit = false;
        let isSuccess = false;

        if (currentPrice >= signal.targetPrice) {
            shouldExit = true;
            isSuccess = true;
        } else if (signal.stopLossPrice && currentPrice <= signal.stopLossPrice) {
            shouldExit = true;
            isSuccess = false;
        }

        if (shouldExit) {
            console.log(`[EXIT] ${signal.ticker} | Success: ${isSuccess} | Price: ${currentPrice}`);
            
            // Create Performance Record
            await SignalPerformance.create({
                ticker: signal.ticker,
                entryDate: signal.entryDate,
                exitDate: now,
                entryPrice: signal.entryPrice,
                exitPrice: currentPrice,
                durationDays: signal.daysHeld,
                isSuccess: isSuccess,
                gainPct: ((currentPrice - signal.entryPrice) / signal.entryPrice) * 100,
                signalSource: signal.signalSource,
                priceHistory: signal.priceHistory
            });

            // Archive Signal
            signal.status = isSuccess ? 'success' : 'failed';
        }

        await signal.save();
      } catch (err) {
        console.error(`Error syncing ${signal.ticker}:`, err.message);
      }
    }

    console.log("Sync complete.");
  } finally {
    await mongoose.disconnect();
  }
}

syncProgress();
