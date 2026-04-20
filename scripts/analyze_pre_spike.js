const YahooFinance = require('yahoo-finance2').default;
const { RSI, MACD, MFI, SMA, EMA, ATR } = require('technicalindicators');
const { Client } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyA73HYqtjNgTBoi6RYXG6S-OI9YO9_rze0");

const PG_URL = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5432/cerita_saham';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const tickersToAnalyze = [
    'NIRO.JK', 'DEFI.JK', 'AGAR.JK', 'WBSA.JK', 'KETR.JK', 
    'IFSH.JK', 'PADA.JK', 'MBTO.JK', 'MLPT.JK', 'POLU.JK', 'GOTO.JK'
];

function calculateTechnicalsAt(quotes, index) {
    if (index < 50) return null;
    const slice = quotes.slice(0, index + 1);
    
    const closes = slice.map(q => q.close).filter(c => c != null);
    const highs = slice.map(q => q.high).filter(h => h != null);
    const lows = slice.map(q => q.low).filter(l => l != null);
    const volumes = slice.map(q => q.volume).filter(v => v != null);
    
    if (closes.length < 50) return null;

    const rsi14 = RSI.calculate({ period: 14, values: closes });
    const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const mfi14 = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 });
    const ema20 = EMA.calculate({ period: 20, values: closes });
    
    const recentVolume = volumes[volumes.length - 1];
    const avgVol10 = volumes.slice(-11, -1).reduce((a, b) => a + b, 0) / 10;
    const rVol = avgVol10 > 0 ? recentVolume / avgVol10 : 1;
    const currentPrice = closes[closes.length - 1];
    
    return {
        price: currentPrice,
        RSI: rsi14[rsi14.length - 1],
        MFI: mfi14[mfi14.length - 1],
        MACD_Hist: macd[macd.length - 1]?.histogram,
        EMA20: ema20[ema20.length - 1],
        RVol: rVol,
        Price_vs_EMA20_pct: ema20.length > 0 ? ((currentPrice - ema20[ema20.length - 1]) / ema20[ema20.length - 1]) * 100 : null
    };
}

async function runAnalysis() {
    const pgClient = new Client({ connectionString: PG_URL });
    await pgClient.connect();
    
    const preSpikeDataset = [];

    for (const ticker of tickersToAnalyze) {
        console.log(`Analyzing ${ticker}...`);
        try {
            const res = await yahooFinance.chart(ticker, { period1: '2025-01-01', interval: '1d' });
            if (!res.quotes || res.quotes.length < 5) continue;
            const quotes = res.quotes.filter(q => q.close != null);
            
            let spikeIndex = -1;
            for (let i = quotes.length - 1; i >= quotes.length - 3; i--) {
                const prevClose = quotes[i-1].close;
                const gain = (quotes[i].close - prevClose) / prevClose;
                if (gain > 0.15) { 
                    spikeIndex = i;
                    break;
                }
            }

            if (spikeIndex > 50) {
                const h1 = calculateTechnicalsAt(quotes, spikeIndex - 1);
                const h2 = calculateTechnicalsAt(quotes, spikeIndex - 2);
                
                preSpikeDataset.push({
                    ticker: ticker.replace('.JK', ''),
                    spike_date: quotes[spikeIndex].date.toISOString().substring(0,10),
                    pre_spike_H1: h1,
                    pre_spike_H2: h2
                });
            }
        } catch (e) { console.error(`Err ${ticker}: ${e.message}`); }
        await delay(500);
    }

    if (preSpikeDataset.length > 0) {
        console.log(`Dataset Ready: ${preSpikeDataset.length} tickers. Synthesis...`);
        
        let summary;
        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash-latest",
                generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
            });

            const prompt = `Analyis: Common patterns 1-2 days BEFORE these Indonesian Stocks spiked >20%. Stocks: ${JSON.stringify(preSpikeDataset, null, 2)}`;
            const result = await model.generateContent(prompt);
            summary = JSON.parse(result.response.text());
        } catch (e) {
            console.warn("⚠️ Gemini synthesis failed, using rule-based fallback...");
            // Manual Synthesis Rule-based
            const avgRSI = preSpikeDataset.reduce((sum, d) => sum + (d.pre_spike_H1?.RSI || 0), 0) / preSpikeDataset.length;
            const avgMFI = preSpikeDataset.reduce((sum, d) => sum + (d.pre_spike_H1?.MFI || 0), 0) / preSpikeDataset.length;
            const hasVolSpikeBefore = preSpikeDataset.some(d => (d.pre_spike_H1?.RVol || 0) > 1.5 || (d.pre_spike_H2?.RVol || 0) > 1.5);

            summary = {
                common_patterns: {
                    "Average RSI Range": `Pre-spike RSI around ${avgRSI.toFixed(1)}`,
                    "Volume Accumulation": hasVolSpikeBefore ? "Detected unusual volume 1-2 days before spike" : "No obvious pre-spike volume",
                    "MFI State": `Average MFI around ${avgMFI.toFixed(1)}`
                },
                screener_suggestions: [
                    { name: "Pre-Spike Vol Accumulation", logic: "RVol > 1.5 AND Price > EMA20 AND RSI < 60" },
                    { name: "Low RSI Squeeze", logic: `RSI < ${avgRSI.toFixed(0)} AND MFI < ${avgMFI.toFixed(0)}` }
                ],
                meta_verdict: "Breakout behavior detected after consolidation near EMA20."
            };
        }
        
        await pgClient.query(`
            INSERT INTO ai_meta_summary (summary_date, analyzed_tickers, common_patterns, screener_suggestions)
            VALUES (CURRENT_DATE, $1, $2, $3)
            ON CONFLICT (summary_date) DO UPDATE 
            SET common_patterns = $2, screener_suggestions = $3, analyzed_tickers = $1
        `, [preSpikeDataset.map(d => d.ticker), JSON.stringify(summary.common_patterns), JSON.stringify(summary.screener_suggestions)]);
        
        console.log("✅ Analysis Synthesized & Saved.");
    }

    await pgClient.end();
}

runAnalysis();
