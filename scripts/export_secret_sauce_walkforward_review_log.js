const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PG_URL = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham';

function getLatestWalkforwardFile(baseDir) {
  const files = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(baseDir, entry.name),
      mtimeMs: fs.statSync(path.join(baseDir, entry.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!files.length) {
    throw new Error('No walk-forward artifact found. Run npm run secret-sauce:walkforward-10d first.');
  }

  return files[0].fullPath;
}

async function main() {
  const walkforwardDir = path.join(process.cwd(), 'artifacts', 'secret-sauce-walkforward');
  const latestWalkforwardFile = getLatestWalkforwardFile(walkforwardDir);
  const walkforward = JSON.parse(fs.readFileSync(latestWalkforwardFile, 'utf8'));

  const client = new Client({ connectionString: PG_URL });
  await client.connect();

  try {
    const versionsResult = await client.query(`
      SELECT version_label, status, rule_payload, source_summary, performance_summary, notes, generated_at
      FROM ai_secret_sauce_versions
      ORDER BY generated_at DESC
      LIMIT 10
    `);

    const runsResult = await client.query(`
      SELECT r.ticker, r.run_date, r.candidate_rank, r.entry_price, r.status, r.snapshot, v.version_label
      FROM ai_secret_sauce_runs r
      JOIN ai_secret_sauce_versions v ON v.id = r.version_id
      ORDER BY r.run_date DESC, v.generated_at DESC, r.candidate_rank ASC
      LIMIT 50
    `);

    const backtestsResult = await client.query(`
      SELECT r.ticker, r.run_date, b.evaluation_date, b.outcome, b.max_gain_pct, b.max_drawdown_pct, b.final_return_pct, v.version_label
      FROM ai_secret_sauce_backtests b
      JOIN ai_secret_sauce_runs r ON r.id = b.run_id
      JOIN ai_secret_sauce_versions v ON v.id = r.version_id
      ORDER BY b.evaluation_date DESC, r.run_date DESC, r.ticker ASC
      LIMIT 50
    `);

    const rankedWalkforward = [...(walkforward.walkforwardResults || [])].sort((a, b) => {
      if ((b.totalHits || 0) !== (a.totalHits || 0)) return (b.totalHits || 0) - (a.totalHits || 0);
      if ((b.precisionPct || 0) !== (a.precisionPct || 0)) return (b.precisionPct || 0) - (a.precisionPct || 0);
      return (a.totalCandidates || 0) - (b.totalCandidates || 0);
    });

    const report = {
      reportType: 'secret_sauce_walkforward_manual_review_log',
      generatedAt: new Date().toISOString(),
      objective: 'Review the 10-day walk-forward Secret Sauce process and propose a tighter next formula based on false positives, rare hits, and the historical pre-breakout pattern.',
      reviewInstructions: [
        'Read the walk-forward results first, especially anchors with non-zero hits and anchors with too many false positives.',
        'Compare the active Secret Sauce thresholds against the walk-forward formulas and candidate lists.',
        'Focus on reducing false positives while keeping setups near the real pre-breakout fingerprint.',
        'Recommend explicit threshold changes and, if needed, one or two new filters to add later.',
        'Return concrete rule changes, not vague commentary.',
      ],
      expectedAiOutputShape: {
        verdict: 'tighten|loosen|keep',
        why: 'short explanation based on walk-forward evidence',
        thresholdChanges: [
          {
            field: 'minRvol|maxDistEma20Pct|maxCompressionPct|minCloseNearHighPct|minRsi|maxRsi|minMfi|minDistEma20Pct',
            current: 0,
            proposed: 0,
            reason: 'why this improves walk-forward quality',
          },
        ],
        addFilters: ['optional future filter'],
        removeFilters: ['optional filter to remove'],
        notes: 'extra observations',
      },
      dataCoverage: {
        walkforwardArtifact: latestWalkforwardFile,
        tradingDates: walkforward.tradingDates,
        breakoutSampleCount: walkforward.breakoutSampleCount,
      },
      currentVersions: versionsResult.rows,
      recentRuns: runsResult.rows,
      recentBacktests: backtestsResult.rows,
      walkforwardSummary: walkforward.summary,
      bestWalkforwardRuns: rankedWalkforward.slice(0, 5),
      allWalkforwardRunsCompact: (walkforward.walkforwardResults || []).map((run) => ({
        anchorDate: run.anchorDate,
        trainingSampleCount: run.trainingSampleCount,
        totalCandidates: run.totalCandidates,
        totalHits: run.totalHits,
        totalActualBreakouts: run.totalActualBreakouts,
        precisionPct: run.precisionPct,
        recallPct: run.recallPct,
        avgDailyCandidates: run.avgDailyCandidates,
        formula: run.formula,
      })),
      breakoutByDate: walkforward.breakoutByDate,
    };

    const outputDir = path.join(process.cwd(), 'artifacts', 'secret-sauce-review');
    fs.mkdirSync(outputDir, { recursive: true });
    const filename = `secret-sauce-walkforward-review-${new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z')}.json`;
    const outputPath = path.join(outputDir, filename);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(outputPath);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to export Secret Sauce walk-forward review log:', error.message || error);
  process.exit(1);
});
