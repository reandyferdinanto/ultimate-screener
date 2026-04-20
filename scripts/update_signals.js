const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

const MONGODB_URI = "mongodb+srv://reandy:XuISHforC8mWVEKd@cluster0.ybmffcl.mongodb.net/ultimate_screener?retryWrites=true&w=majority&appName=Cluster0";

const stockSignalSchema = new mongoose.Schema({
  ticker: String,
  entryPrice: Number,
  currentPrice: Number,
  daysHeld: { type: Number, default: 0 },
  priceHistory: [{
    date: Date,
    price: Number
  }],
  status: String,
  targetPrice: Number,
  stopLossPrice: Number
}, { timestamps: true });
const StockSignal = mongoose.models.StockSignal || mongoose.model("StockSignal", stockSignalSchema);

async function updateSignals() {
  try {
    await mongoose.connect(MONGODB_URI);
    const pendingSignals = await StockSignal.find({ status: 'pending' });
    console.log(`Updating ${pendingSignals.length} pending signals...`);

    for (const signal of pendingSignals) {
      try {
        const result = await yahooFinance.quote(signal.ticker);
        if (!result || result.regularMarketPrice === undefined) continue;

        const currentPrice = result.regularMarketPrice;
        const now = new Date();
        
        // Calculate days held
        const entryDate = signal.entryDate || signal.createdAt;
        const diffTime = Math.abs(now.getTime() - entryDate.getTime());
        const daysHeld = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        // Update price history (limit to last 30 entries)
        const priceHistory = signal.priceHistory || [];
        // Only add to history if it's a new day or history is empty
        const lastEntry = priceHistory[priceHistory.length - 1];
        const isNewDay = !lastEntry || new Date(lastEntry.date).toDateString() !== now.toDateString();
        
        if (isNewDay) {
          priceHistory.push({ date: now, price: currentPrice });
        } else {
          // Update today's price
          lastEntry.price = currentPrice;
          lastEntry.date = now;
        }

        // Keep last 30 days
        if (priceHistory.length > 30) priceHistory.shift();

        // Check if target or SL reached
        let status = 'pending';
        if (currentPrice >= signal.targetPrice) status = 'success';
        if (signal.stopLossPrice && currentPrice <= signal.stopLossPrice) status = 'failed';

        await StockSignal.updateOne(
          { _id: signal._id },
          { 
            $set: { 
              currentPrice, 
              daysHeld, 
              priceHistory,
              status
            } 
          }
        );
        console.log(`Updated ${signal.ticker}: ${currentPrice} (${status})`);
      } catch (err) {
        console.error(`Error updating ${signal.ticker}:`, err.message);
      }
    }
    console.log("Update completed.");
  } finally {
    await mongoose.disconnect();
  }
}

updateSignals();
