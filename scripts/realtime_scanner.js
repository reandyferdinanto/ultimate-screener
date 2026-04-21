const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

// Schemas
const settingsSchema = new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed });
const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

const stockSignalSchema = new mongoose.Schema({ ticker: String, status: String, signalSource: String });
const StockSignal = mongoose.models.StockSignal || mongoose.model("StockSignal", stockSignalSchema);

async function runScanner() {
    try {
        await mongoose.connect(MONGODB_URI);
        const config = await Settings.findOne({ key: "telegram_config" });
        
        if (!config || !config.value.botToken || !config.value.channelId || !config.value.isEnabled) {
            console.log("Real-time scanner disabled or not configured.");
            return;
        }

        const bot = new TelegramBot(config.value.botToken);
        const channelId = config.value.channelId;

        // Run the scan script (child process logic or import)
        // For simplicity, we query the latest Secret Sauce signals from DB that were found today
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);

        const latestSignals = await StockSignal.find({
            signalSource: { $regex: /Secret Sauce/i },
            createdAt: { $gte: startOfDay }
        });

        console.log(`Found ${latestSignals.length} Secret Sauce signals.`);

        for (const signal of latestSignals) {
            // Check if already notified today (metadata flag or log)
            // For now, send only the newest one
            const message = `🔮 *SECRET SAUCE DETECTED*\n\n` +
                          `Ticker: *${signal.ticker}*\n` +
                          `Source: AI Predictive Engine\n` +
                          `Status: Accumulation Breakout\n\n` +
                          `[View Chart](https://ultimate-screener.ebite.biz.id/search?symbol=${signal.ticker})`;
            
            await bot.sendMessage(channelId, message, { parse_mode: 'Markdown' });
        }

    } catch (e) {
        console.error("Scanner Error:", e.message);
    } finally {
        await mongoose.disconnect();
    }
}

// In a real production setup, this would loop or be a cron
runScanner();
