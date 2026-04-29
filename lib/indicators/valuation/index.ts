import { OHLCV } from '../types';

type WavePivotType = 'high' | 'low';
type WaveState = 'provisional' | 'confirmed' | 'ambiguous' | 'invalidated';
type WaveFunction = 'motive' | 'corrective';

export interface WavePivot {
  index: number;
  price: number;
  type: WavePivotType;
  confirmed?: boolean;
}

export interface WaveCompletionState {
  wave1Completed: boolean;
  wave2Completed: boolean;
  wave3Completed: boolean;
  wave4Completed: boolean;
  wave5Completed: boolean;
  waveACCompleted: boolean;
  waveBCompleted: boolean;
  waveCCompleted: boolean;
  lastCompletedWave: string | null;
  completionPrices: {
    wave1?: number;
    wave2?: number;
    wave3?: number;
    wave4?: number;
    wave5?: number;
    waveA?: number;
    waveB?: number;
    waveC?: number;
  };
}

/**
 * Detect completed waves based on price action and pivot confirmation
 */
export function detectWaveCompletion(pivots: WavePivot[], quotes: OHLCV[], direction: 'bullish' | 'bearish'): WaveCompletionState {
  const state: WaveCompletionState = {
    wave1Completed: false,
    wave2Completed: false,
    wave3Completed: false,
    wave4Completed: false,
    wave5Completed: false,
    waveACCompleted: false,
    waveBCompleted: false,
    waveCCompleted: false,
    lastCompletedWave: null,
    completionPrices: {}
  };

  if (pivots.length < 2) return state;

  const lastPrice = quotes[quotes.length - 1].close;
  const sign = direction === 'bullish' ? 1 : -1;

  // Wave 1 completed if pivot 1 is confirmed and price has moved beyond it
  if (pivots.length >= 2 && pivots[1]?.confirmed) {
    state.wave1Completed = true;
    state.completionPrices.wave1 = pivots[1].price;
    state.lastCompletedWave = '1';
  }

  // Wave 2 completed if pivot 2 is confirmed
  if (pivots.length >= 3 && pivots[2]?.confirmed) {
    state.wave2Completed = true;
    state.completionPrices.wave2 = pivots[2].price;
    state.lastCompletedWave = '2';
  }

  // Wave 3 completed - must have extended beyond wave 1 (at least 161.8% for strong completion)
  if (pivots.length >= 4 && pivots[3]?.confirmed) {
    const wave1Range = Math.abs(pivots[1].price - pivots[0].price);
    const wave3Range = Math.abs(pivots[3].price - pivots[2].price);
    // Wave 3 is complete if it's at least 61.8% of wave 1 (more lenient for detection)
    if (wave3Range >= wave1Range * 0.618) {
      state.wave3Completed = true;
      state.completionPrices.wave3 = pivots[3].price;
      state.lastCompletedWave = '3';
    }
  }

  // Wave 4 completed if pivot 4 is confirmed and doesn't overlap wave 1
  if (pivots.length >= 5 && pivots[4]?.confirmed) {
    const noOverlap = direction === 'bullish' 
      ? pivots[4].price > pivots[1].price 
      : pivots[4].price < pivots[1].price;
    if (noOverlap || isWedgeLike(pivots.slice(0, 5), direction)) {
      state.wave4Completed = true;
      state.completionPrices.wave4 = pivots[4].price;
      state.lastCompletedWave = '4';
    }
  }

  // Wave 5 completed if pivot 5 is confirmed
  if (pivots.length >= 6 && pivots[5]?.confirmed) {
    state.wave5Completed = true;
    state.completionPrices.wave5 = pivots[5].price;
    state.lastCompletedWave = '5';
  }

  // Corrective waves
  if (pivots.length >= 2 && pivots[1]?.confirmed) {
    state.waveACCompleted = true;
    state.completionPrices.waveA = pivots[1].price;
  }

  if (pivots.length >= 3 && pivots[2]?.confirmed) {
    state.waveBCompleted = true;
    state.completionPrices.waveB = pivots[2].price;
  }

  if (pivots.length >= 4 && pivots[3]?.confirmed) {
    state.waveCCompleted = true;
    state.completionPrices.waveC = pivots[3].price;
    if (!state.lastCompletedWave) state.lastCompletedWave = 'C';
  }

  return state;
}

/**
 * Check if an invalidation level has been broken
 */
export function isInvalidationLevelBroken(invalidationLevel: number, lastPrice: number, direction: 'bullish' | 'bearish'): boolean {
  if (direction === 'bullish') {
    // For bullish pattern, invalidation is broken if price goes below it
    return lastPrice < invalidationLevel * 0.998; // 0.2% buffer
  } else {
    // For bearish pattern, invalidation is broken if price goes above it
    return lastPrice > invalidationLevel * 1.002; // 0.2% buffer
  }
}

/**
 * Get the next active wave target based on completed waves
 */
export function getNextActiveWaveTarget(
  primary: WaveCandidate | null,
  completionState: WaveCompletionState,
  lastPrice: number
): string | null {
  if (!primary) return null;

  if (primary.function === 'motive') {
    if (!completionState.wave1Completed) return '1';
    if (!completionState.wave2Completed) return '2';
    if (!completionState.wave3Completed) return '3';
    if (!completionState.wave4Completed) return '4';
    if (!completionState.wave5Completed) return '5';
    return 'ABC'; // All motive waves done, expect correction
  } else {
    // Corrective
    if (!completionState.waveACCompleted) return 'A';
    if (!completionState.waveBCompleted) return 'B';
    if (!completionState.waveCCompleted) return 'C';
    return 'REVERSAL'; // All corrective waves done
  }
}

interface WaveCandidate {
  function: WaveFunction;
  pattern_type: string;
  direction: 'bullish' | 'bearish';
  state: WaveState;
  pivots: Array<WavePivot & { label: string }>;
  labels: string[];
  score: number;
  confidence: number;
  warnings: string[];
  invalidation_levels: Array<{ label: string; price: number }>;
  meta: Record<string, number | string | boolean>;
}

interface WaveTarget {
  wave: string;
  direction: 'up' | 'down' | 'sideways';
  price: number;
  conservative: number;
  aggressive: number;
  basis: string;
  status: WaveState;
  warning?: string;
}

interface SqueezePoint {
  momentum: number;
  signal: number;
  flux: number;
  squeeze?: {
    low?: boolean;
    mid?: boolean;
    high?: boolean;
  };
}

export interface FibonacciLevels {
  h0: number;    // 0%
  h236: number;  // 23.6%
  h382: number;  // 38.2%
  h500: number;  // 50%
  h618: number;  // 61.8%
  h786: number;  // 78.6%
  h100: number;  // 100%
  h1618?: number; // 161.8% (Target)
  h2618?: number; // 261.8% (Extended Target)
}

export function calculateElliottFibonacci(quotes: OHLCV[], lookback = 250, squeezeDeluxe?: SqueezePoint[], pivots: WavePivot[] = []) {
  if (quotes.length < 30) return null;

  const actualLookback = Math.min(quotes.length, lookback);
  const slice = quotes.slice(-actualLookback);
  const highs = slice.map(q => q.high);

  const maxPrice = Math.max(...highs);
  const maxIdxInSlice = highs.indexOf(maxPrice);
  const maxIdxGlobal = (quotes.length - actualLookback) + maxIdxInSlice;

  const prePeakLows = slice.slice(0, maxIdxInSlice + 1).map(q => q.low);
  const minPrice = Math.min(...prePeakLows);
  const minIdxInSlice = prePeakLows.indexOf(minPrice);
  const minIdxGlobal = (quotes.length - actualLookback) + minIdxInSlice;

  const diff = maxPrice - minPrice;
  const isUpTrend = maxIdxGlobal > minIdxGlobal && diff > 0;

  const lastSqz = squeezeDeluxe ? squeezeDeluxe[squeezeDeluxe.length - 1] : null;
  const prevSqz = squeezeDeluxe && squeezeDeluxe.length > 1 ? squeezeDeluxe[squeezeDeluxe.length - 2] : lastSqz;
  const isBottomingSqueeze = Boolean(!isUpTrend && lastSqz && lastSqz.flux > 0 && lastSqz.momentum > lastSqz.signal);

  // Fibonacci Retracement (Anchored to the True Cycle Origin)
  const retracement: FibonacciLevels = {
    h0: maxPrice,
    h236: maxPrice - (diff * 0.236),
    h382: maxPrice - (diff * 0.382),
    h500: maxPrice - (diff * 0.500),
    h618: maxPrice - (diff * 0.618),
    h786: maxPrice - (diff * 0.786),
    h100: minPrice
  };

  // 2. Fibonacci Extension (Standard levels based on range)
  const extension: FibonacciLevels = {
    h0: minPrice,
    h236: minPrice + (diff * 0.236),
    h100: maxPrice,
    h1618: maxPrice + (diff * 0.618),
    h2618: maxPrice + (diff * 1.618),
    h382: minPrice + (diff * 0.382),
    h500: minPrice + (diff * 0.500),
    h618: minPrice + (diff * 0.618),
    h786: minPrice + (diff * 0.786),
  };

  const lastPrice = quotes[quotes.length - 1].close;
  const normalizedPivots = normalizeWavePivots(pivots.length >= 4 ? pivots : calculatePivots(quotes, 5));
  const activePivots = normalizedPivots.filter(p => p.index >= quotes.length - actualLookback);
  const candidates = buildElliottCandidates(quotes, activePivots, lastSqz, prevSqz);
  const primary = candidates[0] || null;
  const alternateCounts = candidates.slice(1, 4);
  const topScore = primary?.score ?? 0;
  const secondScore = alternateCounts[0]?.score ?? 0;
  const ambiguityMargin = 0.08;
  const derivedState: WaveState = !primary
    ? 'ambiguous'
    : primary.pivots.some(p => p.confirmed === false)
      ? 'provisional'
      : topScore - secondScore <= ambiguityMargin
        ? 'ambiguous'
        : 'confirmed';

  if (primary) primary.state = derivedState;

  // Choose the best candidate for target generation
  // KEY: Match candidate with what's displayed on chart (usually the one with most pivots)
  let targetCandidate = primary;
  let completionState;
  
  // DEBUG: Log all candidates
  console.log(`[EW Debug] Primary: ${primary?.direction}, pivots=${primary?.pivots?.length}, score=${primary?.score}`);
  alternateCounts.forEach((alt, i) => {
    console.log(`[EW Debug] Alternate ${i}: ${alt.direction}, pivots=${alt.pivots?.length}, score=${alt.score}`);
  });
  
  if (primary && alternateCounts.length > 0) {
    // STRATEGY: Find candidate with MOST PIVOTS (most complete wave structure)
    // This matches what's usually displayed on chart (yellow lines)
    const allCandidates = [primary, ...alternateCounts];
    
    // First try: find candidate with most pivots (even if score is lower)
    const maxPivots = Math.max(...allCandidates.map(c => c.pivots.length));
    const candidatesWithMaxPivots = allCandidates.filter(c => c.pivots.length === maxPivots);
    
    if (candidatesWithMaxPivots.length > 0) {
      // Among candidates with most pivots, prefer the one with higher score
      targetCandidate = candidatesWithMaxPivots.reduce((best, curr) => 
        curr.score > best.score ? curr : best
      );
      console.log(`[EW Debug] Selected candidate with most pivots: ${targetCandidate.direction} (${targetCandidate.pivots.length}p, score=${targetCandidate.score.toFixed(2)})`);
    }
    
    // Fallback: if primary has very few pivots (<4) and alternate has more, use alternate
    if (primary.pivots.length < 4) {
      const betterAlternate = alternateCounts.find(alt => alt.pivots.length > primary.pivots.length);
      if (betterAlternate) {
        targetCandidate = betterAlternate;
        console.log(`[EW Debug] Primary has few pivots, using alternate: ${targetCandidate.direction} (${targetCandidate.pivots.length}p)`);
      }
    }
    
    console.log(`[EW Debug] FINAL targetCandidate: ${targetCandidate.direction}, pivots=${targetCandidate.pivots?.length}`);
  }
  
  // Detect wave completion state for the chosen candidate
  completionState = targetCandidate 
    ? detectWaveCompletion(targetCandidate.pivots, quotes, targetCandidate.direction)
    : { 
        wave1Completed: false, wave2Completed: false, wave3Completed: false,
        wave4Completed: false, wave5Completed: false, waveACCompleted: false,
        waveBCompleted: false, waveCCompleted: false, lastCompletedWave: null,
        completionPrices: {}
      };
  
  // Check if invalidation level is broken (use primary's invalidation)
  const invalidationLevel = primary?.invalidation_levels?.[0]?.price;
  const isInvalidated = invalidationLevel 
    ? isInvalidationLevelBroken(invalidationLevel, lastPrice, primary.direction)
    : false;

  const isSqzFired = lastSqz ? (!lastSqz.squeeze?.low && !lastSqz.squeeze?.mid && !lastSqz.squeeze?.high) : true;
  const isMomBullish = lastSqz ? (lastSqz.momentum > lastSqz.signal && lastSqz.flux > 0) : true;
  const energyLevel = isSqzFired && isMomBullish ? "HIGH" : (isSqzFired || isMomBullish ? "MODERATE" : "LOW");

  const motivePivots = primary?.function === 'motive' ? primary.pivots : [];
  const w3Height = motivePivots.length >= 4 ? Math.abs(motivePivots[3].price - motivePivots[2].price) : diff;
  const lastMotivePeak = motivePivots.length >= 4 ? motivePivots[3].price : maxPrice;
  let w4TargetValue = primary?.direction === 'bearish'
    ? lastMotivePeak + (w3Height * 0.382)
    : lastMotivePeak - (w3Height * 0.382);
  let w4FiboRatio = "38.2% (of W3)";

  if (!Number.isFinite(w4TargetValue)) {
    w4TargetValue = retracement.h382;
    w4FiboRatio = "38.2%";
  }
  if (primary?.direction !== 'bearish' && lastPrice <= w4TargetValue) {
    w4TargetValue = lastMotivePeak - (w3Height * 0.5);
    w4FiboRatio = "50.0% (of W3)";
  }
  if (primary?.direction !== 'bearish' && lastPrice <= lastMotivePeak - (w3Height * 0.5)) {
    w4TargetValue = lastMotivePeak - (w3Height * 0.618);
    w4FiboRatio = "61.8% (of W3)";
  }

  const aggressiveW5 = primary?.direction === 'bearish'
    ? w4TargetValue - (w3Height * 0.618)
    : w4TargetValue + (w3Height * 0.618);
  const realisticW5 = primary?.direction === 'bearish'
    ? Math.min(minPrice * 0.98, w4TargetValue - (w3Height * 0.382))
    : Math.max(maxPrice * 1.02, w4TargetValue + (w3Height * 0.382));
  const finalTarget = energyLevel === "HIGH" ? aggressiveW5 : realisticW5;
  const reachability = energyLevel === "HIGH" ? "TINGGI (Sqz release + bullish flux)" : (energyLevel === "MODERATE" ? "MODERAT" : "RENDAH (momentum/flux belum sinkron)");

  const bias = deriveElliottBias(primary, isBottomingSqueeze);
  // Use targetCandidate (not just primary) for last wave target
  console.log(`[EW Debug] FINAL targetCandidate: ${targetCandidate.direction}, pivots=${targetCandidate?.pivots?.length}`);
  const lastWaveTarget = deriveLastWaveTarget(
    targetCandidate, 
    quotes, 
    retracement, 
    extension, 
    energyLevel, 
    completionState, 
    isInvalidated
  );
  
  // CRITICAL: Ensure target direction matches the candidate used for derivation
  // (deriveLastWaveTarget already received targetCandidate, so this is just a safety check)
  if (lastWaveTarget && targetCandidate && lastWaveTarget.direction !== (targetCandidate.direction === 'bullish' ? 'up' : 'down')) {
    console.log(`[EW Debug] WARNING: Direction mismatch! Target: ${lastWaveTarget.direction}, Candidate: ${targetCandidate.direction}`);
    lastWaveTarget.direction = targetCandidate.direction === 'bullish' ? 'up' : 'down';
  }
  const phase = primary
    ? `${primary.function.toUpperCase()} ${primary.pattern_type.toUpperCase()} ${primary.state.toUpperCase()}`
    : 'UNRESOLVED AMBIGUOUS';

  let interpretation = "";
  if (!primary) {
    interpretation = "Elliott Wave belum cukup bersih: pivot valid kurang atau skor kandidat terlalu lemah. Jangan paksa single count; tunggu swing baru terkonfirmasi.";
  } else if (isBottomingSqueeze) {
    interpretation = `STRUKTUR REVERSAL: primary count masih ${primary.state}, tetapi Squeeze Deluxe membaca akumulasi kuat di area bawah. Target pemulihan awal berada di Fibo 38.2% (${retracement.h382.toFixed(0)}) sampai 61.8% (${retracement.h618.toFixed(0)}); invalid jika harga kembali melemah di bawah ${formatNumber(primary.invalidation_levels[0]?.price ?? minPrice)}.`;
  } else if (primary.function === 'motive' && primary.direction === 'bullish') {
    interpretation = `Primary Elliott count: ${primary.pattern_type} bullish ${primary.state} dengan confidence ${primary.confidence}%. Target last wave: ${lastWaveTarget?.wave || 'N/A'} menuju ${formatNumber(lastWaveTarget?.price ?? finalTarget)}. Wave 4 ideal berada di ${formatNumber(w4TargetValue)} (${w4FiboRatio}); reachability Squeeze Deluxe ${reachability}.`;
  } else if (primary.function === 'motive' && primary.direction === 'bearish') {
    interpretation = `Primary Elliott count: ${primary.pattern_type} bearish ${primary.state} dengan confidence ${primary.confidence}%. Target last wave: ${lastWaveTarget?.wave || 'N/A'} menuju ${formatNumber(lastWaveTarget?.price ?? finalTarget)}. Selama invalidation ${formatNumber(primary.invalidation_levels[0]?.price ?? maxPrice)} belum ditembus, risiko impuls turun masih dominan.`;
  } else {
    interpretation = `Primary Elliott count: koreksi ${primary.pattern_type} ${primary.direction} ${primary.state} dengan confidence ${primary.confidence}%. Target last wave: ${lastWaveTarget?.wave || 'C/ABC'} menuju ${formatNumber(lastWaveTarget?.price ?? lastPrice)}. Struktur korektif diperlakukan probabilistik; tunggu breakout pivot akhir sebelum menyimpulkan impulse baru.`;
  }

  return {
    trend: isBottomingSqueeze ? 'BOTTOMING' : (bias === 'bullish' ? 'BULLISH' : bias === 'bearish' ? 'BEARISH' : (isUpTrend ? 'BULLISH' : 'BEARISH')),
    bias,
    state: primary?.state ?? 'ambiguous',
    confidence: primary?.confidence ?? 0,
    phase,
    primary_count: primary,
    alternate_counts: alternateCounts,
    warnings: primary?.warnings ?? ["No valid Elliott candidate found"],
    invalidation_levels: primary?.invalidation_levels ?? [],
    last_wave_target: lastWaveTarget,
    is_invalidated: isInvalidated,
    completion_state: completionState,
    range: { maxPrice, minPrice, diff },
    retracement,
    extension,
    w5Target: {
        aggressive: aggressiveW5,
        realistic: realisticW5,
        current: finalTarget,
        energyLevel,
        reachability
    },
    technicalSummary: buildElliottTechnicalSummary(primary, alternateCounts, bias),
    interpretation
  };
}

function normalizeWavePivots(pivots: WavePivot[]): WavePivot[] {
  return pivots
    .filter(p => Number.isFinite(p?.index) && Number.isFinite(p?.price) && (p?.type === 'high' || p?.type === 'low'))
    .map(p => ({ index: p.index, price: p.price, type: p.type, confirmed: p.confirmed !== false }))
    .sort((a, b) => a.index - b.index);
}

function buildElliottCandidates(quotes: OHLCV[], pivots: WavePivot[], lastSqz: SqueezePoint | null | undefined, prevSqz: SqueezePoint | null | undefined): WaveCandidate[] {
  const candidates: WaveCandidate[] = [];
  const recentPivots = pivots.slice(-28);

  for (let i = 0; i <= recentPivots.length - 3; i++) {
    const chunk = recentPivots.slice(i, i + 3);
    const setup = scoreMotiveSetupCandidate(quotes, chunk, lastSqz, prevSqz);
    if (setup) candidates.push(setup);
  }

  for (let i = 0; i <= recentPivots.length - 5; i++) {
    const chunk = recentPivots.slice(i, i + 5);
    const setup = scoreMotiveContinuationCandidate(quotes, chunk, lastSqz, prevSqz);
    if (setup) candidates.push(setup);
  }

  for (let i = 0; i <= recentPivots.length - 6; i++) {
    const chunk = recentPivots.slice(i, i + 6);
    const impulse = scoreImpulseCandidate(quotes, chunk, lastSqz, prevSqz);
    if (impulse) candidates.push(impulse);
  }

  for (let i = 0; i <= recentPivots.length - 3; i++) {
    const chunk = recentPivots.slice(i, i + 3);
    const setup = scoreCorrectiveSetupCandidate(quotes, chunk, lastSqz, prevSqz);
    if (setup) candidates.push(setup);
  }

  for (let i = 0; i <= recentPivots.length - 4; i++) {
    const chunk = recentPivots.slice(i, i + 4);
    const corrective = scoreCorrectiveCandidate(quotes, chunk, lastSqz, prevSqz);
    if (corrective) candidates.push(corrective);
  }

  candidates.forEach(candidate => {
    const lastIndex = candidate.pivots[candidate.pivots.length - 1]?.index ?? 0;
    const recencyFactor = 0.82 + 0.18 * (lastIndex / Math.max(1, quotes.length - 1));
    candidate.score = clamp01(candidate.score * recencyFactor);
    candidate.confidence = Math.round(candidate.score * 100);
  });

  const topCandidates = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  
  // DEBUG: Log all candidates for troubleshooting
  console.log(`[EW Debug] Total candidates: ${candidates.length}, Top 8: ${topCandidates.length}`);
  candidates.forEach((c, i) => {
    if (i < 8) return; // Already logged in top 8
    console.log(`[EW Debug] Other candidate ${i}: ${c.direction}, pivots=${c.pivots.length}, score=${c.score}`);
  });
  
  return topCandidates;
}

function scoreMotiveSetupCandidate(quotes: OHLCV[], pivots: WavePivot[], lastSqz: SqueezePoint | null | undefined, prevSqz: SqueezePoint | null | undefined): WaveCandidate | null {
  if (!isAlternating(pivots)) return null;
  const direction = pivots[0].type === 'low' && pivots[1].type === 'high'
    ? 'bullish'
    : pivots[0].type === 'high' && pivots[1].type === 'low'
      ? 'bearish'
      : null;
  if (!direction) return null;

  const [p0, p1, p2] = pivots;
  const wave1 = Math.abs(p1.price - p0.price);
  const wave2 = Math.abs(p2.price - p1.price);
  if (wave1 <= 0 || wave2 <= 0) return null;

  const wave2Valid = direction === 'bullish' ? p2.price > p0.price : p2.price < p0.price;
  if (!wave2Valid) return null;

  const fibScore = proximityScore(wave2 / wave1, [0.382, 0.5, 0.618, 0.786], 0.20);
  const timeScore = timeCoherenceScore(pivots);
  const squeezeScore = squeezeDirectionalScore(direction, lastSqz, prevSqz);
  const score = clamp01(0.35 + 0.25 * fibScore + 0.15 * timeScore + 0.15 * squeezeScore + 0.10);
  const warnings = p2.confirmed === false ? ["Wave 2 belum terkonfirmasi; target Wave 3 masih provisional."] : [];

  return {
    function: 'motive',
    pattern_type: 'impulse_wave_3_setup',
    direction,
    state: p2.confirmed === false ? 'provisional' : 'confirmed',
    pivots: withLabels(pivots, ['0', '1', '2']),
    labels: ['0', '1', '2'],
    score,
    confidence: Math.round(score * 100),
    warnings,
    invalidation_levels: [{ label: 'Wave 2 invalidation', price: p0.price }],
    meta: {
      wave2Retrace: round2(wave2 / wave1),
      targetWave: '3'
    }
  };
}

function scoreMotiveContinuationCandidate(quotes: OHLCV[], pivots: WavePivot[], lastSqz: SqueezePoint | null | undefined, prevSqz: SqueezePoint | null | undefined): WaveCandidate | null {
  if (!isAlternating(pivots)) return null;
  const direction = pivots[0].type === 'low' && pivots[1].type === 'high'
    ? 'bullish'
    : pivots[0].type === 'high' && pivots[1].type === 'low'
      ? 'bearish'
      : null;
  if (!direction) return null;

  const [p0, p1, p2, p3, p4] = pivots;
  const wave1 = Math.abs(p1.price - p0.price);
  const wave2 = Math.abs(p2.price - p1.price);
  const wave3 = Math.abs(p3.price - p2.price);
  const wave4 = Math.abs(p4.price - p3.price);
  if (Math.min(wave1, wave3) <= 0) return null;

  const wave2Valid = direction === 'bullish' ? p2.price > p0.price : p2.price < p0.price;
  const wave3NotShortestSoFar = wave3 >= wave1 * 0.618;
  const wave4NoOverlap = direction === 'bullish' ? p4.price > p1.price : p4.price < p1.price;
  const diagonalAllowed = wave2Valid && !wave4NoOverlap && isWedgeLike(pivots, direction);
  if (!wave2Valid || (!wave4NoOverlap && !diagonalAllowed) || !wave3NotShortestSoFar) return null;

  const fibScore = average([
    proximityScore(wave2 / wave1, [0.382, 0.5, 0.618, 0.786], 0.20),
    proximityScore(wave4 / wave3, [0.236, 0.382, 0.5], 0.18)
  ]);
  const alternationScore = Math.abs((wave2 / wave1) - (wave4 / wave3)) > 0.12 ? 1 : 0.55;
  const volumeScore = volumeCoherenceScore(quotes, p0.index, p1.index, p2.index, p3.index);
  const squeezeScore = squeezeDirectionalScore(direction, lastSqz, prevSqz);
  const score = clamp01(0.35 + 0.18 * fibScore + 0.12 * alternationScore + 0.12 * volumeScore + 0.13 * squeezeScore + 0.10);
  const warnings = p4.confirmed === false ? ["Wave 4 belum terkonfirmasi; target Wave 5 masih provisional."] : [];

  return {
    function: 'motive',
    pattern_type: diagonalAllowed ? 'diagonal_wave_5_setup' : 'impulse_wave_5_setup',
    direction,
    state: p4.confirmed === false ? 'provisional' : 'confirmed',
    pivots: withLabels(pivots, ['0', '1', '2', '3', '4']),
    labels: ['0', '1', '2', '3', '4'],
    score,
    confidence: Math.round(score * 100),
    warnings,
    invalidation_levels: [{ label: 'Wave 4 invalidation', price: p1.price }],
    meta: {
      wave3VsWave1: round2(wave3 / wave1),
      wave4Retrace: round2(wave4 / wave3),
      targetWave: '5'
    }
  };
}

function scoreImpulseCandidate(quotes: OHLCV[], pivots: WavePivot[], lastSqz: SqueezePoint | null | undefined, prevSqz: SqueezePoint | null | undefined): WaveCandidate | null {
  if (!isAlternating(pivots)) return null;
  const direction = pivots[0].type === 'low' && pivots[1].type === 'high'
    ? 'bullish'
    : pivots[0].type === 'high' && pivots[1].type === 'low'
      ? 'bearish'
      : null;
  if (!direction) return null;

  const [p0, p1, p2, p3, p4, p5] = pivots;
  const wave1 = Math.abs(p1.price - p0.price);
  const wave2 = Math.abs(p2.price - p1.price);
  const wave3 = Math.abs(p3.price - p2.price);
  const wave4 = Math.abs(p4.price - p3.price);
  const wave5 = Math.abs(p5.price - p4.price);
  if (Math.min(wave1, wave3, wave5) <= 0) return null;

  const wave2Valid = direction === 'bullish' ? p2.price > p0.price : p2.price < p0.price;
  const wave3NotShortest = !(wave3 < wave1 && wave3 < wave5);
  const wave4NoOverlap = direction === 'bullish' ? p4.price > p1.price : p4.price < p1.price;
  const hardValid = wave2Valid && wave3NotShortest && wave4NoOverlap;
  const diagonalAllowed = wave2Valid && wave3NotShortest && !wave4NoOverlap && isWedgeLike(pivots, direction);
  if (!hardValid && !diagonalAllowed) return null;

  const fibScore = average([
    proximityScore(wave2 / wave1, [0.382, 0.5, 0.618, 0.786], 0.18),
    proximityScore(wave4 / wave3, [0.236, 0.382, 0.5], 0.16),
    proximityScore(wave5 / wave1, [0.618, 1, 1.618], 0.28)
  ]);
  const equalityScore = Math.min(1, wave3 / Math.max(wave1, 1)) >= 1 ? 1 : 0.55;
  const alternationScore = Math.abs((wave2 / wave1) - (wave4 / wave3)) > 0.12 ? 1 : 0.55;
  const channelScore = channelFitScore(pivots, direction);
  const volumeScore = volumeCoherenceScore(quotes, p0.index, p1.index, p2.index, p3.index);
  const timeScore = timeCoherenceScore(pivots);
  const squeezeScore = squeezeDirectionalScore(direction, lastSqz, prevSqz);
  const hardScore = hardValid ? 1 : 0.72;
  const score = clamp01(
    0.35 * hardScore +
    0.15 * fibScore +
    0.10 * alternationScore +
    0.10 * equalityScore +
    0.10 * channelScore +
    0.10 * volumeScore +
    0.05 * timeScore +
    0.05 * squeezeScore
  );

  const warnings: string[] = [];
  if (!hardValid && diagonalAllowed) warnings.push("Wave 4 overlap wave 1, diperlakukan hanya sebagai diagonal candidate.");
  if (!p5.confirmed) warnings.push("Pivot terakhir belum terkonfirmasi; count dapat berubah saat bar baru masuk.");

  return {
    function: 'motive',
    pattern_type: hardValid ? 'impulse' : (pivots[0].index < quotes.length * 0.6 ? 'leading_diagonal' : 'ending_diagonal'),
    direction,
    state: p5.confirmed === false ? 'provisional' : 'confirmed',
    pivots: withLabels(pivots, ['0', '1', '2', '3', '4', '5']),
    labels: ['0', '1', '2', '3', '4', '5'],
    score,
    confidence: Math.round(score * 100),
    warnings,
    invalidation_levels: [{ label: direction === 'bullish' ? 'Wave 2 origin' : 'Wave 2 origin', price: p0.price }],
    meta: {
      wave2Retrace: round2(wave2 / wave1),
      wave3VsWave1: round2(wave3 / wave1),
      wave4Retrace: round2(wave4 / wave3),
      hardValid
    }
  };
}

function scoreCorrectiveCandidate(quotes: OHLCV[], pivots: WavePivot[], lastSqz: SqueezePoint | null | undefined, prevSqz: SqueezePoint | null | undefined): WaveCandidate | null {
  if (!isAlternating(pivots)) return null;
  const [p0, pA, pB, pC] = pivots;
  const direction = pC.price > p0.price ? 'bullish' : 'bearish';
  const waveA = Math.abs(pA.price - p0.price);
  const waveB = Math.abs(pB.price - pA.price);
  const waveC = Math.abs(pC.price - pB.price);
  if (Math.min(waveA, waveB, waveC) <= 0) return null;

  const bRetrace = waveB / waveA;
  const cVsA = waveC / waveA;
  let pattern = 'combination_double';
  let structuralScore = 0.5;
  if (bRetrace <= 0.786 && cVsA >= 0.618) {
    pattern = 'zigzag';
    structuralScore = 0.85;
  } else if (bRetrace >= 0.786 && bRetrace <= 1.382) {
    pattern = bRetrace > 1.05 ? 'flat_expanded' : 'flat_regular';
    structuralScore = 0.78;
  }

  const fibScore = average([
    proximityScore(bRetrace, [0.382, 0.5, 0.618, 0.786, 1, 1.236], 0.22),
    proximityScore(cVsA, [0.618, 1, 1.618], 0.30)
  ]);
  const volumeScore = volumeCoherenceScore(quotes, p0.index, pA.index, pB.index, pC.index);
  const timeScore = timeCoherenceScore(pivots);
  const squeezeScore = squeezeDirectionalScore(direction, lastSqz, prevSqz);
  const score = clamp01(
    0.35 * structuralScore +
    0.20 * fibScore +
    0.15 * timeScore +
    0.10 * volumeScore +
    0.10 * squeezeScore +
    0.10
  );
  const warnings = pC.confirmed === false ? ["Pivot C belum terkonfirmasi; koreksi masih provisional."] : [];

  return {
    function: 'corrective',
    pattern_type: pattern,
    direction,
    state: pC.confirmed === false ? 'provisional' : 'confirmed',
    pivots: withLabels(pivots, ['0', 'A', 'B', 'C']),
    labels: ['0', 'A', 'B', 'C'],
    score,
    confidence: Math.round(score * 100),
    warnings,
    invalidation_levels: [{ label: 'Correction origin', price: p0.price }],
    meta: {
      bRetrace: round2(bRetrace),
      cVsA: round2(cVsA)
    }
  };
}

function scoreCorrectiveSetupCandidate(quotes: OHLCV[], pivots: WavePivot[], lastSqz: SqueezePoint | null | undefined, prevSqz: SqueezePoint | null | undefined): WaveCandidate | null {
  if (!isAlternating(pivots)) return null;
  const [p0, pA, pB] = pivots;
  const direction = pA.price > p0.price ? 'bullish' : 'bearish';
  const waveA = Math.abs(pA.price - p0.price);
  const waveB = Math.abs(pB.price - pA.price);
  if (waveA <= 0 || waveB <= 0) return null;

  const bRetrace = waveB / waveA;
  if (bRetrace < 0.236 || bRetrace > 1.382) return null;

  const fibScore = proximityScore(bRetrace, [0.382, 0.5, 0.618, 0.786, 1, 1.236], 0.24);
  const timeScore = timeCoherenceScore(pivots);
  const squeezeScore = squeezeDirectionalScore(direction, lastSqz, prevSqz);
  const score = clamp01(0.32 + 0.25 * fibScore + 0.15 * timeScore + 0.12 * squeezeScore + 0.08);
  const warnings = pB.confirmed === false ? ["Wave B belum terkonfirmasi; target Wave C masih provisional."] : [];

  return {
    function: 'corrective',
    pattern_type: bRetrace > 1.05 ? 'expanded_flat_c_setup' : 'zigzag_c_setup',
    direction,
    state: pB.confirmed === false ? 'provisional' : 'confirmed',
    pivots: withLabels(pivots, ['0', 'A', 'B']),
    labels: ['0', 'A', 'B'],
    score,
    confidence: Math.round(score * 100),
    warnings,
    invalidation_levels: [{ label: 'Wave B invalidation', price: p0.price }],
    meta: {
      bRetrace: round2(bRetrace),
      targetWave: 'C'
    }
  };
}

function deriveLastWaveTarget(
  primary: WaveCandidate | null, 
  quotes: OHLCV[], 
  retracement: FibonacciLevels, 
  extension: FibonacciLevels, 
  energyLevel: string,
  completionState: WaveCompletionState,
  isInvalidated: boolean
): WaveTarget | null {
  const lastPrice = quotes[quotes.length - 1].close;

  // If invalidation level is broken, clear all targets
  if (isInvalidated) {
    return {
      wave: 'INVALIDATED',
      direction: 'sideways',
      price: lastPrice,
      conservative: lastPrice,
      aggressive: lastPrice,
      basis: 'Invalidation level ditembus; struktur wave berubah, tunggu formasi baru.',
      status: 'invalidated',
      warning: 'Target dibatalkan karena invalidation level ditembus.'
    };
  }

  if (!primary || primary.pivots.length < 2) {
    return {
      wave: 'WAITING',
      direction: 'sideways',
      price: lastPrice,
      conservative: lastPrice,
      aggressive: lastPrice,
      basis: 'Struktur wave masih menunggu pivot valid.',
      status: 'ambiguous',
      warning: 'Struktur wave masih menunggu konfirmasi; jangan paksa target.'
    };
  }

  const pivots = primary.pivots;
  const lastPivot = pivots[pivots.length - 1];
  const sign = primary.direction === 'bullish' ? 1 : -1;
  const warning = primary.state === 'ambiguous'
    ? 'Struktur wave masih ambiguous; target hanya skenario kerja.'
    : primary.state === 'provisional'
      ? 'Pivot terakhir belum terkunci; target bisa berubah.'
      : undefined;

  // STRICT: Never generate target that contradicts primary direction
  // If primary is bullish, target direction must be up (not down/bearish)
  const expectedTargetDirection = primary.direction === 'bullish' ? 'up' : 'down';

  // Check for duplicate targets - don't generate target if wave is already completed
  const nextTarget = getNextActiveWaveTarget(primary, completionState, lastPrice);

  // DEBUG: Log for troubleshooting
  console.log(`[EW Debug] Primary direction: ${primary.direction}, Pivots: ${pivots.length}, Wave3Completed: ${completionState.wave3Completed}, NextTarget: ${nextTarget}`);
  
  // If all waves are completed, return completion signal instead of duplicate target
  if (primary.function === 'motive' && completionState.wave5Completed) {
    return {
      wave: 'WAVE 5 COMPLETED',
      direction: sign > 0 ? 'up' : 'down',
      price: completionState.completionPrices.wave5 || lastPrice,
      conservative: completionState.completionPrices.wave5 || lastPrice,
      aggressive: completionState.completionPrices.wave5 || lastPrice,
      basis: 'Wave 5 sudah selesai di ' + formatNumber(completionState.completionPrices.wave5 || 0) + '. Menunggu koreksi A-B-C.',
      status: 'confirmed',
      warning: 'Jangan generate target Wave 5 lagi; wave sudah completed.'
    };
  }

  // If wave 3 is completed, don't show wave 3 target - show wave 4 or 5 target instead
  if (primary.function === 'motive' && completionState.wave3Completed) {
    if (!completionState.wave4Completed) {
      // Show wave 4 target
      const wave3Height = Math.abs(pivots[3].price - pivots[2].price);
      const conservative = primary.direction === 'bullish' 
        ? pivots[3].price - wave3Height * 0.382 
        : pivots[3].price + wave3Height * 0.382;
      const aggressive = primary.direction === 'bullish' 
        ? pivots[3].price - wave3Height * 0.618 
        : pivots[3].price + wave3Height * 0.618;
      const structure = `Wave 3 sudah selesai di ${formatNumber(pivots[3].price)}. Target ${primary.direction === 'bullish' ? 'Wave 4 retracement' : 'Wave 4 bounce'} 38.2%-61.8%.`;
      return buildTarget('Wave 4', primary.direction === 'bullish' ? -1 : 1, conservative, aggressive, energyLevel, structure, primary.state, warning);
    } else if (!completionState.wave5Completed) {
      // Show wave 5 target
      const wave1 = Math.abs(pivots[1].price - pivots[0].price);
      const wave3 = Math.abs(pivots[3].price - pivots[2].price);
      const conservative = lastPivot.price + sign * wave1;
      const aggressive = lastPivot.price + sign * Math.max(wave1 * 1.618, wave3 * 0.618);
      return buildTarget('Wave 5', sign, conservative, aggressive, energyLevel, `Wave 3 & 4 completed. Target Wave 5 dengan equality Wave 1 atau 0.618x Wave 3.`, primary.state, warning);
    }
  }

  if (primary.function === 'motive' && pivots.length === 3 && !completionState.wave3Completed) {
    const wave1 = Math.abs(pivots[1].price - pivots[0].price);
    const conservative = pivots[2].price + sign * wave1;
    const aggressive = pivots[2].price + sign * wave1 * 1.618;
    const structure = primary.direction === 'bullish'
      ? `W2 higher low (${formatNumber(pivots[2].price)}) masih di atas origin W0 (${formatNumber(pivots[0].price)}), jadi skenario W3 naik valid secara hard rule.`
      : `W2 lower high (${formatNumber(pivots[2].price)}) masih di bawah origin W0 (${formatNumber(pivots[0].price)}), jadi skenario W3 turun valid secara hard rule.`;
    return buildTarget('Wave 3', sign, conservative, aggressive, energyLevel, `${structure} Proyeksi memakai 1.0x sampai 1.618x Wave 1.`, primary.state, warning);
  }

  if (primary.function === 'motive' && pivots.length === 5 && !completionState.wave5Completed) {
    const wave1 = Math.abs(pivots[1].price - pivots[0].price);
    const wave3 = Math.abs(pivots[3].price - pivots[2].price);
    const conservative = lastPivot.price + sign * wave1;
    const aggressive = lastPivot.price + sign * Math.max(wave1 * 1.618, wave3 * 0.618);
    const structure = primary.direction === 'bullish'
      ? `W4 bertahan di atas area W1 (${formatNumber(pivots[1].price)}), sehingga impulse bullish belum invalid.`
      : `W4 bertahan di bawah area W1 (${formatNumber(pivots[1].price)}), sehingga impulse bearish belum invalid.`;
    return buildTarget('Wave 5', sign, conservative, aggressive, energyLevel, `${structure} Proyeksi memakai equality Wave 1 dan 0.618x Wave 3.`, primary.state, warning);
  }

  if (primary.function === 'motive' && pivots.length >= 6) {
    const conservative = primary.direction === 'bullish' ? retracement.h382 : extension.h618;
    const aggressive = primary.direction === 'bullish' ? retracement.h618 : extension.h382;
    return buildTarget('ABC after Wave 5', -sign, conservative, aggressive, energyLevel, 'Impulse tampak lengkap; target berikutnya adalah koreksi A-B-C ke zona retracement.', primary.state, warning);
  }

  if (primary.function === 'corrective' && pivots.length === 3 && !completionState.waveCCompleted) {
    const waveA = pivots[1].price - pivots[0].price;
    const conservative = pivots[2].price + waveA * 0.618;
    const aggressive = pivots[2].price + waveA;
    return buildTarget('Wave C', waveA >= 0 ? 1 : -1, conservative, aggressive, energyLevel, 'Wave C projection dari Wave B memakai 0.618x sampai 1.0x Wave A.', primary.state, warning);
  }

  if (primary.function === 'corrective' && pivots.length >= 4) {
    const waveC = pivots[3].price - pivots[2].price;
    const conservative = pivots[3].price - waveC * 0.382;
    const aggressive = pivots[3].price - waveC * 0.618;
    return buildTarget('Post ABC reversal', waveC >= 0 ? -1 : 1, conservative, aggressive, energyLevel, 'A-B-C tampak lengkap; target berikutnya adalah reversal awal dari ujung Wave C.', primary.state, warning);
  }

  return buildTarget('Last wave', lastPivot.price >= lastPrice ? -1 : 1, lastPrice, lastPrice, energyLevel, 'Fallback target dari struktur wave terakhir.', primary.state, warning);
}

function buildTarget(wave: string, sign: number, conservative: number, aggressive: number, energyLevel: string, basis: string, status: WaveState, warning?: string): WaveTarget {
  const preferAggressive = energyLevel === 'HIGH';
  return {
    wave,
    direction: sign > 0 ? 'up' : sign < 0 ? 'down' : 'sideways',
    price: preferAggressive ? aggressive : conservative,
    conservative,
    aggressive,
    basis,
    status,
    warning
  };
}

function withLabels(pivots: WavePivot[], labels: string[]) {
  return pivots.map((pivot, index) => ({ ...pivot, label: labels[index] || `P${index}` }));
}

function isAlternating(pivots: WavePivot[]) {
  return pivots.every((pivot, index) => index === 0 || pivot.type !== pivots[index - 1].type);
}

function isWedgeLike(pivots: WavePivot[], direction: 'bullish' | 'bearish') {
  const highs = pivots.filter(p => p.type === 'high').map(p => p.price);
  const lows = pivots.filter(p => p.type === 'low').map(p => p.price);
  if (highs.length < 2 || lows.length < 2) return false;
  const highCompression = Math.abs(highs[highs.length - 1] - highs[0]) / Math.max(Math.abs(highs[0]), 1);
  const lowCompression = Math.abs(lows[lows.length - 1] - lows[0]) / Math.max(Math.abs(lows[0]), 1);
  return direction === 'bullish'
    ? highs[highs.length - 1] > highs[0] && lowCompression < highCompression * 1.4
    : lows[lows.length - 1] < lows[0] && highCompression < lowCompression * 1.4;
}

function proximityScore(value: number, targets: number[], tolerance: number) {
  if (!Number.isFinite(value)) return 0;
  const nearest = Math.min(...targets.map(target => Math.abs(value - target)));
  return clamp01(1 - nearest / tolerance);
}

function channelFitScore(pivots: WavePivot[], direction: 'bullish' | 'bearish') {
  const [, , , p3, , p5] = pivots;
  if (direction === 'bullish') return p5.price >= p3.price ? 1 : 0.45;
  return p5.price <= p3.price ? 1 : 0.45;
}

function volumeCoherenceScore(quotes: OHLCV[], start1: number, end1: number, start3: number, end3: number) {
  const wave1Volume = averageVolume(quotes, start1, end1);
  const wave3Volume = averageVolume(quotes, start3, end3);
  if (!Number.isFinite(wave1Volume) || !Number.isFinite(wave3Volume) || wave1Volume <= 0) return 0.5;
  return wave3Volume >= wave1Volume * 1.1 ? 1 : wave3Volume >= wave1Volume ? 0.75 : 0.45;
}

function averageVolume(quotes: OHLCV[], start: number, end: number) {
  const low = Math.max(0, Math.min(start, end));
  const high = Math.min(quotes.length - 1, Math.max(start, end));
  const values = quotes.slice(low, high + 1).map(q => q.volume).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
}

function timeCoherenceScore(pivots: WavePivot[]) {
  const durations = pivots.slice(1).map((pivot, index) => Math.max(1, pivot.index - pivots[index].index));
  if (durations.length < 2) return 0.5;
  const ratios = durations.slice(1).map((duration, index) => duration / durations[index]);
  const valid = ratios.filter(ratio => ratio >= 0.38 && ratio <= 2.62).length;
  return valid / ratios.length;
}

function squeezeDirectionalScore(direction: 'bullish' | 'bearish', lastSqz: SqueezePoint | null | undefined, prevSqz: SqueezePoint | null | undefined) {
  if (!lastSqz) return 0.5;
  const momentumRising = prevSqz ? lastSqz.momentum > prevSqz.momentum : lastSqz.momentum > lastSqz.signal;
  const bullish = lastSqz.flux > 0 && lastSqz.momentum > lastSqz.signal && momentumRising;
  const bearish = lastSqz.flux < 0 && lastSqz.momentum < lastSqz.signal && !momentumRising;
  if ((direction === 'bullish' && bullish) || (direction === 'bearish' && bearish)) return 1;
  if ((direction === 'bullish' && bearish) || (direction === 'bearish' && bullish)) return 0.2;
  return 0.55;
}

function deriveElliottBias(primary: WaveCandidate | null, bottoming: boolean) {
  if (bottoming) return 'bullish_reversal';
  if (!primary) return 'neutral';
  if (primary.function === 'motive') return primary.direction;
  return primary.direction === 'bullish' ? 'bullish_recovery' : 'bearish_correction';
}

function buildElliottTechnicalSummary(primary: WaveCandidate | null, alternates: WaveCandidate[], bias: string) {
  if (!primary) return "EW unresolved: pivot belum cukup bersih untuk count utama.";
  const alt = alternates[0] ? ` Alternate: ${alternates[0].pattern_type} ${alternates[0].direction} (${alternates[0].confidence}%).` : "";
  return `EW ${primary.pattern_type} ${primary.direction}, state ${primary.state}, confidence ${primary.confidence}%, bias ${bias}.${alt}`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function round2(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(0) : "N/A";
}

/**
 * ZigZag Pivot Point Detection
 * Essential for identifying Elliott Wave start/end points
 */
export function calculatePivots(quotes: OHLCV[], deviation = 5, confirmBars = 2): WavePivot[] {
  if (quotes.length < 3) return [];
  const threshold = Math.max(0.01, deviation / 100);
  const pivots: WavePivot[] = [];
  let trend: 'up' | 'down' | null = null;
  let candidateHigh: WavePivot = { index: 0, price: quotes[0].high, type: 'high', confirmed: true };
  let candidateLow: WavePivot = { index: 0, price: quotes[0].low, type: 'low', confirmed: true };

  const pushPivot = (pivot: WavePivot) => {
    const normalized = { ...pivot, confirmed: pivot.index <= quotes.length - 1 - confirmBars };
    const previous = pivots[pivots.length - 1];
    if (!previous) {
      pivots.push(normalized);
      return;
    }
    if (previous.type === normalized.type) {
      const isMoreExtreme = normalized.type === 'high'
        ? normalized.price > previous.price
        : normalized.price < previous.price;
      if (isMoreExtreme) pivots[pivots.length - 1] = normalized;
      return;
    }
    if (previous.index !== normalized.index) pivots.push(normalized);
  };

  for (let i = 1; i < quotes.length; i++) {
    const high = quotes[i].high;
    const low = quotes[i].low;

    if (high > candidateHigh.price) candidateHigh = { index: i, price: high, type: 'high', confirmed: true };
    if (low < candidateLow.price) candidateLow = { index: i, price: low, type: 'low', confirmed: true };

    if (!trend) {
      if (high >= candidateLow.price * (1 + threshold)) {
        pushPivot(candidateLow);
        trend = 'up';
        candidateHigh = { index: i, price: high, type: 'high', confirmed: true };
      } else if (low <= candidateHigh.price * (1 - threshold)) {
        pushPivot(candidateHigh);
        trend = 'down';
        candidateLow = { index: i, price: low, type: 'low', confirmed: true };
      }
      continue;
    }

    if (trend === 'up') {
      if (high > candidateHigh.price) candidateHigh = { index: i, price: high, type: 'high', confirmed: true };
      if (low <= candidateHigh.price * (1 - threshold)) {
        pushPivot(candidateHigh);
        trend = 'down';
        candidateLow = { index: i, price: low, type: 'low', confirmed: true };
      }
    } else {
      if (low < candidateLow.price) candidateLow = { index: i, price: low, type: 'low', confirmed: true };
      if (high >= candidateLow.price * (1 + threshold)) {
        pushPivot(candidateLow);
        trend = 'up';
        candidateHigh = { index: i, price: high, type: 'high', confirmed: true };
      }
    }
  }

  if (trend === 'up') pushPivot(candidateHigh);
  if (trend === 'down') pushPivot(candidateLow);

  return pivots;
}
