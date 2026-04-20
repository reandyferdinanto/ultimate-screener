const { analyzeStockWithGemini } = require('../lib/gemini-analysis');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function run() {
    const ticker = "RALS.JK";
    try {
        const res = await fetch(`https://ultimate-screener.ebite.biz.id/api/technical?symbol=${ticker}&interval=15m`);
        const technicalData = await res.json();
        
        if (!technicalData.success) {
            console.error("Failed to fetch technical data");
            return;
        }

        console.log("Starting AI Analysis for RALS.JK Scalp (15m)...");
        const aiResult = await analyzeStockWithGemini(ticker, technicalData);
        
        console.log("\n--- AI SCALP ANALYSIS REPORT ---");
        console.log(JSON.stringify(aiResult, null, 2));
    } catch (err) {
        console.error("Analysis Error:", err);
    }
}

run();
