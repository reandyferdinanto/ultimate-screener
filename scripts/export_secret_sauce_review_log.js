const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PG_URL = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham';

function avg(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeSamples(rows) {
  if (!rows.length) {
    return {
      sampleCount: 0,
      notes: 'No historical Secret Sauce samples available yet.',
    };
  }

  const summaries = rows.map((row) => row.pre_breakout_summary || {});
  const gains = rows.map((row) => Number(row.gain_percentage || 0));
  const avgRsi = summaries.map((row) => Number(row.avgRsi)).filter(Number.isFinite);
  const avgMfi = summaries.map((row) => Number(row.avgMfi)).filter(Number.isFinite);
  const avgRvol = summaries.map((row) => Number(row.avgVolRatio)).filter(Number.isFinite);
  const avgCompression = summaries.map((row) => Number(row.avgCompressionPct)).filter(Number.isFinite);
  const avgCloseNearHigh = summaries.map((row) => Number(row.avgCloseNearHighPct)).filter(Number.isFinite);

  return {
    sampleCount: rows.length,
    breakoutDateRange: {
      earliest: rows[rows.length - 1]?.breakout_date || null,
      latest: rows[0]?.breakout_date || null,
    },
    averageGainPct: Number((avg(gains) || 0).toFixed(2)),
    preBreakoutFingerprint: {
      avgRsi: Number((avg(avgRsi) || 0).toFixed(2)),
      avgMfi: Number((avg(avgMfi) || 0).toFixed(2)),
      avgRvol: Number((avg(avgRvol) || 0).toFixed(2)),
      avgCompressionPct: Number((avg(avgCompression) || 0).toFixed(2)),
      avgCloseNearHighPct: Number((avg(avgCloseNearHigh) || 0).toFixed(2)),
    },
  };
}

async function main() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();

  try {
    const latestVersionResult = await client.query(`
      SELECT id, version_label, status, rule_payload, source_summary, performance_summary, notes, generated_at
      FROM ai_secret_sauce_versions
      ORDER BY generated_at DESC
      LIMIT 1
    `);

    const recentVersionsResult = await client.query(`
      SELECT version_label, status, performance_summary, generated_at
      FROM ai_secret_sauce_versions
      ORDER BY generated_at DESC
      LIMIT 5
    `);

    const sampleRowsResult = await client.query(`
      SELECT ticker, breakout_date, gain_percentage, pre_breakout_summary, pre_breakout_window
      FROM secret_sauce_samples
      ORDER BY breakout_date DESC, created_at DESC
      LIMIT 50
    `);

    const topGainerAnalysisResult = await client.query(`
      SELECT ticker, date, gain_percentage, ai_verdict, ai_analysis_full, raw_technical_data
      FROM ai_top_gainers_analysis
      WHERE ai_verdict IS NOT NULL
      ORDER BY date DESC, created_at DESC
      LIMIT 30
    `);

    let latestVersion = latestVersionResult.rows[0] || null;
    let pendingRunsResult = { rows: [] };
    let recentBacktestsResult = { rows: [] };

    if (latestVersion) {
      pendingRunsResult = await client.query(
        `SELECT ticker, candidate_rank, entry_price, status, snapshot, run_date
         FROM ai_secret_sauce_runs
         WHERE version_id = $1
         ORDER BY candidate_rank ASC, ticker ASC
         LIMIT 30`,
        [latestVersion.id]
      );

      recentBacktestsResult = await client.query(
        `SELECT r.ticker, r.run_date, b.evaluation_date, b.outcome, b.max_gain_pct, b.max_drawdown_pct, b.final_return_pct
         FROM ai_secret_sauce_backtests b
         JOIN ai_secret_sauce_runs r ON r.id = b.run_id
         WHERE r.version_id = $1
         ORDER BY b.evaluation_date DESC, r.ticker ASC
         LIMIT 30`,
        [latestVersion.id]
      );
    }

    const report = {
      reportType: 'secret_sauce_manual_review_log',
      generatedAt: new Date().toISOString(),
      reviewMode: 'manual-improvement-with-ai-reader',
      objective: 'Use this log to manually review why the current Secret Sauce formula works or fails, then propose the next formula revision.',
      reviewInstructions: [
        'Read the latest formula thresholds first.',
        'Compare them with the historical pre-breakout fingerprint from real top gainers.',
        'Inspect recent candidates and note whether the formula is too loose or too strict.',
        'If backtests exist, focus on false positives, weak volume setups, overextended distance from EMA20, and poor candle quality.',
        'Recommend explicit threshold changes, new filters, or filters to remove.',
        'Do not return vague advice; return concrete rule changes for the next Secret Sauce version.',
      ],
      expectedAiOutputShape: {
        verdict: 'tighten|loosen|keep',
        why: 'short explanation',
        thresholdChanges: [
          {
            field: 'minRvol|maxDistEma20Pct|maxCompressionPct|minCloseNearHighPct|minRsi|maxRsi|minMfi',
            current: 0,
            proposed: 0,
            reason: 'why this change helps',
          },
        ],
        addFilters: ['optional new filter'],
        removeFilters: ['optional filter to remove'],
        notes: 'extra observations',
      },
      latestVersion: latestVersion
        ? {
            versionLabel: latestVersion.version_label,
            status: latestVersion.status,
            generatedAt: latestVersion.generated_at,
            rulePayload: latestVersion.rule_payload,
            sourceSummary: latestVersion.source_summary,
            performanceSummary: latestVersion.performance_summary,
            notes: latestVersion.notes,
          }
        : null,
      recentVersions: recentVersionsResult.rows,
      historicalSampleSummary: summarizeSamples(sampleRowsResult.rows),
      recentHistoricalSamples: sampleRowsResult.rows.map((row) => ({
        ticker: row.ticker,
        breakoutDate: row.breakout_date,
        gainPercentage: Number(row.gain_percentage || 0),
        preBreakoutSummary: row.pre_breakout_summary,
        preBreakoutWindow: row.pre_breakout_window,
      })),
      currentCandidates: pendingRunsResult.rows.map((row) => ({
        ticker: row.ticker,
        candidateRank: row.candidate_rank,
        entryPrice: Number(row.entry_price || 0),
        status: row.status,
        runDate: row.run_date,
        snapshot: row.snapshot,
      })),
      recentBacktests: recentBacktestsResult.rows.map((row) => ({
        ticker: row.ticker,
        runDate: row.run_date,
        evaluationDate: row.evaluation_date,
        outcome: row.outcome,
        maxGainPct: Number(row.max_gain_pct || 0),
        maxDrawdownPct: Number(row.max_drawdown_pct || 0),
        finalReturnPct: Number(row.final_return_pct || 0),
      })),
      recentTopGainerAnalysis: topGainerAnalysisResult.rows.map((row) => ({
        ticker: row.ticker,
        date: row.date,
        gainPercentage: Number(row.gain_percentage || 0),
        aiVerdict: row.ai_verdict,
        aiAnalysisFull: row.ai_analysis_full,
        rawTechnicalData: row.raw_technical_data,
      })),
    };

    const outputDir = path.join(process.cwd(), 'artifacts', 'secret-sauce-review');
    fs.mkdirSync(outputDir, { recursive: true });

    const dateTag = new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');
    const outputPath = path.join(outputDir, `secret-sauce-review-${dateTag}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(outputPath);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to export Secret Sauce review log:', error);
  process.exit(1);
});
