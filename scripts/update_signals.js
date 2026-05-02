const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

const stockSignalSchema = new mongoose.Schema({
  ticker: String,
  signalSource: String,
  entryDate: Date,
  entryPrice: Number,
  currentPrice: Number,
  daysHeld: { type: Number, default: 0 },
  priceHistory: [{
    date: Date,
    price: Number
  }],
  status: String,
  targetPrice: Number,
  stopLossPrice: Number,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });
const StockSignal = mongoose.models.StockSignal || mongoose.model("StockSignal", stockSignalSchema);

const ACTIVE_MARKET_MINUTES_PER_DAY = 330;
const D2_ACTIVE_MARKET_MINUTES = ACTIVE_MARKET_MINUTES_PER_DAY * 2;

function parseQuoteTime(value, fallback) {
  if (!value) return fallback;
  const date = value instanceof Date
    ? value
    : (typeof value === 'number' ? new Date(value * 1000) : new Date(String(value)));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function jakartaParts(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const get = (type) => (parts.find(part => part.type === type) || {}).value || '';
  return {
    weekday: get('weekday'),
    minutes: (Number(get('hour')) * 60) + Number(get('minute')),
  };
}

function isActiveIdxSession(value) {
  const { weekday, minutes } = jakartaParts(value);
  if (['Sat', 'Sun'].includes(weekday)) return false;
  return (minutes >= 9 * 60 && minutes < 12 * 60) ||
    (minutes >= (13 * 60) + 30 && minutes < 16 * 60);
}

function countActiveMarketMinutes(startTime, endTime) {
  if (!startTime || !endTime || endTime <= startTime) return 0;
  const stepMinutes = 15;
  let activeMinutes = 0;

  for (let cursor = startTime; cursor < endTime; cursor += stepMinutes * 60 * 1000) {
    const nextCursor = Math.min(cursor + stepMinutes * 60 * 1000, endTime);
    if (isActiveIdxSession(new Date(cursor))) {
      activeMinutes += Math.round((nextCursor - cursor) / (60 * 1000));
    }
  }

  return activeMinutes;
}

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
        const marketDataDate = parseQuoteTime(result.regularMarketTime || result.postMarketTime || result.preMarketTime, now);
        
        // Calculate days held
        const entryDate = signal.entryDate || signal.createdAt;
        const diffTime = Math.abs(now.getTime() - entryDate.getTime());
        const daysHeld = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const activeMarketMinutes = countActiveMarketMinutes(entryDate.getTime(), marketDataDate.getTime());
        const activeMarketHours = Math.floor(activeMarketMinutes / 60);

        // Update price history (limit to last 30 entries)
        const priceHistory = signal.priceHistory || [];
        // Only add to history if it's a new day or history is empty
        const lastEntry = priceHistory[priceHistory.length - 1];
        const isNewDay = !lastEntry || new Date(lastEntry.date).toDateString() !== marketDataDate.toDateString();
        
        if (isNewDay) {
          priceHistory.push({ date: marketDataDate, price: currentPrice });
        } else {
          // Update today's price
          lastEntry.price = currentPrice;
          lastEntry.date = marketDataDate;
        }

        // Keep last 30 days
        if (priceHistory.length > 30) priceHistory.shift();

        // Check target, stop, and D+2 evaluation.
        let status = 'pending';
        let evaluationStatus = activeMarketMinutes >= D2_ACTIVE_MARKET_MINUTES ? 'CONTINUE_D2' : 'WATCHING_D2';
        if (currentPrice >= signal.targetPrice) status = 'success';
        if (signal.stopLossPrice && currentPrice <= signal.stopLossPrice) status = 'failed';
        if (status === 'pending' && activeMarketMinutes >= D2_ACTIVE_MARKET_MINUTES && currentPrice < signal.entryPrice) {
          status = 'failed';
          evaluationStatus = 'FAILED_D2';
        }
        if (status === 'success') evaluationStatus = 'TARGET_REACHED';
        if (status === 'failed' && evaluationStatus !== 'FAILED_D2') evaluationStatus = 'STOP_REACHED';

        await StockSignal.updateOne(
          { _id: signal._id },
          { 
            $set: { 
              currentPrice, 
              daysHeld, 
              priceHistory,
              status,
              metadata: {
                ...(signal.metadata || {}),
                evaluationStatus,
                activeMarketHours,
                evaluatedAt: activeMarketMinutes >= D2_ACTIVE_MARKET_MINUTES ? marketDataDate.toISOString() : signal.metadata?.evaluatedAt,
                latestPrice: currentPrice,
                lastQuoteDate: marketDataDate.toISOString()
              }
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
