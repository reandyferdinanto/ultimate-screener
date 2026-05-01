const mongoose = require('mongoose');

const stockSignalSchema = new mongoose.Schema({
  ticker: String,
  sector: String,
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

async function checkEmaBounceToday() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

    await mongoose.connect(MONGODB_URI);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check EMA BOUNCE signals from today
    const emaBounceToday = await StockSignal.find({
      status: 'pending',
      $or: [
        { signalSource: /EMA Bounce/i },
        { 'metadata.category': 'EMA_BOUNCE' },
        { 'metadata.category': 'EMA_BOUNCE_DAILY' }
      ],
      updatedAt: { $gte: today }
    }).sort({ updatedAt: -1 });

    console.log(`EMA BOUNCE signals today (${today.toDateString()}): ${emaBounceToday.length}`);
    emaBounceToday.forEach((s, i) => {
      console.log(`${i+1}. ${s.ticker}`);
      console.log(`   Signal: ${s.signalSource}`);
      console.log(`   Price: ${s.entryPrice} -> ${s.targetPrice}`);
      console.log(`   Confidence: ${s.metadata?.confidenceLevel || 'N/A'}`);
      console.log(`   Expected: ${s.metadata?.expectedReturn || 'N/A'}`);
      console.log(`   Updated: ${s.updatedAt}`);
      console.log(`   Vector: ${s.metadata?.vector || 'N/A'}`);
      console.log('---');
    });

    if (emaBounceToday.length === 0) {
      console.log('No EMA BOUNCE signals found today. Checking recent ones...');

      // Check last 3 days for comparison
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const recentEmaBounce = await StockSignal.find({
        status: 'pending',
        $or: [
          { signalSource: /EMA Bounce/i },
          { 'metadata.category': 'EMA_BOUNCE' },
          { 'metadata.category': 'EMA_BOUNCE_DAILY' }
        ],
        updatedAt: { $gte: threeDaysAgo }
      }).sort({ updatedAt: -1 }).limit(10);

      console.log(`Recent EMA BOUNCE signals (last 3 days): ${recentEmaBounce.length}`);
      recentEmaBounce.forEach((s, i) => {
        console.log(`${i+1}. ${s.ticker} - ${s.signalSource} - ${s.updatedAt}`);
      });

      // Check all signals from today to see what categories exist
      const allSignalsToday = await StockSignal.find({
        status: 'pending',
        updatedAt: { $gte: today }
      }).sort({ updatedAt: -1 }).limit(5);

      console.log(`\nAll signals today: ${allSignalsToday.length}`);
      allSignalsToday.forEach(s => {
        console.log(`${s.ticker} - ${s.signalSource} - Category: ${s.metadata?.category || 'N/A'}`);
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkEmaBounceToday();