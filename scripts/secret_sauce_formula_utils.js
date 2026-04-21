const DEFAULT_FORMULA = {
  lookbackCandles: 10,
  minDistEma20Pct: -2,      // Was -3, tighter (closer to EMA20)
  maxDistEma20Pct: 5,        // Was 6, tighter (not too far extended)
  minRvol: 1.3,              // Was 1.2, need stronger volume
  minRsi: 45,
  maxRsi: 68,                // Was 65, slightly wider for momentum plays
  minMfi: 50,                // Was 45, need stronger money flow
  maxCompressionPct: 4.0,    // Was 4.5, tighter compression
  minCloseNearHighPct: 65,   // Was 60, need stronger close
  targetGainPct: 10,
  stopLossPct: 5,
  holdingDays: 5,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values, ratio) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const index = (clean.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return clean[lower];
  const weight = index - lower;
  return clean[lower] * (1 - weight) + clean[upper] * weight;
}

function normalizeFormula(partial = {}) {
  return {
    ...DEFAULT_FORMULA,
    ...partial,
  };
}

function buildFormulaFromSamples(samples, previousPerformance) {
  if (samples.length === 0) {
    return {
      formula: DEFAULT_FORMULA,
      sourceSummary: {
        sampleCount: 0,
        mode: 'bootstrap',
      },
      notes: 'Bootstrap formula created because no historical pre-breakout samples are stored yet.',
    };
  }

  const distMin = samples.map((sample) => Number(sample.pre_breakout_summary?.minDistEma20Pct));
  const distMax = samples.map((sample) => Number(sample.pre_breakout_summary?.maxDistEma20Pct));
  const avgRvol = samples.map((sample) => Number(sample.pre_breakout_summary?.avgVolRatio));
  const avgRsi = samples.map((sample) => Number(sample.pre_breakout_summary?.avgRsi));
  const avgMfi = samples.map((sample) => Number(sample.pre_breakout_summary?.avgMfi));
  const compression = samples.map((sample) => Number(sample.pre_breakout_summary?.avgCompressionPct));
  const closeNearHigh = samples.map((sample) => Number(sample.pre_breakout_summary?.avgCloseNearHighPct));

  const formula = normalizeFormula({
    minDistEma20Pct: clamp((percentile(distMin, 0.2) ?? DEFAULT_FORMULA.minDistEma20Pct) - 0.5, -8, 2),
    maxDistEma20Pct: clamp((percentile(distMax, 0.8) ?? DEFAULT_FORMULA.maxDistEma20Pct) + 0.5, 1, 10),
    minRvol: clamp((percentile(avgRvol, 0.4) ?? DEFAULT_FORMULA.minRvol), 1.0, 3.5),
    minRsi: clamp((percentile(avgRsi, 0.25) ?? DEFAULT_FORMULA.minRsi) - 3, 30, 65),
    maxRsi: clamp((percentile(avgRsi, 0.75) ?? DEFAULT_FORMULA.maxRsi) + 3, 45, 80),
    minMfi: clamp((percentile(avgMfi, 0.3) ?? DEFAULT_FORMULA.minMfi) - 3, 30, 85),
    maxCompressionPct: clamp((percentile(compression, 0.6) ?? DEFAULT_FORMULA.maxCompressionPct) + 0.5, 1.5, 8),
    minCloseNearHighPct: clamp((percentile(closeNearHigh, 0.35) ?? DEFAULT_FORMULA.minCloseNearHighPct) - 5, 40, 95),
  });

  let notes = `Formula synthesized from ${samples.length} historical breakout samples.`;
  if (previousPerformance?.totalEvaluated >= 10 && previousPerformance?.winRate < 40) {
    formula.minRvol = clamp(formula.minRvol + 0.15, 1.0, 4);
    formula.maxCompressionPct = clamp(formula.maxCompressionPct - 0.4, 1.5, 8);
    formula.maxDistEma20Pct = clamp(formula.maxDistEma20Pct - 0.5, 1, 10);
    formula.minCloseNearHighPct = clamp(formula.minCloseNearHighPct + 5, 40, 95);
    notes += ` Previous version winrate was ${previousPerformance.winRate}%, so the new formula tightens volume, compression, and candle-close filters.`;
  }

  return {
    formula,
    sourceSummary: {
      sampleCount: samples.length,
      basedOnBreakoutRange: {
        earliest: samples[samples.length - 1]?.breakout_date ?? null,
        latest: samples[0]?.breakout_date ?? null,
      },
      previousPerformance: previousPerformance || null,
    },
    notes,
  };
}

module.exports = {
  DEFAULT_FORMULA,
  buildFormulaFromSamples,
  clamp,
  percentile,
  normalizeFormula,
};
