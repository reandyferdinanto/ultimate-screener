import { NextResponse } from "next/server";
import YahooFinance from 'yahoo-finance2';
import { getRecentSignalEvents, persistTechnicalAnalysis } from "@/lib/market-data-store";
import { getActiveScreenerSignals, type ScreenerSignalContext } from "@/lib/screener-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { 
  calculateEMA, 
  calculateSMA,
  calculateRSI,
  calculateMACD, 
  calculatePivotPoints, 
  calculateBollingerBands, 
  calculateATR,
  calculateATRP,
  calculateChandelierExit,
  calculateKeltnerChannels,
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
  calculateSqueezeDeluxe
} from "@/lib/indicators";

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function formatIdxPrice(value: number) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function formatPct(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function getSwingLow(quotes: any[], lookback = 5) {
  return Math.min(...quotes.slice(-lookback).map(q => q.low).filter(Number.isFinite));
}

function getSwingHigh(quotes: any[], lookback = 5) {
  return Math.max(...quotes.slice(-lookback).map(q => q.high).filter(Number.isFinite));
}

function averageFinite(values: unknown[]) {
  const finiteValues = values.map(Number).filter(Number.isFinite);
  if (finiteValues.length === 0) return null;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function hasHigherLows(lows: number[], count = 3) {
  const recent = lows.slice(-count);
  if (recent.length < count) return false;
  for (let i = 1; i < recent.length; i += 1) {
    if (recent[i] < recent[i - 1] * 0.995) return false;
  }
  return true;
}

function inactiveCooldownSetup() {
  return {
    isActive: false,
    peakHigh: null,
    peakDist20: null,
    barsSincePeak: null,
    pullbackPct: null,
    cooldownRangePct: null,
    closeRangePct: null,
    atrPct: null,
    atrCompressionRatio: null,
    avgVol5Ratio: null,
    volumeCooling: false,
    volatilityCooling: false,
    trendStillIntact: false,
    reaccumulationHint: false,
    cooldownScore: 0,
  };
}

function detectCooldownSetup(quotes: any[], timeframe: string) {
  if (timeframe !== "1d" || quotes.length < 60) return inactiveCooldownSetup();

  const lastIdx = quotes.length - 1;
  const last = quotes[lastIdx];
  const prev = quotes[lastIdx - 1] || last;
  const price = Number(last.close);
  const lastEma20 = Number(last.ema20);
  const prevEma20 = Number(prev.ema20);
  const lastSma50 = Number(last.sma50);
  const lastRsi = Number(last.rsi);
  const lastMfi = Number(last.mfi);
  if (![price, lastEma20].every(Number.isFinite) || price <= 0 || lastEma20 <= 0) return inactiveCooldownSetup();

  const highs = quotes.map(q => Number(q.high));
  const lows = quotes.map(q => Number(q.low));
  const closes = quotes.map(q => Number(q.close));
  const volumes = quotes.map(q => Number(q.volume));
  if ([highs, lows, closes, volumes].some(values => values.some(value => !Number.isFinite(value)))) {
    return inactiveCooldownSetup();
  }

  const cooldownLookback = 18;
  const cooldownStartIdx = Math.max(0, lastIdx - cooldownLookback);
  let peakIdx = cooldownStartIdx;
  for (let i = cooldownStartIdx; i <= lastIdx - 2; i += 1) {
    if (highs[i] > highs[peakIdx]) peakIdx = i;
  }

  const peakHigh = highs[peakIdx];
  const peakEma20 = Number(quotes[peakIdx]?.ema20);
  const peakDist20 = Number.isFinite(peakEma20) && peakEma20 > 0
    ? ((peakHigh - peakEma20) / peakEma20) * 100
    : 0;
  const barsSincePeak = lastIdx - peakIdx;
  const pullbackPct = peakHigh > 0 ? ((peakHigh - price) / peakHigh) * 100 : 0;
  const cooldownWindow = quotes.slice(-7);
  const cooldownHigh = Math.max(...cooldownWindow.map(q => Number(q.high)));
  const cooldownLow = Math.min(...cooldownWindow.map(q => Number(q.low)));
  const cooldownRangePct = price > 0 ? ((cooldownHigh - cooldownLow) / price) * 100 : 99;
  const recentCloses = closes.slice(-5);
  const closeRangePct = price > 0
    ? ((Math.max(...recentCloses) - Math.min(...recentCloses)) / price) * 100
    : 99;
  const ma20Vol = averageFinite(volumes.slice(-20)) || 0;
  const avgVol5 = averageFinite(volumes.slice(-5)) || 0;
  const volRatio = ma20Vol > 0 ? Number(last.volume) / ma20Vol : 0;
  const atr5 = averageFinite(quotes.slice(-5).map(q => q.atr14)) || 0;
  const atr20 = averageFinite(quotes.slice(-20).map(q => q.atr14)) || 0;
  const atrCompressionRatio = atr20 > 0 ? atr5 / atr20 : 1;
  const atrNow = Number(last.atr14) || 0;
  const atrPctNow = price > 0 ? (atrNow / price) * 100 : 99;
  const dist20 = ((price - lastEma20) / lastEma20) * 100;
  const ema20Rising = lastEma20 >= prevEma20;
  const isAboveSma50 = Number.isFinite(lastSma50) ? price > lastSma50 : true;
  const hasHL = hasHigherLows(lows.slice(-5), 3);
  const lastSqz = last.squeezeDeluxe || {};
  const prevSqz = prev.squeezeDeluxe || {};
  const sqzMomentumImproving = Number.isFinite(lastSqz.momentum) && Number.isFinite(prevSqz.momentum) && lastSqz.momentum > prevSqz.momentum;
  const sqzFluxImproving = Number.isFinite(lastSqz.flux) && Number.isFinite(prevSqz.flux) && lastSqz.flux > prevSqz.flux;

  const priorExtension = peakDist20 >= 7.5;
  const controlledPullback = pullbackPct >= 2.5 && pullbackPct <= Math.min(14, Math.max(8, peakDist20 * 0.8));
  const sidewaysReset = barsSincePeak >= 3 && barsSincePeak <= 15 &&
    cooldownRangePct <= 12 &&
    cooldownRangePct <= Math.max(6.5, atrPctNow * 2.8) &&
    closeRangePct <= Math.max(3.8, atrPctNow * 1.6);
  const volatilityCooling = atrCompressionRatio <= 0.95 || cooldownRangePct <= 8;
  const volumeCooling = avgVol5 <= ma20Vol * 1.05 && volRatio <= 1.25;
  const trendStillIntact = isAboveSma50 && ema20Rising && price >= lastEma20 * 0.985 && cooldownLow >= lastEma20 * 0.94;
  const currentPositionOk = dist20 >= -2.2 && dist20 <= 6.5;
  const notDistribution = atrPctNow <= 8 &&
    (!Number.isFinite(lastRsi) || lastRsi <= 70) &&
    (!Number.isFinite(lastMfi) || lastMfi < 85) &&
    Number(last.close) >= Number(prev.close) * 0.985;
  const reaccumulationHint = hasHL || sqzMomentumImproving || sqzFluxImproving || price >= cooldownLow + ((cooldownHigh - cooldownLow) * 0.45);
  const isActive = priorExtension && controlledPullback && sidewaysReset && volatilityCooling && volumeCooling && trendStillIntact && currentPositionOk && notDistribution && reaccumulationHint;
  const cooldownScore = 165 +
    Math.min(35, peakDist20 * 2) +
    (volumeCooling ? 15 : 0) +
    (volatilityCooling ? 15 : 0) +
    (hasHL ? 12 : 0) +
    (sqzMomentumImproving || sqzFluxImproving ? 10 : 0) -
    Math.max(0, pullbackPct - 8) * 3;

  return {
    isActive,
    peakHigh,
    peakDist20,
    barsSincePeak,
    pullbackPct,
    cooldownRangePct,
    closeRangePct,
    atrPct: atrPctNow,
    atrCompressionRatio,
    avgVol5Ratio: ma20Vol > 0 ? avgVol5 / ma20Vol : null,
    volumeCooling,
    volatilityCooling,
    trendStillIntact,
    reaccumulationHint,
    cooldownScore: Math.round(cooldownScore),
  };
}

function pickTarget(entry: number, stopLoss: number, pivots?: any) {
  const risk = Math.max(entry - stopLoss, entry * 0.015);
  const rrTarget = entry + risk * 1.5;
  const pivotTargets = [pivots?.r1, pivots?.r2, pivots?.r3]
    .filter((value): value is number => Number.isFinite(value) && value > entry)
    .sort((a, b) => a - b);
  const pivotTarget = pivotTargets.find(value => value >= rrTarget * 0.98) || pivotTargets[pivotTargets.length - 1];
  return formatIdxPrice(Math.max(rrTarget, pivotTarget || rrTarget));
}

function getTimeStopBars(timeframe: string) {
  if (timeframe === "15m") return 8;
  if (timeframe === "1h") return 6;
  if (timeframe === "4h") return 4;
  return 4;
}

function getNextTimestamp(quotes: any[], barsForward: number) {
  const lastTime = Number(quotes[quotes.length - 1]?.time);
  const prevTime = Number(quotes[quotes.length - 2]?.time);
  const step = Number.isFinite(lastTime - prevTime) && lastTime > prevTime ? lastTime - prevTime : 86400;
  return lastTime + step * barsForward;
}

function buildTradePlan(quotes: any[], pivots: any, timeframe: string, context: {
  dist20: number;
  squeezeIntensity: number;
  squeezeDuration: number;
  squeezeState: string;
  fluxStatus: string;
  fluxBullish: boolean;
  fluxImproving: boolean;
  momRising: boolean;
  isOverextended: boolean;
  isMomentumPeaking: boolean;
  isVolumeClimax: boolean;
  isMfiExtreme: boolean;
  isCooldownReset: boolean;
  cooldownSetup?: any;
}) {
  const last = quotes[quotes.length - 1];
  const prev = quotes[quotes.length - 2] || last;
  const sqz = last.squeezeDeluxe;
  const prevSqz = prev.squeezeDeluxe || sqz;
  const currentPrice = Number(last.close);
  const ema9 = Number(last.ema9);
  const ema20 = Number(last.ema20);
  const ema10 = Number(last.ema10);
  const ema60 = Number(last.ema60);
  const sma50 = Number(last.sma50);
  const sma200 = Number(last.sma200);
  const rsi = Number(last.rsi);
  const prevRsi = Number(prev.rsi);
  const swingLow = getSwingLow(quotes, 6);
  const swingHigh = getSwingHigh(quotes, 6);
  const priceAboveEma20 = currentPrice > ema20;
  const reclaimedEma20 = prev.close <= prev.ema20 && priceAboveEma20;
  const brokeEma20 = prev.close >= prev.ema20 && currentPrice < ema20;
  const ema20Rising = ema20 >= Number(prev.ema20);
  const fastEmaBullish = ema9 > ema20;
  const fastEmaCrossover = Number(prev.ema9) <= Number(prev.ema20) && fastEmaBullish;
  const swingEmaBullish = ema20 > ema60;
  const emaStackBullish = fastEmaBullish &&
    (swingEmaBullish || !Number.isFinite(ema60)) &&
    (!Number.isFinite(sma50) || currentPrice > sma50) &&
    (!Number.isFinite(ema60) || currentPrice > ema60);
  const longTrendHealthy = (!Number.isFinite(ema60) || currentPrice > ema60) && (!Number.isFinite(sma200) || currentPrice > sma200);
  const pullbackZone = context.dist20 >= -1.2 && context.dist20 <= 3.5;
  const squeezeActive = context.squeezeIntensity > 0;
  const previousSqueezeActive = Boolean(prevSqz.squeeze?.high || prevSqz.squeeze?.mid || prevSqz.squeeze?.low);
  const squeezeRelease = !squeezeActive && previousSqueezeActive;
  const momentumImproving = context.momRising && sqz.momentum > prevSqz.momentum;
  const bearishMomentum = sqz.momentum < sqz.signal || sqz.momentum < prevSqz.momentum;
  const rsiOverbought = Number.isFinite(rsi) && rsi >= 70;
  const rsiRecovering = Number.isFinite(rsi) && (rsi <= 45 || (rsi <= 55 && rsi > prevRsi));
  const bullishSqueezeTrigger = sqz.buySignal || sqz.isBullDiv || (momentumImproving && context.fluxBullish && (squeezeActive || squeezeRelease || context.fluxImproving));
  const bearishSqueezeTrigger = sqz.sellSignal || sqz.isBearDiv || (bearishMomentum && !context.fluxImproving);
  const stopLoss = formatIdxPrice(Math.min(swingLow * 0.99, ema20 * 0.985));
  const idealEntry = pullbackZone || reclaimedEma20 ? currentPrice : ema20 * 1.01;
  const entryLow = formatIdxPrice(ema20 * 0.995);
  const entryHigh = formatIdxPrice(Math.min(ema20 * 1.035, Math.max(currentPrice, ema20 * 1.01)));
  const target = pickTarget(idealEntry, stopLoss, pivots);
  const atr = Number(last.atr14);
  const atrPct = Number(last.atrp14);
  const chandelierLong = Number(last.chandelier?.long);
  const earlyExit = formatIdxPrice(Math.max(
    Number.isFinite(last.vwap) ? Number(last.vwap) * 0.995 : 0,
    Number.isFinite(ema20) ? ema20 * 0.992 : 0
  ));
  const hardStop = formatIdxPrice(Number.isFinite(chandelierLong)
    ? Math.min(stopLoss, chandelierLong)
    : stopLoss);
  const idealBuy = formatIdxPrice(idealEntry);
  const riskPerShare = Math.max(idealBuy - hardStop, idealBuy * 0.008);
  const target1 = target;
  const target2 = formatIdxPrice(Math.max(target1, idealBuy + riskPerShare * 2.5, pivots?.r2 || 0, pivots?.r3 || 0));
  const rewardRisk = riskPerShare > 0 ? (target1 - idealBuy) / riskPerShare : 0;
  const riskPct = idealBuy > 0 ? (riskPerShare / idealBuy) * 100 : 0;
  const maxLossPct = riskPct;
  const timeStopBars = getTimeStopBars(timeframe);
  const expiresAt = getNextTimestamp(quotes, timeStopBars);
  const chaseRisk = context.dist20 > 5.5 || currentPrice > entryHigh * 1.015 || riskPct > 6 || (Number.isFinite(atrPct) && atrPct > 7);
  const lowRewardRisk = rewardRisk < 1.5;
  const momentumStale = context.isMomentumPeaking || (sqz.momentum < sqz.signal && !context.fluxImproving);
  const buildPlan = (plan: any) => {
    let state = "SETUP";
    if (plan.action.includes("SELL") || plan.action.includes("REDUCE")) state = "INVALID";
    else if (momentumStale && !bullishSqueezeTrigger) state = "EXPIRED";
    else if (chaseRisk || lowRewardRisk) state = "CHASE";
    else if (plan.action === "BUY") state = "TRIGGERED";
    else if (context.isCooldownReset) state = "ARMED";
    else if (priceAboveEma20 && ema20Rising && context.fluxImproving) state = "ARMED";

    const stateMeta: Record<string, { label: string; color: string }> = {
      SETUP: { label: "SETUP BUILDING", color: "oklch(0.75 0.2 200)" },
      ARMED: { label: "ARMED - WAIT TRIGGER", color: "oklch(0.85 0.2 150)" },
      TRIGGERED: { label: "TRIGGERED - VALID ENTRY", color: "oklch(0.75 0.25 150)" },
      CHASE: { label: "DO NOT CHASE", color: "oklch(0.75 0.2 40)" },
      INVALID: { label: "INVALID / RISK OFF", color: "oklch(0.65 0.22 25)" },
      EXPIRED: { label: "MOMENTUM EXPIRED", color: "oklch(0.62 0.08 260)" }
    };

    const noTradeReasons = [...(plan.waitReasons || [])];
    if (chaseRisk) noTradeReasons.unshift(`Jangan kejar: jarak EMA20 ${formatPct(context.dist20)}%, risk ${formatPct(riskPct)}%, ATRP ${Number.isFinite(atrPct) ? formatPct(atrPct) : "N/A"}%.`);
    if (lowRewardRisk) noTradeReasons.unshift(`Reward/risk ${rewardRisk.toFixed(2)}R di bawah minimum 1.5R.`);

    return {
      ...plan,
      state,
      stateLabel: plan.stateLabel || stateMeta[state].label,
      stateColor: plan.stateColor || stateMeta[state].color,
      entryLow,
      entryHigh,
      idealBuy,
      earlyExit,
      hardStop,
      stopLoss: hardStop,
      target1,
      target2,
      takeProfit: target1,
      rewardRisk: Number(rewardRisk.toFixed(2)),
      riskPct: Number(riskPct.toFixed(2)),
      maxLossPct: Number(maxLossPct.toFixed(2)),
      atr: Number.isFinite(atr) ? Number(atr.toFixed(2)) : null,
      atrPct: Number.isFinite(atrPct) ? Number(atrPct.toFixed(2)) : null,
      timeStopBars,
      expiresAt,
      chaseRisk,
      shouldEnter: state === "TRIGGERED",
      noTradeReasons,
      timeStopRule: `Jika setelah ${timeStopBars} candle belum mencapai +0.5R atau close kembali di bawah early exit ${earlyExit}, keluar/kurangi.`,
      positionSizing: "Gunakan risiko tetap 0.5%-1% modal; lot = modal_risiko / (entry - hard_stop)."
    };
  };
  const waitReasons: string[] = [];

  if (!priceAboveEma20) waitReasons.push(`Harga masih di bawah EMA20 (${formatPct(context.dist20)}%); strategi 20 EMA menunggu close/reclaim di atas EMA20.`);
  if (!ema20Rising) waitReasons.push("EMA20 belum menanjak, jadi trend pendek belum memberi tailwind yang bersih.");
  if (!fastEmaBullish) waitReasons.push("EMA9 masih di bawah EMA20; timing cepat belum mengonfirmasi buyer kembali dominan.");
  if (Number.isFinite(ema60) && !swingEmaBullish) waitReasons.push("EMA20 masih di bawah EMA60; trend swing belum bullish menurut setup 20/60 EMA.");
  if (!context.fluxBullish || !context.fluxImproving) waitReasons.push(`Flux belum kompak bullish (${context.fluxStatus}); tunggu akumulasi menguat.`);
  if (!context.momRising) waitReasons.push("Momentum Squeeze masih di bawah/menurun terhadap signal.");
  if (context.isOverextended) waitReasons.push(`Harga terlalu jauh dari EMA20 (${formatPct(context.dist20)}%); entry terbaik menunggu pullback ke EMA20.`);
  if (rsiOverbought) waitReasons.push(`RSI ${formatPct(rsi)} sudah overbought; strategi 20 EMA lebih aman menunggu pullback/retest.`);
  if (Number.isFinite(rsi) && rsi <= 35 && !priceAboveEma20) waitReasons.push(`RSI ${formatPct(rsi)} oversold, tetapi PDF 20 EMA tetap menunggu close konfirmasi di atas EMA20.`);
  if (squeezeActive && !bullishSqueezeTrigger) waitReasons.push(`${context.squeezeState.replace('_', ' ')} masih menyimpan energi, tetapi belum ada trigger release bullish.`);

  if (bearishSqueezeTrigger || (brokeEma20 && bearishMomentum) || (context.isOverextended && context.isMomentumPeaking && (context.isVolumeClimax || context.isMfiExtreme || rsiOverbought))) {
    return buildPlan({
      action: "SELL / REDUCE",
      bias: "BEARISH_REVERSAL",
      timing: brokeEma20
        ? "Jual/kurangi saat candle gagal bertahan di atas EMA20."
        : "Ambil profit bertahap saat momentum Squeeze melemah atau muncul divergence bearish.",
      entryZone: "-",
      idealBuy: null,
      stopLoss: formatIdxPrice(Math.max(swingHigh * 1.01, ema20 * 1.015)),
      takeProfit: formatIdxPrice(Math.max(currentPrice, pivots?.r1 || currentPrice)),
      invalidation: `Bullish lagi jika close kembali di atas EMA20 (${formatIdxPrice(ema20)}) dengan Momentum > Signal dan Flux membaik.`,
      reason: `Squeeze/EMA memberi sinyal distribusi: ${bearishSqueezeTrigger ? "bearish trigger aktif" : "EMA20 ditembus"} sementara momentum tidak menguat.`,
      waitReasons: []
    });
  }

  if (
    priceAboveEma20 &&
    ema20Rising &&
    longTrendHealthy &&
    fastEmaBullish &&
    (swingEmaBullish || !Number.isFinite(ema60)) &&
    (pullbackZone || reclaimedEma20 || last.isEliteBounce) &&
    bullishSqueezeTrigger &&
    !rsiOverbought &&
    !context.isOverextended
  ) {
    return buildPlan({
      action: "BUY",
      bias: fastEmaCrossover ? "EMA9_20_RECLAIM" : "EMA20_SQUEEZE_BOUNCE",
      timing: reclaimedEma20
        ? "Buy valid setelah candle reclaim/close di atas EMA20, dengan EMA9 di atas EMA20."
        : "Buy terbaik di area pullback EMA20 selama EMA9 > EMA20, EMA20 > EMA60, Momentum > Signal, dan Flux tetap positif.",
      entryZone: `${entryLow} - ${entryHigh}`,
      idealBuy: formatIdxPrice(idealEntry),
      stopLoss,
      takeProfit: target,
      invalidation: `Cut jika close kembali di bawah EMA20 atau tembus swing low ${formatIdxPrice(swingLow)}.`,
      reason: `Harga berada di zona 20 EMA, EMA9 > EMA20${Number.isFinite(ema60) ? ", EMA20 > EMA60" : ""}, ${context.squeezeState.replace('_', ' ')} didukung trigger Squeeze bullish, RSI ${Number.isFinite(rsi) ? formatPct(rsi) : "N/A"}, dan Flux ${context.fluxStatus}.`,
      waitReasons: []
    });
  }

  if (
    priceAboveEma20 &&
    ema20Rising &&
    emaStackBullish &&
    context.fluxBullish &&
    momentumImproving &&
    !rsiOverbought &&
    context.dist20 <= 6 &&
    !context.isOverextended
  ) {
    return buildPlan({
      action: "BUY",
      bias: "TREND_PULLBACK",
      timing: "Buy on pullback, jangan kejar candle hijau jauh dari EMA20.",
      entryZone: `${entryLow} - ${entryHigh}`,
      idealBuy: formatIdxPrice(idealEntry),
      stopLoss,
      takeProfit: target,
      invalidation: `Setup batal jika close di bawah EMA20 (${formatIdxPrice(ema20)}) atau Flux turun lagi.`,
      reason: `Trend pendek${Number.isFinite(ema60) ? " dan swing" : ""} sehat: EMA9 > EMA20${Number.isFinite(ema60) ? ", EMA20 > EMA60" : ""}, momentum membaik, Flux positif, dan RSI ${rsiRecovering ? "mendukung recovery" : "belum overbought"}.`,
      waitReasons: []
    });
  }

  if (context.isCooldownReset) {
    const cooldown = context.cooldownSetup || {};
    return buildPlan({
      action: "WAIT AND SEE",
      bias: "EXTENDED_EMA20_COOLDOWN",
      stateLabel: "ARMED - COOLDOWN RESET",
      stateColor: "oklch(0.82 0.18 95)",
      timing: "Setup cooldown aktif. Entry paling bersih menunggu breakout range reset atau pullback kecil mendekati EMA20, bukan mengejar candle ekspansi.",
      entryZone: `${entryLow} - ${entryHigh}`,
      idealBuy: formatIdxPrice(Math.min(currentPrice, entryHigh)),
      stopLoss,
      takeProfit: target,
      invalidation: `Setup batal jika close turun di bawah EMA20 (${formatIdxPrice(ema20)}) atau range cooldown ditembus ke bawah.`,
      reason: `Cooldown valid: extension sebelumnya ${formatPct(Number(cooldown.peakDist20))}% dari EMA20, pullback ${formatPct(Number(cooldown.pullbackPct))}%, range reset ${formatPct(Number(cooldown.cooldownRangePct))}%, volume dan ATR mulai cooling.`,
      waitReasons: []
    });
  }

  if (waitReasons.length === 0) {
    waitReasons.push("Belum ada kombinasi ideal antara EMA9/20 timing, EMA20/60 swing trend, pullback EMA20, trigger Squeeze bullish, dan risk/reward yang rapi.");
  }

  return buildPlan({
    action: "WAIT AND SEE",
    bias: "NO_CLEAN_TRIGGER",
    timing: Number.isFinite(ema60)
      ? `Tunggu close di atas EMA20 (${formatIdxPrice(ema20)}) atau pullback rapi ke ${entryLow} - ${entryHigh} dengan EMA9 > EMA20, EMA20 > EMA60, dan Momentum > Signal.`
      : `Tunggu close di atas EMA20 (${formatIdxPrice(ema20)}) atau pullback rapi ke ${entryLow} - ${entryHigh} dengan EMA9 > EMA20 dan Momentum > Signal.`,
    entryZone: `${entryLow} - ${entryHigh}`,
    idealBuy: formatIdxPrice(ema20 * 1.01),
    stopLoss,
    takeProfit: target,
    invalidation: `Abaikan setup jika harga breakdown di bawah swing low ${formatIdxPrice(swingLow)}.`,
    reason: waitReasons[0],
    waitReasons
  });
}

function generateUnifiedAnalysis(quotes: any[], pivots?: any, timeframe = "1d") {
  const last = quotes[quotes.length - 1];
  const prev = quotes[quotes.length - 2] || last;
  const prev5 = quotes[quotes.length - 6] || quotes[0] || last;
  const prev2 = quotes[quotes.length - 3] || quotes[0] || last;

  const dist20 = Number.isFinite(last.ema20) ? ((last.close - last.ema20) / last.ema20) * 100 : 0;
  const consolidation = last.close ? (Math.abs(last.close - prev2.close) / last.close) * 100 : 0;
  const ema20Rising = Number(last.ema20) >= Number(prev.ema20);

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
  if (volDetails.vwap) volumeWeight += 2;
  if (volDetails.cmf) volumeWeight += 2;
  if (volDetails.ad) volumeWeight += 1;
  if (volDetails.force) volumeWeight += 1;
  const volumeStrength = (volumeWeight / 8) * 100;

  const sqz = last.squeezeDeluxe;
  let squeezeState = "NO_SQUEEZE";
  let squeezeIntensity = 0;
  if (sqz.squeeze.high) { squeezeState = "HIGH_COMPRESSION"; squeezeIntensity = 3; }
  else if (sqz.squeeze.mid) { squeezeState = "NORMAL_COMPRESSION"; squeezeIntensity = 2; }
  else if (sqz.squeeze.low) { squeezeState = "LOW_COMPRESSION"; squeezeIntensity = 1; }

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

  let fluxStatus = "";
  let fluxConviction = false;
  if (fluxBullish && fluxImproving) {
    fluxStatus = "BULLISH (Strong Accumulation)";
    fluxConviction = true;
  } else if (fluxBullish && !fluxImproving) {
    fluxStatus = "CAUTION (Weakening Flow)";
  } else if (!fluxBullish && fluxImproving) {
    fluxStatus = "RECOVERING (Absorption Phase)";
  } else {
    fluxStatus = "BEARISH (Strong Distribution)";
  }

  const priceDown = last.close < prev5.close;
  const fluxUp = sqz.flux > (quotes[quotes.length - 6]?.squeezeDeluxe.flux || 0);
  const isSilentAccumulation = priceDown && fluxUp && !fluxBullish && fluxImproving;

  const isPriceBullish = last.isUndercutBounce || dist20 > 0;
  const isOverextended = dist20 > 10;
  const isNearSupport = dist20 > -1.5 && dist20 < 4.5;
  const isTight = consolidation < 4.5;
  const isMixedSignal = isPriceBullish && !fluxBullish;
  const isPremiumMixed = isMixedSignal && fluxImproving && consolidation < 8;

  const isVolumeClimax = last.volume > (prev.volume * 2.5);
  const isMfiExtreme = last.mfi > 85;
  const isMomentumPeaking = sqz.momentum < prev.squeezeDeluxe.momentum && sqz.momentum < (quotes[quotes.length - 3]?.squeezeDeluxe.momentum || 0);
  const hasTrendStrength = volumeStrength >= 75 && fluxBullish && fluxImproving;
  const emaBounceConfirmed = Boolean(last.isEliteBounce || (last.close > last.ema20 && last.ema9 > last.ema20 && ema20Rising && isNearSupport));
  const squeezeBullish = Boolean(sqz.buySignal || sqz.isBullDiv || (momRising && fluxBullish && fluxImproving));
  const squeezeBearish = Boolean(sqz.sellSignal || sqz.isBearDiv || (sqz.momentum < sqz.signal && !fluxImproving));
  const isSilentFlyer = squeezeIntensity >= 2 && isNearSupport && fluxBullish && fluxImproving && !isOverextended;
  const cooldownSetup = detectCooldownSetup(quotes, timeframe);
  const isCooldownReset = cooldownSetup.isActive;

  let verdict = "";
  let color = "var(--text-secondary)";
  let riskLevel = "MEDIUM";
  let suggestion = "";
  let squeezeInsight = "";

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

  if (isOverextended && squeezeIntensity === 0) {
    verdict = "POWERFUL RUN (OVEREXTENDED)";
    color = "oklch(0.7 0.2 150)";
    riskLevel = "HIGH";
    let peakAnalysis = "";
    if (isMomentumPeaking && (isVolumeClimax || isMfiExtreme)) {
      peakAnalysis = "Indikasi CLIMAX terdeteksi: Volume ekstrim disertai pembalikan momentum. Risiko PEAK jangka pendek sangat tinggi.";
      color = "oklch(0.7 0.2 40)";
    } else if (hasTrendStrength) {
      peakAnalysis = "Trend memiliki 'STRONG INERTIA': tekanan beli dan aliran dana masih meningkat masif. Masih ada potensi parabolic run sebelum jenuh.";
      riskLevel = "MEDIUM (Trend Following)";
    } else {
      peakAnalysis = "Risiko mean reversion meningkat. Momentum mulai jenuh, namun trend belum patah.";
    }
    suggestion = `Harga sudah berada di atas rata-rata (${dist20.toFixed(1)}% dari EMA20). ${peakAnalysis} Strategi: jika sudah punya, HOLD dengan trailing stop di low bar sebelumnya. Jika belum punya, tunggu pullback sehat ke area EMA9/EMA20.`;
  } else if (isVolumeClimax || (isMfiExtreme && isMomentumPeaking)) {
    verdict = "BEARISH REVERSAL: CLIMAX RISK";
    color = "oklch(0.6 0.2 20)";
    riskLevel = "VERY HIGH";
    suggestion = "Volume ekstrem dan momentum mulai habis. Prioritasnya kurangi risiko dan tunggu konfirmasi pullback yang bersih.";
  } else if (isCooldownReset) {
    verdict = "COOLDOWN RESET: WATCHLIST ACTIVE";
    color = "oklch(0.82 0.18 95)";
    riskLevel = "MEDIUM";
    suggestion = `Harga sudah reset setelah extension EMA20: pullback ${formatPct(Number(cooldownSetup.pullbackPct))}%, range ${formatPct(Number(cooldownSetup.cooldownRangePct))}%, ATR cooling ${formatPct(Number(cooldownSetup.atrCompressionRatio) * 100)}%. Ini bukan chase setup; tunggu breakout range atau pullback tertib dekat EMA20.`;
  } else if (last.isEliteBounce && fluxConviction) {
    verdict = "HIGH CONVICTION: ELITE BOUNCE";
    color = "oklch(0.85 0.25 200)";
    riskLevel = "LOW";
    suggestion = "Pantulan ELITE terdeteksi dengan Flux positif dan menguat. Konfirmasi kuat dari reclaim EMA20.";
  } else if (isSilentAccumulation) {
    verdict = "SILENT ACCUMULATION: BULLISH DIVERGENCE";
    color = "oklch(0.85 0.2 180)";
    riskLevel = "LOW";
    suggestion = "Harga melemah tetapi Flux merangkak naik. Ini indikasi akumulasi senyap.";
  } else if (squeezeIntensity >= 2 && isNearSupport && isTight && fluxConviction) {
    verdict = "VOLATILITY EXPLOSION IMMINENT";
    color = "oklch(0.85 0.25 150)";
    riskLevel = "LOW";
    suggestion = `Saham dalam kondisi squeeze ketat selama ${squeezeDuration} hari dengan Flux yang kuat dan membaik.`;
  } else if (isPremiumMixed || (last.isEliteBounce && fluxImproving)) {
    verdict = "TURNAROUND: EMA BOUNCE (FLUX IMPROVING)";
    color = "oklch(0.85 0.2 200)";
    riskLevel = "MEDIUM";
    suggestion = "Harga memantul di EMA20 dan tren aliran dana meningkat. Ini peluang spekulatif dengan reward tinggi.";
  } else if (isMixedSignal) {
    verdict = "MIXED SIGNAL: CAUTION";
    color = "oklch(0.7 0.2 40)";
    riskLevel = "MEDIUM";
    suggestion = "Ada pantulan teknikal, namun Flux masih belum memberi konfirmasi bersih.";
  } else if (last.isEliteBounce || (isNearSupport && isStrongVolume && momRising && fluxBullish)) {
    verdict = "HIGH CONVICTION: BUY ON DIP";
    color = "oklch(0.85 0.25 200)";
    riskLevel = "LOW";
    suggestion = "Sinyal buy on dip terdeteksi di area support struktural dengan volume dan momentum yang pulih.";
  } else if (dist20 < -5) {
    verdict = "BEARISH STRUCTURE";
    color = "oklch(0.6 0.2 20)";
    riskLevel = "VERY HIGH";
    suggestion = "Struktur harga rusak di bawah EMA20. Tunggu tren pulih sebelum entry baru.";
  } else {
    verdict = "CONSOLIDATION: BASE BUILDING";
    color = "var(--text-secondary)";
    riskLevel = "LOW";
    suggestion = "Harga bergerak sideways dalam range sempit. Pantau Flux untuk tanda-tanda akumulasi awal.";
  }

  const tradePlan = buildTradePlan(quotes, pivots, timeframe, {
    dist20,
    squeezeIntensity,
    squeezeDuration,
    squeezeState,
    fluxStatus,
    fluxBullish,
    fluxImproving,
    momRising,
    isOverextended,
    isMomentumPeaking,
    isVolumeClimax,
    isMfiExtreme,
    isCooldownReset,
    cooldownSetup
  });

  const kdjVal = parseFloat(last.kdj?.j ?? "0");
  const emaFastTrend = last.ema9 > last.ema20 ? "BULLISH (EMA9 > EMA20)" : "BEARISH (EMA9 < EMA20)";
  const emaSwingTrend = Number.isFinite(last.ema60)
    ? (last.ema20 > last.ema60 ? "BULLISH (EMA20 > EMA60)" : "BEARISH (EMA20 < EMA60)")
    : "WARMING_UP";

  const mfiLast3 = quotes.slice(-3).map(q => q.mfi);
  const mfiAvg = mfiLast3.reduce((a, b) => a + b, 0) / mfiLast3.length;
  const mfiPrev3 = quotes.slice(-6, -3).map(q => q.mfi);
  const mfiPrevAvg = mfiPrev3.length > 0 ? mfiPrev3.reduce((a, b) => a + b, 0) / mfiPrev3.length : last.mfi;

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

  if (emaBounceConfirmed && squeezeBullish && !isOverextended) setupScore = Math.max(setupScore, 88);
  if (isSilentFlyer) setupScore = Math.max(setupScore, 92);
  if (isCooldownReset) setupScore = Math.max(setupScore, 86);
  if (squeezeBearish && !emaBounceConfirmed) setupScore = Math.min(setupScore, 25);

  const technicalFusionInsight = `Trend: ${emaFastTrend}, ${emaSwingTrend}. Squeeze: ${squeezeState.replace('_', ' ')} (${squeezeDuration} bar) dengan Flux ${fluxStatus} dan momentum ${momRising ? "di atas signal" : "belum di atas signal"}. EMA Bounce: ${emaBounceConfirmed ? "valid/reclaim area EMA20" : `belum valid; jarak harga ke EMA20 ${formatPct(dist20)}%`}. Volume strength: ${Math.round(volumeStrength)}%.`;

  return {
    verdict,
    color,
    riskLevel,
    suggestion,
    tradePlan,
    squeezeInsight,
    technicalFusionInsight,
    squeezeDuration,
    cooldownSetup,
    volDetails,
    isSilentFlyer,
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
      rsi: Number.isFinite(last.rsi) ? last.rsi.toFixed(1) : "N/A",
      emaFast: emaFastTrend,
      emaSwing: emaSwingTrend,
      emaBounce: emaBounceConfirmed ? "VALID" : "WAIT",
      cooldown: isCooldownReset ? "ACTIVE" : "WAIT",
      squeeze: squeezeState.replace('_', ' '),
      flux: fluxStatus,
      action: tradePlan.action,
      execution: tradePlan.stateLabel,
      rewardRisk: `${tradePlan.rewardRisk}R`,
      maxLoss: `${tradePlan.maxLossPct}%`,
      timeStop: `${tradePlan.timeStopBars} bars`,
      atrp: tradePlan.atrPct === null ? "N/A" : `${tradePlan.atrPct}%`,
      volClimax: isVolumeClimax,
      mfiExtreme: isMfiExtreme,
      peakStatus: isVolumeClimax || (isMfiExtreme && isMomentumPeaking) ? "PEAK_POTENTIAL" : (hasTrendStrength && !isMomentumPeaking ? "STRONG_INERTIA" : "MEAN_REVERSION")
    }
  };
}

function screenerCategoryLabel(value?: string) {
  return String(value || "TECHNICAL").replace(/_/g, " ");
}

function screenerAccentColor(category?: string) {
  const normalized = String(category || "").toUpperCase();
  if (normalized === "COOLDOWN") return "oklch(0.82 0.18 95)";
  if (normalized.includes("SQUEEZE")) return "oklch(0.85 0.25 200)";
  if (normalized.includes("SILENT")) return "oklch(0.75 0.2 180)";
  if (normalized.includes("ARAHUNTER")) return "oklch(0.76 0.24 35)";
  return "oklch(0.75 0.25 150)";
}

function buildScreenerTradePlan(basePlan: any, screenerContext: ScreenerSignalContext) {
  const entry = screenerContext.entryPrice;
  if (entry === null) return null;

  const stop = screenerContext.stopLossPrice ?? basePlan?.hardStop ?? basePlan?.stopLoss ?? null;
  const target = screenerContext.targetPrice ?? basePlan?.target1 ?? basePlan?.takeProfit ?? null;
  const riskPerShare = stop !== null && entry > stop ? entry - stop : null;
  const target1 = target !== null ? formatIdxPrice(target) : basePlan?.target1;
  const target2 = riskPerShare !== null
    ? formatIdxPrice(Math.max(Number(target1) || 0, entry + riskPerShare * 2.5))
    : basePlan?.target2;
  const rewardRisk = screenerContext.rewardRisk ?? (
    riskPerShare !== null && target !== null ? Number(((target - entry) / riskPerShare).toFixed(2)) : basePlan?.rewardRisk
  );
  const maxLossPct = screenerContext.riskPct ?? (
    riskPerShare !== null ? Number(((riskPerShare / entry) * 100).toFixed(2)) : basePlan?.maxLossPct
  );
  const category = screenerCategoryLabel(screenerContext.category);
  const isCooldown = screenerContext.category === "COOLDOWN";
  const stateColor = screenerAccentColor(screenerContext.category);

  return {
    ...basePlan,
    screenerSynced: true,
    screenerCategory: screenerContext.category,
    screenerVector: screenerContext.vector,
    action: isCooldown ? "WAIT AND SEE" : (basePlan?.action || "WAIT AND SEE"),
    bias: screenerContext.vector || basePlan?.bias,
    state: isCooldown ? "ARMED" : (basePlan?.state || "SETUP"),
    stateLabel: isCooldown ? "SCREENER: COOLDOWN RESET" : `SCREENER: ${category}`,
    stateColor,
    entryLow: formatIdxPrice(entry),
    entryHigh: formatIdxPrice(entry),
    entryZone: `${formatIdxPrice(entry)}`,
    idealBuy: formatIdxPrice(entry),
    hardStop: stop !== null ? formatIdxPrice(stop) : basePlan?.hardStop,
    stopLoss: stop !== null ? formatIdxPrice(stop) : basePlan?.stopLoss,
    earlyExit: basePlan?.earlyExit ?? (stop !== null ? formatIdxPrice(stop) : null),
    target1,
    target2,
    takeProfit: target1,
    rewardRisk,
    riskPct: maxLossPct,
    maxLossPct,
    shouldEnter: !isCooldown && Boolean(basePlan?.shouldEnter),
    timing: isCooldown
      ? "Screener menandai cooldown/reset. Tunggu breakout range atau pullback tertib dekat EMA20 sebelum entry."
      : `Screener aktif: ${category}. Ikuti entry/stop/target yang tersimpan dan validasi ulang dengan candle terakhir.`,
    reason: screenerContext.thesis || basePlan?.reason,
  };
}

function applyScreenerSync(analysis: any, activeScreenerSignals: ScreenerSignalContext[]) {
  const screenerContext = activeScreenerSignals[0] || null;
  if (!screenerContext) {
    return {
      ...analysis,
      screenerContext: null,
      activeScreenerSignals: [],
      screenerTradePlan: null,
    };
  }

  const screenerTradePlan = buildScreenerTradePlan(analysis.tradePlan, screenerContext);
  const category = screenerCategoryLabel(screenerContext.category);
  const liveRiskOff = String(analysis.tradePlan?.action || "").includes("SELL") ||
    String(analysis.verdict || "").includes("BEARISH REVERSAL");
  const color = screenerAccentColor(screenerContext.category);
  const shouldLeadWithScreener = !liveRiskOff && [
    "COOLDOWN",
    "EMA_BOUNCE",
    "ELITE_BOUNCE",
    "BUY_ON_DIP",
    "TURNAROUND",
    "SQUEEZE",
    "SQUEEZE_DIVERGENCE",
    "SILENT_FLYER",
  ].includes(screenerContext.category);

  return {
    ...analysis,
    verdict: shouldLeadWithScreener ? `SCREENER SYNC: ${category}` : analysis.verdict,
    color: shouldLeadWithScreener ? color : analysis.color,
    riskLevel: shouldLeadWithScreener && analysis.riskLevel === "VERY HIGH" ? "MEDIUM" : analysis.riskLevel,
    suggestion: shouldLeadWithScreener
      ? `Sinyal screener terbaru: ${category} / ${screenerContext.vector}. ${screenerContext.thesis || analysis.suggestion} Gunakan entry, stop, dan target dari screener sync; batalkan jika candle terakhir menembus invalidation.`
      : analysis.suggestion,
    screenerContext,
    activeScreenerSignals,
    screenerTradePlan: liveRiskOff ? null : screenerTradePlan,
    details: {
      ...analysis.details,
      screener: `${screenerContext.category}/${screenerContext.vector}`,
    },
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
    
    if (originalInterval === "5m") {
        period1.setDate(period1.getDate() - 7); 
    } else if (originalInterval === "15m") {
        period1.setDate(period1.getDate() - 30);
    } else if (originalInterval === "4h") {
        period1.setDate(period1.getDate() - 180);
    } else if (originalInterval === "1h") {
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
    
    const ema9 = calculateEMA(closes, 9);
    const ema10 = calculateEMA(closes, 10);
    const ema20 = calculateEMA(closes, 20);
    const ema60 = calculateEMA(closes, 60);
    const ema200 = calculateEMA(closes, 200);
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);
    const atr14 = calculateATR(quotes, 14);
    const atrp14 = calculateATRP(quotes, 14);
    const chandelier = calculateChandelierExit(quotes, 22, 3);
    const keltner = calculateKeltnerChannels(quotes, ema20, 10, 2);
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
    
    const prevDay = quotes[quotes.length - 2] || quotes[quotes.length - 1];
    const pivots = calculatePivotPoints(prevDay);

    const data = quotes.map((q: any, i: number) => {
      const e9 = ema9[i];
      const e10 = ema10[i];
      const e20 = ema20[i];
      const e60 = ema60[i];
      const e200 = ema200[i];
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
        ema9: e9,
        ema10: e10,
        ema20: e20,
        ema60: e60,
        ema200: e200,
        sma50: s50,
        sma200: s200,
        atr14: atr14[i],
        atrp14: atrp14[i],
        chandelier: {
          long: chandelier.long[i],
          short: chandelier.short[i]
        },
        keltner: {
          upper: keltner.upper[i],
          middle: keltner.middle[i],
          lower: keltner.lower[i]
        },
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
        rsi: currentRsi,
        macd: {
          macd: macd.macdLine[i],
          signal: macd.signalLine[i],
          histogram: macd.histogram[i],
        },
        squeezeDeluxe: squeezeDeluxe[i]
      };
    });

    const activeScreenerSignals = await getActiveScreenerSignals(symbol, 5);
    const unifiedAnalysis = applyScreenerSync(
      generateUnifiedAnalysis(data, pivots, originalInterval),
      activeScreenerSignals
    );
    const persistence = await persistTechnicalAnalysis({
      symbol,
      timeframe: originalInterval,
      candles: quotes,
      indicators: data,
      analysis: unifiedAnalysis
    });
    const historicalSignals = await getRecentSignalEvents(symbol, originalInterval, 5);

    console.log(`[API] ${symbol} technical analysis ready: verdict=${unifiedAnalysis.verdict}, setup=${unifiedAnalysis.score.setup}`);

    return NextResponse.json({ 
      success: true, 
      data,
      pivots,
      unifiedAnalysis,
      screenerContext: activeScreenerSignals[0] || null,
      activeScreenerSignals,
      historicalSignals,
      _debug: {
        setupScore: unifiedAnalysis.score.setup,
        volumeScore: unifiedAnalysis.score.volume,
        isSilentFlyer: unifiedAnalysis.isSilentFlyer,
        riskLevel: unifiedAnalysis.riskLevel,
        persistence
      },
      ticker: symbol
    });
  } catch (error: any) {
    console.error(`Technical API Error for ${symbol}:`, error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
