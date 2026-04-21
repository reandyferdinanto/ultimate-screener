import { NextResponse } from "next/server";
import YahooFinance from 'yahoo-finance2';

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { 
  calculateEMA, 
  calculateSMA,
  calculateRSI,
  calculateMACD, 
  calculatePivotPoints, 
  calculateBollingerBands, 
  calculateSuperTrend,
  calculateMFI,
  calculateAD,
  calculateCMF,
  calculateEMV,
  calculateForceIndex,
  calculateNVI,
  calculateOBV,
  calculateVPT,
  calculateVWAP,
  calculateVortex,
  calculateKDJ,
  calculateSqueezeDeluxe,
  calculateElliottFibonacci,
  calculatePivots
} from "@/lib/indicators";

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function generateUnifiedAnalysis(quotes: any[]) {
  const last = quotes[quotes.length - 1];
  const prev = quotes[quotes.length - 2];
  const prev5 = quotes[quotes.length - 6] || quotes[0];
  const prev2 = quotes[quotes.length - 3] || quotes[0];

  // 1. Setup Metrics
  const dist20 = ((last.close - last.ema20) / last.ema20) * 100;
  const consolidation = (Math.abs(last.close - prev2.close) / last.close) * 100;

  // 2. Volume Flow Metrics (Weighted Version)
  // CMF & VWAP = Weight 2, Others = Weight 1. Total = 8
  const volDetails = {
    mfi: last.mfi > prev.mfi || last.mfi < 25,
    obv: last.obv > prev.obv,
    vwap: last.close > last.vwap,
    cmf: last.cmf > 0,
    ad: last.ad > prev.ad,
    force: last.forceIndex > 0
  };

  let volumeWeight = 0;
  if (volDetails.mfi) volumeWeight += 1;
  if (volDetails.obv) volumeWeight += 1;
  if (volDetails.vwap) volumeWeight += 2; // Weight 2
  if (volDetails.cmf) volumeWeight += 2; // Weight 2
  if (volDetails.ad) volumeWeight += 1;
  if (volDetails.force) volumeWeight += 1;
  
  const volumeStrength = (volumeWeight / 8) * 100;

  // 3. Squeeze Deluxe Metrics & Duration
  const sqz = last.squeezeDeluxe;
  let squeezeState = "NO_SQUEEZE";
  let squeezeIntensity = 0;
  if (sqz.squeeze.high) { squeezeState = "HIGH_COMPRESSION"; squeezeIntensity = 3; }
  else if (sqz.squeeze.mid) { squeezeState = "NORMAL_COMPRESSION"; squeezeIntensity = 2; }
  else if (sqz.squeeze.low) { squeezeState = "LOW_COMPRESSION"; squeezeIntensity = 1; }

  // Calculate Squeeze Duration
  let squeezeDuration = 0;
  if (squeezeIntensity > 0) {
    for (let i = quotes.length - 1; i >= 0; i--) {
        const s = quotes[i].squeezeDeluxe.squeeze;
        if (s.high || s.mid || s.low) squeezeDuration++;
        else break;
    }
  }

  const momRising = sqz.momentum > sqz.signal;
  const fluxBullish = sqz.flux > 0;
  const fluxImproving = sqz.flux > prev.squeezeDeluxe.flux;
  const isStrongVolume = volumeStrength >= 65;

  // --- REFINED FLUX STATUS (4-STATE ANALYSIS) ---
  let fluxStatus = "";
  let fluxConviction = false;

  if (fluxBullish && fluxImproving) {
      fluxStatus = "BULLISH (Strong Accumulation)";
      fluxConviction = true;
  } else if (fluxBullish && !fluxImproving) {
      fluxStatus = "CAUTION (Weakening Flow)";
      fluxConviction = false;
  } else if (!fluxBullish && fluxImproving) {
      fluxStatus = "RECOVERING (Absorption Phase)";
      fluxConviction = false; 
  } else {
      fluxStatus = "BEARISH (Strong Distribution)";
      fluxConviction = false;
  }

  // --- NEW: DIVERGENCE DETECTION (SILENT ACCUMULATION) ---
  const priceDown = last.close < prev5.close;
  const fluxUp = sqz.flux > (quotes[quotes.length - 6]?.squeezeDeluxe.flux || 0);
  const isSilentAccumulation = priceDown && fluxUp && !fluxBullish && fluxImproving;

  // --- CONFLICT DETECTION & RECONCILIATION ---
  const isPriceBullish = last.isUndercutBounce || dist20 > 0;
  const isOverextended = dist20 > 10;
  const isNearSupport = dist20 > -1.5 && dist20 < 4.5; 
  const isTight = consolidation < 4.5;
  
  const isMixedSignal = isPriceBullish && !fluxBullish;
  const isPremiumMixed = isMixedSignal && fluxImproving && (consolidation < 8); 

  // 4. SYNTHESIS LOGIC (IMPECCABLE & NON-AMBIGUOUS)
  let verdict = "";
  let color = "var(--text-secondary)";
  let riskLevel = "MEDIUM";
  let suggestion = "";
  let squeezeInsight = "";

  // Advanced Extension Analysis
  const isVolumeClimax = last.volume > (prev.volume * 2.5);
  const isMfiExtreme = last.mfi > 85;
  const isMomentumPeaking = sqz.momentum < prev.squeezeDeluxe.momentum && sqz.momentum < (quotes[quotes.length - 3]?.squeezeDeluxe.momentum || 0);
  const hasTrendStrength = volumeStrength >= 75 && fluxBullish && fluxImproving;

  // Squeeze Insight Generation with Transition Awareness
  if (isOverextended && squeezeIntensity === 0) {
      squeezeInsight = "VOLATILITY ENGINE: EXPANSION PHASE. Energy is being released aggressively.";
  } else if (isOverextended && squeezeIntensity > 0) {
      squeezeInsight = `VOLATILITY ENGINE: BREAKOUT INITIALIZED (${squeezeDuration} Bars). Tension is resolving upwards.`;
  } else if (squeezeIntensity > 0) {
      squeezeInsight = `VOLATILITY ENGINE: ${squeezeState.replace('_', ' ')} (${squeezeDuration} Bars). `;
      if (squeezeDuration > 10) squeezeInsight += "High tension building up. ";
      squeezeInsight += `Flux is ${fluxStatus}. `;
      squeezeInsight += momRising ? "Momentum is ACCELERATING." : "Momentum is DECELERATING.";
  } else {
      squeezeInsight = "VOLATILITY ENGINE: NEUTRAL. Seeking new range.";
  }

  // Conclusion Synthesis
  if (isOverextended) {
    verdict = "POWERFUL RUN (OVEREXTENDED)";
    color = "oklch(0.7 0.2 150)"; // Vibrant Emerald/Green for trend continuation
    riskLevel = "HIGH";
    
    let peakAnalysis = "";
    if (isMomentumPeaking && (isVolumeClimax || isMfiExtreme)) {
        peakAnalysis = "Indikasi CLIMAX terdeteksi: Volume ekstrim disertai pembalikan momentum. Risiko PEAK jangka pendek sangat tinggi.";
        color = "oklch(0.7 0.2 40)"; // Switch back to Amber for exhaustion
    } else if (hasTrendStrength) {
        peakAnalysis = "Trend memiliki 'STRONG INERTIA': Meskipun sudah jauh dari EMA20, tekanan beli dan aliran dana (Flux) masih meningkat masif. Masih ada potensi 'Parabolic Run' sebelum jenuh.";
        riskLevel = "MEDIUM (Trend Following)";
    } else {
        peakAnalysis = "Risiko 'Mean Reversion' meningkat. Momentum mulai jenuh, namun trend belum patah.";
    }

    suggestion = `Harga sudah berada di atas rata-rata (${dist20.toFixed(1)}% dari EMA20). ${peakAnalysis} Strategi: Jika sudah punya, HOLD dengan Trailing Stop di Low bar sebelumnya. Jika belum punya, tunggu pullback sehat ke area EMA10/EMA20.`;
  } else if (last.isEliteBounce && fluxConviction) {
    verdict = "HIGH CONVICTION: ELITE BOUNCE";
    color = "oklch(0.85 0.25 200)";
    riskLevel = "LOW";
    suggestion = "Sinyal Pantulan ELITE terdeteksi dengan aliran dana (Flux) POSITIF & MENGUAT. Konfirmasi kuat dari reclaim EMA20. Peluang entry probabilitas tinggi.";
  } else if (isSilentAccumulation) {
    verdict = "SILENT ACCUMULATION: BULLISH DIVERGENCE";
    color = "oklch(0.85 0.2 180)"; // Bright Cyan-Green
    riskLevel = "LOW";
    suggestion = "Terdeteksi Divergence: Harga cenderung turun namun aliran dana (Flux) mulai merangkak naik (Absorption Phase). Ini adalah indikasi akumulasi senyap oleh institusi.";
  } else if (squeezeIntensity >= 2 && isNearSupport && isTight && fluxConviction) {
    verdict = "VOLATILITY EXPLOSION IMMINENT";
    color = "oklch(0.85 0.25 150)"; // Emerald
    riskLevel = "LOW";
    suggestion = `Saham dalam kondisi Squeeze ketat selama ${squeezeDuration} hari dengan aliran dana (Flux) yang kuat dan membaik. Probabilitas ledakan ke ATAS sangat besar.`;
  } else if (isPremiumMixed || (last.isEliteBounce && fluxImproving)) {
    verdict = "TURNAROUND: EMA BOUNCE (FLUX IMPROVING)";
    color = "oklch(0.85 0.2 200)"; // Clear Greenish Cyan
    riskLevel = "MEDIUM";
    suggestion = "Sinyal TURNAROUND terdeteksi. Harga memantul di EMA20, dan meskipun Flux masih negatif, tren aliran dana sedang meningkat (Improving). Ini adalah peluang spekulatif dengan reward tinggi.";
  } else if (isMixedSignal) {
    verdict = "MIXED SIGNAL: CAUTION";
    color = "oklch(0.7 0.2 40)";
    riskLevel = "MEDIUM";
    suggestion = "Terdeteksi pantulan teknikal (EMA Bounce), namun aliran dana (Flux) masih menunjukkan fase DISTRIBUSI atau melemah. Sebaiknya WAIT & SEE sampai Flux berubah positif untuk konfirmasi yang lebih aman.";
  } else if (last.isEliteBounce || (isNearSupport && isStrongVolume && momRising && fluxBullish)) {
    verdict = "HIGH CONVICTION: BUY ON DIP";
    color = "oklch(0.85 0.25 200)";
    riskLevel = "LOW";
    suggestion = "Sinyal Buy On Dip terdeteksi di area support struktural. Didukung oleh volume yang kuat dan momentum yang mulai pulih. Peluang entry probabilitas tinggi dengan risiko terukur.";
  } else if (dist20 < -5) {
    verdict = "BEARISH STRUCTURE";
    color = "oklch(0.6 0.2 20)"; // Deep Red
    riskLevel = "VERY HIGH";
    suggestion = "Struktur harga rusak (di bawah EMA20). Jauhi saham ini sampai tren kembali pulih di atas EMA20.";
  } else {
    verdict = "CONSOLIDATION: BASE BUILDING";
    color = "var(--text-secondary)";
    riskLevel = "LOW";
    suggestion = "Harga bergerak sideways dalam range sempit. Belum ada trigger volume atau momentum yang cukup untuk breakout. Tetap pantau indikator Flux untuk tanda-tanda akumulasi awal.";
  }

  const kdjVal = parseFloat(last.kdj.j);

  // MFI Precision Trend (3-candle smoothed)
  const mfiLast3 = quotes.slice(-3).map(q => q.mfi);
  const mfiAvg = mfiLast3.reduce((a, b) => a + b, 0) / mfiLast3.length;
  const mfiPrev3 = quotes.slice(-6, -3).map(q => q.mfi);
  const mfiPrevAvg = mfiPrev3.length > 0 ? mfiPrev3.reduce((a, b) => a + b, 0) / mfiPrev3.length : last.mfi;
  
  // Define significance threshold (e.g., 0.5 points change)
  let mfiStatus = "Steady";
  if (mfiAvg > mfiPrevAvg + 0.5) mfiStatus = "Rising";
  else if (mfiAvg < mfiPrevAvg - 0.5) mfiStatus = "Falling";
  else mfiStatus = mfiAvg > 50 ? "Healthy" : "Neutral";

  let setupScore = 50;
  if (dist20 < -5) setupScore = 10;
  else if (isOverextended) setupScore = 25 + Math.max(0, 15 - dist20); 
  else if (isTight && isNearSupport) setupScore = 95 + (fluxBullish ? 5 : 0);
  else if (isNearSupport && fluxImproving) setupScore = 85;
  else if (isNearSupport) setupScore = 75;
  else if (dist20 > 0 && dist20 <= 10) setupScore = 65;

  return {
    verdict,
    color,
    riskLevel,
    suggestion,
    squeezeInsight,
    squeezeDuration,
    volDetails,
    score: {
      setup: Math.round(setupScore),
      volume: Math.round(volumeStrength)
    },
    details: {
      mfi: mfiStatus,
      obv: last.obv > prev.obv ? "Bullish" : "Bearish",
      vwap: last.close > last.vwap ? "Above" : "Below",
      vortex: last.vortex.plus > last.vortex.minus ? "Bullish" : "Bearish",
      kdj: isNaN(kdjVal) ? "0.0" : kdjVal.toFixed(1),
      squeeze: squeezeState.replace('_', ' '),
      flux: fluxStatus,
      volClimax: isVolumeClimax,
      mfiExtreme: isMfiExtreme,
      peakStatus: isVolumeClimax || (isMfiExtreme && isMomentumPeaking) ? "PEAK_POTENTIAL" : (hasTrendStrength && !isMomentumPeaking ? "STRONG_INERTIA" : "MEAN_REVERSION")
    }
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "^JKSE";
  let interval = searchParams.get("interval") || "1d";
  const originalInterval = interval;

  // Yahoo Finance doesn't support 4h natively, we'll fetch 1h and aggregate
  if (interval === "4h") interval = "1h";

  try {
    const period2 = new Date();
    const period1 = new Date();
    
    if (originalInterval === "5m" || originalInterval === "15m") {
        period1.setDate(period1.getDate() - 7); 
    } else if (originalInterval === "1h" || originalInterval === "4h") {
        period1.setDate(period1.getDate() - 90);
    } else {
        period1.setFullYear(period1.getFullYear() - 1); 
    }

    const result: any = await yahooFinance.chart(symbol, {
      period1,
      period2,
      interval: interval as any,
    });

    if (!result || !result.quotes || result.quotes.length === 0) {
      return NextResponse.json({ success: false, error: "No data found" }, { status: 404 });
    }

    let quotes = result.quotes.filter((q: any) => q.close !== null).map((q: any) => {
      const utcTime = Math.floor(new Date(q.date).getTime() / 1000);
      const wibTime = utcTime + (7 * 3600);
      
      return {
        time: wibTime,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume,
      };
    });

    // Aggregate to 4h if requested
    if (originalInterval === "4h") {
      const aggregated = [];
      for (let i = 0; i < quotes.length; i += 4) {
        const chunk = quotes.slice(i, i + 4);
        if (chunk.length > 0) {
          aggregated.push({
            time: chunk[0].time,
            open: chunk[0].open,
            high: Math.max(...chunk.map((c: any) => c.high)),
            low: Math.min(...chunk.map((c: any) => c.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((sum: number, c: any) => sum + (c.volume || 0), 0),
          });
        }
      }
      quotes = aggregated;
    }

    const closes = quotes.map((q: any) => q.close);
    
    const ema10 = calculateEMA(closes, 10);
    const ema20 = calculateEMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);
    const macd = calculateMACD(closes);
    const bb = calculateBollingerBands(closes);
    const st = calculateSuperTrend(quotes);
    const mfi = calculateMFI(quotes);
    const ad = calculateAD(quotes);
    const cmf = calculateCMF(quotes);
    const emv = calculateEMV(quotes);
    const fi = calculateForceIndex(quotes);
    const nvi = calculateNVI(quotes);
    const obv = calculateOBV(quotes);
    const vpt = calculateVPT(quotes);
    const vwap = calculateVWAP(quotes);
    const vortex = calculateVortex(quotes);
    const kdjResult = calculateKDJ(quotes);
    const squeezeDeluxe = calculateSqueezeDeluxe(quotes);
    const RSI_ARR = calculateRSI(closes, 14);  // [NEW] RSI array for Elite Bounce guard
    const elliott = calculateElliottFibonacci(quotes, 100);
    const wavePivots = calculatePivots(quotes, 5);
    
    const prevDay = quotes[quotes.length - 2] || quotes[quotes.length - 1];
    const pivots = calculatePivotPoints(prevDay);

    const data = quotes.map((q: any, i: number) => {
      const e10 = ema10[i];
      const e20 = ema20[i];
      const s50 = sma50[i];
      const s200 = sma200[i];
      
      const prevE10 = i > 0 ? ema10[i-1] : e10;
      const prevE20 = i > 0 ? ema20[i-1] : e20;

      // REFINED 20 EMA Undercut Bounce Logic (Impeccable Version)
      let undercutDetected = false;
      const lookback = 3;
      for (let j = 0; j < lookback; j++) {
        const idx = i - j;
        if (idx >= 0) {
          if (quotes[idx].low <= (ema20[idx] || e20)) {
            undercutDetected = true;
            break;
          }
        }
      }

      const isReclaimed = q.close > e20;
      const hierarchy = e10 > e20 && q.close > s50 && q.close > s200;
      const uptrend = e10 > prevE10 && e20 > prevE20;
      
      const isUndercutBounce = undercutDetected && isReclaimed && hierarchy && uptrend;

      // --- VOLUME FLOW FILTERS (From Screener Logic) ---
      const m = mfi[i];
      const prevM = i > 0 ? mfi[i-1] : m;
      const o = obv[i];
      const prevO = i > 0 ? obv[i-1] : o;
      const v = vwap[i];
      const f = fi[i];
      const prevF = i > 0 ? fi[i-1] : f;
      const c = cmf[i];
      const a = ad[i];
      const prevA = i > 0 ? ad[i-1] : a;

      let volumeScore = 0;
      if (m > prevM || m < 25) volumeScore++;
      if (o > prevO) volumeScore++;
      if (q.close > v) volumeScore++;
      if (c > 0) volumeScore++;
      if (a > prevA) volumeScore++;
      if (f > 0) volumeScore++;

      const isEliteBounce = isUndercutBounce && volumeScore >= 4 && 
                            q.close > 50;  // basic price filter

      // [NEW] RSI guard for Elite Bounce — reject overbought bounces
      const currentRsi = RSI_ARR ? RSI_ARR[i] : null;
      const rsiValidForBounce = currentRsi == null || (currentRsi >= 40 && currentRsi <= 68);
      const isEliteBounceQualified = isEliteBounce && rsiValidForBounce;

      // [NEW] Squeeze + Bounce Confluence Detection
      const sqzState = squeezeDeluxe[i];
      const prevSqz = i > 0 ? squeezeDeluxe[i - 1] : null;
      const isInSqueeze = sqzState && (sqzState.squeeze.low || sqzState.squeeze.mid || sqzState.squeeze.high);
      const isMomRising = sqzState && prevSqz ? sqzState.momentum > prevSqz.momentum : false;
      const isSqueezeBounce = isEliteBounceQualified && isInSqueeze && isMomRising;

      // --- CONVICTION SCORE (0-100%) --- Enhanced with squeeze confluence
      const volumeComp = (volumeScore / 6) * 40;
      const dist20 = ((q.close - e20) / e20) * 100;
      const proximityComp = Math.max(0, 30 - Math.abs(dist20 - 1.5) * 5); 
      const range = ((q.high - q.low) / q.close) * 100;
      const tightnessComp = Math.max(0, 30 - range * 6);
      const squeezeBonus = isSqueezeBounce ? 15 : 0;  // [NEW] Squeeze+bounce bonus

      const convictionScore = Math.min(100, Math.round(volumeComp + proximityComp + tightnessComp + squeezeBonus));

      return {
        ...q,
        ema10: e10,
        ema20: e20,
        sma50: s50,
        sma200: s200,
        isUndercutBounce,
        isEliteBounce: isEliteBounceQualified,
        isSqueezeBounce,
        volumeScore,
        convictionScore,
        bb: {
          upper: bb.upper[i],
          lower: bb.lower[i],
          sma: bb.sma[i],
        },
        superTrend: {
          value: st.superTrend[i],
          direction: st.direction[i],
        },
        mfi: m,
        ad: a,
        cmf: c,
        emv: emv[i],
        forceIndex: f,
        nvi: nvi[i],
        obv: o,
        vpt: vpt[i],
        vwap: v,
        vortex: {
          plus: vortex.plus[i],
          minus: vortex.minus[i]
        },
        kdj: {
          k: kdjResult.k[i],
          d: kdjResult.d[i],
          j: kdjResult.j[i]
        },
        macd: {
          macd: macd.macdLine[i],
          signal: macd.signalLine[i],
          histogram: macd.histogram[i],
        },
        squeezeDeluxe: squeezeDeluxe[i]
      };
    });

    const unifiedAnalysis = generateUnifiedAnalysis(data);

    return NextResponse.json({ 
      success: true, 
      data,
      pivots,
      elliott,
      wavePivots,
      unifiedAnalysis,
      ticker: symbol
    });
  } catch (error: any) {
    console.error(`Technical API Error for ${symbol}:`, error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
