
const tickers = ["BNBR.JK", "KOTA.JK", "LAND.JK"];
const port = 3004;

async function analyzeTickers() {
  console.log(`\n=== DEEP_DIVE_ANALYSIS: BNBR vs KOTA vs LAND ===\n`);
  
  for (const ticker of tickers) {
    try {
      const res = await fetch(`http://localhost:${port}/api/technical?symbol=${ticker}&interval=1d`);
      const json = await res.json();
      
      if (!json.success) {
        console.log(`[${ticker}] Error: ${json.error}`);
        continue;
      }

      const last = json.data[json.data.length - 1];
      const prev = json.data[json.data.length - 2];
      const analysis = json.unifiedAnalysis;
      const elliott = json.elliott;

      console.log(`[${ticker}]`);
      console.log(`- Verdict      : ${analysis.verdict}`);
      console.log(`- Squeeze      : ${analysis.details.squeeze} (${analysis.squeezeDuration} bars)`);
      console.log(`- Flux Status  : ${analysis.details.flux}`);
      console.log(`- Momentum     : ${last.squeezeDeluxe.momentum > last.squeezeDeluxe.signal ? "ACCELERATING" : "DECELERATING"}`);
      console.log(`- Conviction   : ${analysis.score.setup}%`);
      console.log(`- Vol Strength : ${analysis.score.volume}%`);
      console.log(`- Elliott Trend: ${elliott.trend}`);
      console.log(`- Interpretation: ${elliott.interpretation.substring(0, 150)}...`);
      
      // Check for specific "Spark" markers
      const isSqzFired = !last.squeezeDeluxe.squeeze.low && !last.squeezeDeluxe.squeeze.mid && !last.squeezeDeluxe.squeeze.high && 
                         (prev.squeezeDeluxe.squeeze.low || prev.squeezeDeluxe.squeeze.mid || prev.squeezeDeluxe.squeeze.high);
      
      if (isSqzFired) console.log(`- !!! ALERT: SQUEEZE_FIRED (Volatility Explosion)`);
      if (last.isEliteBounce) console.log(`- !!! ALERT: ELITE_BOUNCE (EMA20 Reclaim)`);
      if (analysis.details.peakStatus === "STRONG_INERTIA") console.log(`- !!! ALERT: STRONG_INERTIA (Institutional Momentum)`);
      
      console.log(`-----------------------------------------------\n`);
    } catch (e) {
      console.log(`[${ticker}] Fetch Error: ${e.message}`);
    }
  }
}

analyzeTickers();
