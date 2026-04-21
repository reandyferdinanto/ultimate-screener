const mongoose = require('mongoose');

const indonesiaStockSchema = new mongoose.Schema({
  ticker: { type: String, required: true, unique: true },
  symbol: { type: String, required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const IndonesiaStockModel = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema, "indonesiastocks");

const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { RSI, MACD, MFI, SMA, EMA, ATR } = require('technicalindicators');
const { Client } = require('pg');
const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyA73HYqtjNgTBoi6RYXG6S-OI9YO9_rze0");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";
const PG_URL = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function getStockList() {
    await mongoose.connect(MONGODB_URI);
    const stocks = await IndonesiaStockModel.find({ active: true }, { ticker: 1 }).lean();
    return stocks.map(s => s.ticker.includes('.JK') ? s.ticker : s.ticker + '.JK');
}

function calculateTechnicals(rawQuotes) {
    if (!rawQuotes || rawQuotes.length < 50) return null;
    const quotes = rawQuotes.filter(q => q.close != null && q.volume != null && q.high != null && q.low != null);
    if (quotes.length < 50) return null;

    const closes = quotes.map(q => q.close);
    const highs = quotes.map(q => q.high);
    const lows = quotes.map(q => q.low);
    const volumes = quotes.map(q => q.volume);
    
    const rsi14 = RSI.calculate({ period: 14, values: closes });
    const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const mfi14 = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 });
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const sma50 = SMA.calculate({ period: 50, values: closes });
    const sma200 = SMA.calculate({ period: 200, values: closes });
    const atr14 = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
    
    const recentVolume = volumes[volumes.length - 1];
    const avgVol10 = volumes.slice(-11, -1).reduce((a, b) => a + b, 0) / 10;
    const rVol = avgVol10 > 0 ? recentVolume / avgVol10 : 1;
    const currentPrice = closes[closes.length - 1];
    
    return {
        price: currentPrice,
        RSI_14: rsi14.length > 0 ? rsi14[rsi14.length - 1] : null,
        MACD: macd.length > 0 ? macd[macd.length - 1] : null,
        MFI_14: mfi14.length > 0 ? mfi14[mfi14.length - 1] : null,
        EMA_20: ema20.length > 0 ? ema20[ema20.length - 1] : null,
        SMA_50: sma50.length > 0 ? sma50[sma50.length - 1] : null,
        SMA_200: sma200.length > 0 ? sma200[sma200.length - 1] : null,
        ATR_14: atr14.length > 0 ? atr14[atr14.length - 1] : null,
        RVol: rVol,
        dist_to_MA20_pct: ema20.length > 0 ? ((currentPrice - ema20[ema20.length - 1]) / ema20[ema20.length - 1]) * 100 : null
    };
}

const analysisSchema = {
    type: SchemaType.OBJECT,
    properties: {
        verdict: { type: SchemaType.STRING },
        key_driver: { type: SchemaType.STRING },
        support: { type: SchemaType.NUMBER },
        resistance: { type: SchemaType.NUMBER },
        trend_1d: { type: SchemaType.STRING },
        trend_1h: { type: SchemaType.STRING },
        trend_15m: { type: SchemaType.STRING },
        actionable_insight: { type: SchemaType.STRING },
        pattern_score: { type: SchemaType.NUMBER }
    },
    required: ["verdict", "key_driver", "support", "resistance", "trend_1d", "trend_1h", "trend_15m", "actionable_insight", "pattern_score"]
};

async function analyzeWithGemini(ticker, data) {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3-flash-preview",
            generationConfig: { responseMimeType: "application/json", responseSchema: analysisSchema, temperature: 0.1 }
        });
        const prompt = `Analyze stock ${ticker} spike. Technical Data: ${JSON.stringify(data)}`;
        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text());
    } catch (e) { console.error(`Gemini Error: ${e.message}`); return null; }
}

async function run() {
    const pgClient = new Client({ connectionString: PG_URL });
    await pgClient.connect();
    
    try {
        const tickers = await getStockList();
        const topGainers = [];
        const chunkSize = 40;

        for (let i = 0; i < tickers.length; i += chunkSize) {
            const chunk = tickers.slice(i, i + chunkSize);
            console.log(`Scanning ${i + chunk.length}/${tickers.length}...`);
            for (const ticker of chunk) {
                try {
                    const res = await yahooFinance.chart(ticker, { period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), interval: '1d' });
                    if (!res.quotes || res.quotes.length < 3) continue;
                    const q = res.quotes;
                    const t = q[q.length-1], y = q[q.length-2], t2 = q[q.length-3];
                    if (!t.close || !y.close || !t2.close) continue;
                    
                    const g1 = (t.close - y.close)/y.close;
                    const g2 = (t.close - t2.close)/t2.close;
                    
                    if (g1 >= 0.19 || g2 >= 0.19) {
                        console.log(`🚀 BREAKOUT DETECTED: ${ticker} | 1D: ${(g1*100).toFixed(2)}% | 2D: ${(g2*100).toFixed(2)}%`);
                        topGainers.push({ ticker, g1 });
                    }
                } catch (e) { /* console.error(`Err ${ticker}: ${e.message}`); */ }
            }
            await delay(1000);
        }

        console.log(`Found ${topGainers.length} gainers. Analyzing...`);
        for (const g of topGainers) {
            try {
                console.log(`Deep Fetch ${g.ticker}...`);
                const [c1d, c1h, c15m] = await Promise.all([
                    yahooFinance.chart(g.ticker, { period1: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), interval: '1d' }),
                    yahooFinance.chart(g.ticker, { period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), interval: '60m' }),
                    yahooFinance.chart(g.ticker, { period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), interval: '15m' })
                ]);
                const data = {
                    ticker: g.ticker.replace('.JK',''),
                    tech_1d: calculateTechnicals(c1d.quotes),
                    tech_1h: calculateTechnicals(c1h.quotes),
                    tech_15m: calculateTechnicals(c15m.quotes)
                };
                const ai = await analyzeWithGemini(data.ticker, data);
                if (ai) {
                    await pgClient.query(
                        `INSERT INTO ai_top_gainers_analysis (ticker, date, gain_percentage, raw_technical_data, ai_verdict, ai_analysis_full)
                         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
                         ON CONFLICT (ticker, date) DO UPDATE SET raw_technical_data=$3, ai_verdict=$4, ai_analysis_full=$5`,
                        [data.ticker, g.g1 * 100, data, ai.verdict, ai]
                    );
                    console.log(`✅ Analyzed ${data.ticker}: ${ai.verdict}`);
                }
                await delay(2000);
            } catch (err) { console.error(`Analyze Error ${g.ticker}:`, err.message); }
        }
    } finally {
        await mongoose.disconnect();
        await pgClient.end();
    }
}

run();
