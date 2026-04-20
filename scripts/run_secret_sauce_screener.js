const YahooFinance = require('yahoo-finance2').default;
const { RSI, MACD, MFI, SMA, EMA, ATR } = require('technicalindicators');
const { Client } = require('pg');
const mongoose = require('mongoose');

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const PG_URL = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5432/cerita_saham';
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://reandy:XuISHforC8mWVEKd@cluster0.ybmffcl.mongodb.net/ultimate_screener?retryWrites=true&w=majority&appName=Cluster0";

const indonesiaStockSchema = new mongoose.Schema({
  ticker: { type: String, required: true, unique: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const IndonesiaStockModel = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema, "indonesiastocks");

const delay = (ms) => new Promise(res => setTimeout(res, ms));

function calculateTechnicals(quotes) {
    if (!quotes || quotes.length < 50) return null;
    const closes = quotes.map(q => q.close).filter(c => c != null);
    const highs = quotes.map(q => q.high).filter(h => h != null);
    const lows = quotes.map(q => q.low).filter(l => l != null);
    const volumes = quotes.map(q => q.volume).filter(v => v != null);
    
    if (closes.length < 50) return null;

    const rsi = RSI.calculate({ period: 14, values: closes });
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 });
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const sma50 = SMA.calculate({ period: 50, values: closes });
    
    const currentPrice = closes[closes.length - 1];
    const lastEma20 = ema20[ema20.length - 1];
    
    // Relative Volume (Current vs Avg 10 days)
    const recentVol = volumes[volumes.length - 1];
    const avgVol10 = volumes.slice(-11, -1).reduce((a, b) => a + b, 0) / 10;
    const rVol = avgVol10 > 0 ? recentVol / avgVol10 : 1;

    return {
        price: currentPrice,
        rsi: rsi[rsi.length - 1],
        mfi: mfi[mfi.length - 1],
        ema20: lastEma20,
        rVol: rVol,
        distEma20_pct: ((currentPrice - lastEma20) / lastEma20) * 100,
        isAboveSma50: currentPrice > (sma50[sma50.length - 1] || 0)
    };
}

async function runScreener() {
    await mongoose.connect(MONGODB_URI);
    const pgClient = new Client({ connectionString: PG_URL });
    await pgClient.connect();

    console.log("🔍 RUNNING SECRET SAUCE PREDICTOR (SCREENER FOR MONDAY)...");
    
    const stocks = await IndonesiaStockModel.find({ active: true }, { ticker: 1 }).lean();
    const candidates = [];

    // Logic for "Secret Sauce" candidates:
    // 1. Price consolidation near EMA20 (Distance -2% to +5%)
    // 2. Rising Volume (RVol > 1.2) - showing accumulation
    // 3. RSI in "Ready" zone (40 - 60) - not overbought yet
    // 4. MFI showing money flow ( > 40 )

    const chunkSize = 40;
    for (let i = 0; i < stocks.length; i += chunkSize) {
        const chunk = stocks.slice(i, i + chunkSize);
        console.log(`Checking ${i + chunk.length}/${stocks.length} stocks...`);
        
        for (const s of chunk) {
            try {
                const ticker = s.ticker.includes('.JK') ? s.ticker : s.ticker + '.JK';
                const res = await yahooFinance.chart(ticker, { period1: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), interval: '1d' });
                
                if (!res.quotes || res.quotes.length < 50) continue;
                
                const tech = calculateTechnicals(res.quotes);
                if (!tech) continue;

                const isSecretSauce = 
                    tech.distEma20_pct >= -2 && tech.distEma20_pct <= 6 &&  // Consolidation near EMA20
                    tech.rVol >= 1.2 &&                                    // Accumulation volume
                    tech.rsi >= 40 && tech.rsi <= 65 &&                   // Healthy RSI (not overbought)
                    tech.mfi >= 45;                                       // Money Flow Index rising

                if (isSecretSauce) {
                    console.log(`🎯 CANDIDATE FOUND: ${ticker} | RVol: ${tech.rVol.toFixed(2)} | Dist EMA20: ${tech.distEma20_pct.toFixed(2)}%`);
                    candidates.push({ ticker, tech });
                }
            } catch (e) {}
        }
        await delay(1000);
    }

    // Save candidates to a special table or log for Monday analysis
    if (candidates.length > 0) {
        // We'll repurpose the summary table or log it to the ai_top_gainers_analysis as "PREDICTION"
        for (const cand of candidates) {
            const tickerClean = cand.ticker.replace('.JK', '');
            await pgClient.query(`
                INSERT INTO ai_top_gainers_analysis (ticker, date, gain_percentage, raw_technical_data, ai_verdict)
                VALUES ($1, CURRENT_DATE, $2, $3, $4)
                ON CONFLICT (ticker, date) DO UPDATE SET ai_verdict = $4, raw_technical_data = $3
            `, [tickerClean, 0, JSON.stringify(cand.tech), 'SECRET_SAUCE_CANDIDATE']);
        }
        console.log(`✅ Finished. Found ${candidates.length} candidates for Monday.`);
    }

    await mongoose.disconnect();
    await pgClient.end();
}

runScreener();
