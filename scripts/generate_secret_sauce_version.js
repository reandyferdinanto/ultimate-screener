const { Client } = require('pg');
const { buildFormulaFromSamples } = require('./secret_sauce_formula_utils');

const PG_URL = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham';

function buildVersionLabel(sequence) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `SS-${yyyy}${mm}${dd}-${sequence}`;
}

async function main() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();

  try {
    const sampleResult = await client.query(`
      SELECT breakout_date, pre_breakout_summary
      FROM secret_sauce_samples
      WHERE pre_breakout_summary IS NOT NULL
      ORDER BY breakout_date DESC
      LIMIT 120
    `);

    const lastVersionResult = await client.query(`
      SELECT id, version_label, performance_summary
      FROM ai_secret_sauce_versions
      ORDER BY generated_at DESC
      LIMIT 1
    `);

    const previousPerformance = lastVersionResult.rows[0]?.performance_summary || null;
    const { formula, sourceSummary, notes } = buildFormulaFromSamples(sampleResult.rows, previousPerformance);

    const sequenceResult = await client.query('SELECT COUNT(*)::int AS count FROM ai_secret_sauce_versions');
    const versionLabel = buildVersionLabel(sequenceResult.rows[0].count + 1);

    await client.query(`UPDATE ai_secret_sauce_versions SET status = 'archived' WHERE status IN ('active', 'needs_improvement')`);

    const insertResult = await client.query(
      `INSERT INTO ai_secret_sauce_versions (version_label, rule_payload, source_summary, status, notes)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING id, version_label`,
      [versionLabel, JSON.stringify(formula), JSON.stringify(sourceSummary), notes]
    );

    console.log(`Created Secret Sauce version ${insertResult.rows[0].version_label}`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to generate Secret Sauce version:', error);
    process.exit(1);
  });
}

module.exports = {
  buildVersionLabel,
  main,
};
