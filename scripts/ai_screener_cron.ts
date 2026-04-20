import mongoose from 'mongoose';
import { IndonesiaStockModel } from '../lib/models/IndonesiaStock';
import YahooFinance from 'yahoo-finance2';
import { RSI, MACD, MFI, SMA, EMA, ATR } from 'technicalindicators';
import { analyzeStockWithGemini } from '../lib/gemini-analysis';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://reandy:XuISHforC8mWVEKd@cluster0.ybmffcl.mongodb.net/ultimate_screener?retryWrites=true&w=majority&appName=Cluster0";

// A simple delay function to avoid rate limits
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function getStockList() {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB to fetch stock list.");
    const stocks = await IndonesiaStockModel.find({ active: true }, { ticker: 1 }).lean();
    return stocks.map(s => s.ticker + '.JK');
}

function calculateTechnicals(rawQuotes: any[]) {
    if (!rawQuotes || rawQuotes.length < 50) return null;
    
    // Filter out empty quotes
    const quotes = rawQuotes.filter(q => q.close != null && q.volume != null && q.high != null && q.low != null);
    if (quotes.length < 50) return null;

    const closes = quotes.map(q => q.close);
    const highs = quotes.map(q => q.high);
    const lows = quotes.map(q => q.low);
    const volumes = quotes.map(q => q.volume);
    
    // Indicators
    const rsi14 = RSI.calculate({ period: 14, values: closes });
    const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const mfi14 = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 });
    
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const sma50 = SMA.calculate({ period: 50, values: closes });
    const sma200 = SMA.calculate({ period: 200, values: closes });
    const atr14 = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
    
    // Recent Volume vs Average (10 periods)
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
        // Calculate price distance from MA20
        dist_to_MA20_pct: ema20.length > 0 ? ((currentPrice - ema20[ema20.length - 1]) / ema20[ema20.length - 1]) * 100 : null
    };
}

async function fetchAndAnalyze() {
    try {
        const tickers = await getStockList();
        console.log(`Found ${tickers.length} active IHSG stocks.`);
        
        const topGainers: { ticker: string, gain1Day: number, gain2Day: number }[] = [];
        
        // Step 1: Scan for >20% gainers over the last 2 days
        // We do this in chunks to be respectful to Yahoo Finance
        const chunkSize = 20;
        for (let i = 0; i < tickers.length; i += chunkSize) {
            const chunk = tickers.slice(i, i + chunkSize);
            console.log(`Scanning batch ${i/chunkSize + 1}/${Math.ceil(tickers.length/chunkSize)}...`);
            
            await Promise.all(chunk.map(async (ticker) => {
                try {
                    // Fetch last 5 days
                    const res = await yahooFinance.chart(ticker, { period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), interval: '1d' });
                    if (!res.quotes || res.quotes.length < 3) return;
                    
                    const quotes = res.quotes;
                    const today = quotes[quotes.length - 1];
                    const yesterday = quotes[quotes.length - 2];
                    const twoDaysAgo = quotes[quotes.length - 3];
                    
                    if (today.close == null || yesterday.close == null || twoDaysAgo.close == null) return;
                    
                    // Check if gained > 20% in last 1 or 2 days
                    const gain1Day = (today.close - yesterday.close) / yesterday.close;
                    const gain2Day = (today.close - twoDaysAgo.close) / twoDaysAgo.close;
                    
                    if (gain1Day >= 0.19 || gain2Day >= 0.19) { // Using 19% just to be safe with rounding
                        console.log(`🚀 BREAKOUT DETECTED: ${ticker} | 1D: ${(gain1Day*100).toFixed(2)}% | 2D: ${(gain2Day*100).toFixed(2)}%`);
                        topGainers.push({ ticker, gain1Day, gain2Day });
                    }
                } catch (e) {
                    // Ignore errors for individual stocks (e.g., delisted or missing data)
                }
            }));
            
            await delay(1000); // 1 second delay between batches
        }
        
        console.log(`Found ${topGainers.length} stocks that gained >20%. Processing full technicals...`);
        
        for (const gainer of topGainers) {
            console.log(`Fetching deep data for ${gainer.ticker}...`);
            try {
                // Fetch 1d (200 candles), 1h (last 30 days = ~200 candles), 15m (last 10 days = ~200 candles)
                const [chart1d, chart1h, chart15m] = await Promise.all([
                    yahooFinance.chart(gainer.ticker, { period1: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), interval: '1d' }),
                    yahooFinance.chart(gainer.ticker, { period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), interval: '60m' }),
                    yahooFinance.chart(gainer.ticker, { period1: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), interval: '15m' })
                ]);
                
                const tech1d = calculateTechnicals(chart1d.quotes);
                const tech1h = calculateTechnicals(chart1h.quotes);
                const tech15m = calculateTechnicals(chart15m.quotes);
                
                const snapshotJson = {
                    ticker: gainer.ticker.replace('.JK', ''),
                    gain_1d_pct: (gainer.gain1Day * 100).toFixed(2) + '%',
                    gain_2d_pct: (gainer.gain2Day * 100).toFixed(2) + '%',
                    technicals_1D: tech1d,
                    technicals_1H: tech1h,
                    technicals_15M: tech15m
                };
                
                // TODO: Feed this JSON to Gemini AI
                console.log(`Sending data for ${snapshotJson.ticker} to Gemini...`);
                const aiVerdict = await analyzeStockWithGemini(snapshotJson.ticker, snapshotJson);
                
                if (aiVerdict) {
                    console.log(`✅ Gemini Analysis Received for ${snapshotJson.ticker}`);
                    // console.log(JSON.stringify(aiVerdict, null, 2));
                    
                    // Insert into PostgreSQL using pg query
                    const { query } = await import('../lib/db-pg.js');
                    await query(
                        `INSERT INTO ai_top_gainers_analysis (ticker, date, gain_percentage, raw_technical_data, ai_verdict, ai_analysis_full)
                         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
                         ON CONFLICT (ticker, date) DO UPDATE 
                         SET raw_technical_data = $3, gain_percentage = $2, ai_verdict = $4, ai_analysis_full = $5`,
                        [snapshotJson.ticker, gainer.gain1Day * 100, snapshotJson, aiVerdict.verdict, aiVerdict]
                    );
                    console.log(`💾 Saved analysis for ${snapshotJson.ticker} to database.`);
                } else {
                    console.log(`❌ Failed to get analysis from Gemini for ${snapshotJson.ticker}`);
                }
               
               await delay(2000); // Be nice to Yahoo API and Gemini rate limits
            } catch (err) {
                console.error(`Failed to process ${gainer.ticker}:`, err);
            }
        }
        
    } catch (e) {
        console.error("Cron job failed:", e);
    } finally {
        await mongoose.disconnect();
    }
}

fetchAndAnalyze();
