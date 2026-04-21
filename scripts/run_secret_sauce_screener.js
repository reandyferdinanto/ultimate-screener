const YahooFinance = require('yahoo-finance2').default;
const { RSI, MFI, SMA, EMA } = require('technicalindicators');
const { Client } = require('pg');
const mongoose = require('mongoose');
const { normalizeFormula } = require('./secret_sauce_formula_utils');

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const PG_URL = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham';
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

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
    const lastSma50 = sma50[sma50.length - 1];
    const currentHigh = highs[highs.length - 1];
    const currentLow = lows[lows.length - 1];
    
    // Relative Volume (Current vs Avg 10 days)
    const recentVol = volumes[volumes.length - 1];
    const avgVol10 = volumes.slice(-11, -1).reduce((a, b) => a + b, 0) / 10;
    const rVol = avgVol10 > 0 ? recentVol / avgVol10 : 1;

    const recentHighs = highs.slice(-5);
    const recentLows = lows.slice(-5);
    const compressionPct = currentPrice > 0
        ? ((Math.max(...recentHighs) - Math.min(...recentLows)) / currentPrice) * 100
        : 0;
    const intradayRange = currentHigh - currentLow;
    const closeNearHighPct = intradayRange > 0
        ? ((currentPrice - currentLow) / intradayRange) * 100
        : 100;

    // [NEW] ATR Compression Detection
    const trueRanges = [];
    for (let i = 0; i < quotes.length; i++) {
        if (i === 0) { trueRanges.push(quotes[i].high - quotes[i].low); continue; }
        const q = quotes[i];
        const prevClose = quotes[i - 1].close;
        if (q.high == null || q.low == null || prevClose == null) { trueRanges.push(0); continue; }
        trueRanges.push(Math.max(q.high - q.low, Math.abs(q.high - prevClose), Math.abs(q.low - prevClose)));
    }
    const atr5 = trueRanges.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const atr20 = trueRanges.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const atrCompressionRatio = atr20 > 0 ? atr5 / atr20 : 1;

    // [NEW] 3-day Volume Buildup
    const vol3 = volumes.slice(-3);
    const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const isVolumeBuildup = vol3[2] >= avgVol20 * 1.1 &&
        vol3.every((v, i) => i === 0 || v >= vol3[i - 1] * 0.85);

    // [NEW] Higher Low Structure
    const last5Lows = lows.slice(-5);
    let hasHigherLows = true;
    for (let i = 1; i < Math.min(3, last5Lows.length); i++) {
        if (last5Lows[last5Lows.length - i] < last5Lows[last5Lows.length - i - 1] * 0.995) {
            hasHigherLows = false;
            break;
        }
    }

    // [NEW] Candle Quality
    const lastOpen = quotes[quotes.length - 1].open;
    const bodySize = lastOpen ? Math.abs(currentPrice - lastOpen) : 0;
    const bodyRatio = intradayRange > 0 ? bodySize / intradayRange : 0;
    const isGreenCandle = lastOpen ? currentPrice > lastOpen : false;
    const isQualityCandle = bodyRatio > 0.45 && isGreenCandle;

    return {
        price: currentPrice,
        rsi: rsi[rsi.length - 1],
        mfi: mfi[mfi.length - 1],
        ema20: lastEma20,
        sma50: lastSma50,
        rVol: rVol,
        distEma20_pct: ((currentPrice - lastEma20) / lastEma20) * 100,
        isAboveSma50: currentPrice > (lastSma50 || 0),
        compressionPct,
        closeNearHighPct,
        atrCompressionRatio,
        isVolumeBuildup,
        hasHigherLows,
        isQualityCandle,
        bodyRatio,
    };
}

async function getLatestFormula(pgClient) {
    const res = await pgClient.query(`
        SELECT id, version_label, rule_payload
        FROM ai_secret_sauce_versions
        WHERE status IN ('active', 'needs_improvement', 'archived')
        ORDER BY generated_at DESC
        LIMIT 1
    `);

    if (res.rows.length === 0) {
        throw new Error('No Secret Sauce formula version found. Run generate_secret_sauce_version.js first.');
    }

    return {
        id: res.rows[0].id,
        versionLabel: res.rows[0].version_label,
        formula: normalizeFormula(res.rows[0].rule_payload || {}),
    };
}

function scoreCandidate(tech, formula) {
    let score = 0;
    score += Math.max(0, 100 - Math.abs(tech.distEma20_pct) * 8);   // Proximity to EMA20
    score += Math.min(100, tech.rVol * 25);                           // Volume strength
    score += Math.max(0, 70 - Math.abs(55 - tech.rsi) * 2);          // RSI sweet spot
    score += Math.max(0, 70 - Math.max(0, tech.compressionPct - formula.maxCompressionPct) * 8);
    score += tech.closeNearHighPct * 0.5;                             // Close near high
    // [NEW] Bonus scoring
    if (tech.atrCompressionRatio < 0.75) score += 30;                 // ATR compression bonus
    if (tech.hasHigherLows) score += 25;                              // Higher low bonus
    if (tech.isVolumeBuildup) score += 20;                            // Volume buildup bonus
    if (tech.bodyRatio > 0.6) score += 10;                            // Strong candle body
    return Number(score.toFixed(2));
}

async function runScreener() {
    await mongoose.connect(MONGODB_URI);
    const pgClient = new Client({ connectionString: PG_URL });
    await pgClient.connect();
    const activeVersion = await getLatestFormula(pgClient);

    console.log(`🔍 RUNNING SECRET SAUCE PREDICTOR (${activeVersion.versionLabel})...`);
    
    const stocks = await IndonesiaStockModel.find({ active: true }, { ticker: 1 }).lean();
    const candidates = [];

    const formula = activeVersion.formula;

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
                    tech.distEma20_pct >= formula.minDistEma20Pct && tech.distEma20_pct <= formula.maxDistEma20Pct &&
                    tech.rVol >= formula.minRvol &&
                    tech.rsi >= formula.minRsi && tech.rsi <= formula.maxRsi &&
                    tech.mfi >= formula.minMfi &&
                    tech.compressionPct <= formula.maxCompressionPct &&
                    tech.closeNearHighPct >= formula.minCloseNearHighPct &&
                    tech.isAboveSma50 &&                    // [NEW] Must be in uptrend
                    tech.isQualityCandle;                    // [NEW] Quality green candle

                if (isSecretSauce) {
                    const score = scoreCandidate(tech, formula);
                    console.log(`🎯 CANDIDATE FOUND: ${ticker} | Score: ${score} | RVol: ${tech.rVol.toFixed(2)} | Dist EMA20: ${tech.distEma20_pct.toFixed(2)}%`);
                    candidates.push({ ticker, tech, score });
                }
            } catch (e) {}
        }
        await delay(1000);
    }

    // Save candidates to PostgreSQL AND MongoDB (so they appear in web UI)
    if (candidates.length > 0) {
        const sorted = candidates.sort((a, b) => b.score - a.score);
        for (const [index, cand] of sorted.entries()) {
            const tickerClean = cand.ticker.replace('.JK', '');
            // PostgreSQL (for backtest tracking)
            await pgClient.query(`
                INSERT INTO ai_top_gainers_analysis (ticker, date, gain_percentage, raw_technical_data, ai_verdict)
                VALUES ($1, CURRENT_DATE, $2, $3, $4)
                ON CONFLICT (ticker, date) DO UPDATE SET ai_verdict = $4, raw_technical_data = $3
            `, [tickerClean, 0, JSON.stringify({ ...cand.tech, secretSauceVersion: activeVersion.versionLabel, candidateScore: cand.score }), 'SECRET_SAUCE_CANDIDATE']);

            await pgClient.query(`
                INSERT INTO ai_secret_sauce_runs (version_id, run_date, ticker, entry_price, candidate_rank, snapshot)
                VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
                ON CONFLICT (version_id, run_date, ticker) DO UPDATE
                SET entry_price = EXCLUDED.entry_price,
                    candidate_rank = EXCLUDED.candidate_rank,
                    snapshot = EXCLUDED.snapshot,
                    status = 'pending'
            `, [
                activeVersion.id,
                tickerClean,
                cand.tech.price,
                index + 1,
                JSON.stringify({
                    formulaVersion: activeVersion.versionLabel,
                    formula,
                    technicals: cand.tech,
                    candidateScore: cand.score,
                }),
            ]);

            // [NEW] MongoDB (so results appear in web UI)
            const StockSignal = mongoose.models.StockSignal || mongoose.model('StockSignal', new mongoose.Schema({
                ticker: String, sector: String, signalSource: String, entryDate: Date,
                entryPrice: Number, targetPrice: Number, stopLossPrice: Number,
                status: { type: String, default: 'pending' }, daysHeld: { type: Number, default: 0 },
                currentPrice: Number, relevanceScore: Number,
                priceHistory: [{ date: Date, price: Number }], metadata: Object,
            }, { timestamps: true }));

            await StockSignal.findOneAndUpdate(
                { ticker: tickerClean, status: 'pending', signalSource: 'Secret Sauce' },
                {
                    ticker: tickerClean,
                    signalSource: 'Secret Sauce',
                    entryDate: new Date(),
                    entryPrice: cand.tech.price,
                    currentPrice: cand.tech.price,
                    targetPrice: Math.round(cand.tech.price * 1.15),
                    stopLossPrice: Math.round(Math.min(cand.tech.price * 0.94, cand.tech.ema20 * 0.97)),
                    status: 'pending',
                    relevanceScore: 500 + cand.score,
                    metadata: {
                        secretSauceVersion: activeVersion.versionLabel,
                        candidateScore: cand.score,
                        candidateRank: index + 1,
                        volRatio: cand.tech.rVol?.toFixed(2),
                        mfi: cand.tech.mfi?.toFixed(1),
                        rsi: cand.tech.rsi?.toFixed(1),
                        dist20: cand.tech.distEma20_pct?.toFixed(2),
                        atrCompression: cand.tech.atrCompressionRatio?.toFixed(2),
                        hasHigherLows: cand.tech.hasHigherLows,
                        volumeBuildup: cand.tech.isVolumeBuildup,
                        compressionPct: cand.tech.compressionPct?.toFixed(2),
                        closeNearHighPct: cand.tech.closeNearHighPct?.toFixed(1),
                        strategyRank: 500 + cand.score,
                    },
                    updatedAt: new Date(),
                },
                { upsert: true, new: true }
            );
        }
        console.log(`✅ Finished. Found ${sorted.length} candidates for ${activeVersion.versionLabel}. Saved to PostgreSQL + MongoDB.`);
    }

    await mongoose.disconnect();
    await pgClient.end();
}

runScreener();
