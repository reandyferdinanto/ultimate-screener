const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { normalizeFormula } = require('./secret_sauce_formula_utils');

const PG_URL = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham';

const ALLOWED_FIELDS = new Set([
  'lookbackCandles',
  'minDistEma20Pct',
  'maxDistEma20Pct',
  'minRvol',
  'minRsi',
  'maxRsi',
  'minMfi',
  'maxCompressionPct',
  'minCloseNearHighPct',
  'targetGainPct',
  'stopLossPct',
  'holdingDays',
]);

function usage() {
  console.error('Usage: node scripts/apply_manual_secret_sauce_revision.js <path-to-ai-revision-json>');
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {}

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1]);
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  }

  throw new Error('Could not parse revision JSON from file.');
}

function toNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Field ${field} must have a numeric proposed value.`);
  }
  return parsed;
}

function validateRevision(revision) {
  if (!revision || typeof revision !== 'object') {
    throw new Error('Revision payload must be an object.');
  }

  if (!['tighten', 'loosen', 'keep'].includes(revision.verdict)) {
    throw new Error('Revision verdict must be tighten, loosen, or keep.');
  }

  if (!Array.isArray(revision.thresholdChanges)) {
    throw new Error('Revision thresholdChanges must be an array.');
  }

  for (const change of revision.thresholdChanges) {
    if (!ALLOWED_FIELDS.has(change.field)) {
      throw new Error(`Unsupported threshold field: ${change.field}`);
    }
    toNumber(change.proposed, change.field);
  }

  if (revision.addFilters && !Array.isArray(revision.addFilters)) {
    throw new Error('Revision addFilters must be an array when provided.');
  }

  if (revision.removeFilters && !Array.isArray(revision.removeFilters)) {
    throw new Error('Revision removeFilters must be an array when provided.');
  }
}

function buildNextVersionLabel(existingCount) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `SS-${yyyy}${mm}${dd}-${existingCount + 1}`;
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    usage();
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Revision file not found: ${filePath}`);
  }

  const revision = extractJson(fs.readFileSync(filePath, 'utf8'));
  validateRevision(revision);

  const client = new Client({ connectionString: PG_URL });
  await client.connect();

  try {
    const latestResult = await client.query(`
      SELECT id, version_label, rule_payload, source_summary, performance_summary
      FROM ai_secret_sauce_versions
      ORDER BY generated_at DESC
      LIMIT 1
    `);

    if (latestResult.rows.length === 0) {
      throw new Error('No existing Secret Sauce version found. Generate one first.');
    }

    const latest = latestResult.rows[0];
    const nextFormula = normalizeFormula(latest.rule_payload || {});

    for (const change of revision.thresholdChanges) {
      nextFormula[change.field] = toNumber(change.proposed, change.field);
    }

    const countResult = await client.query('SELECT COUNT(*)::int AS count FROM ai_secret_sauce_versions');
    const nextVersionLabel = buildNextVersionLabel(countResult.rows[0].count);

    const nextSourceSummary = {
      ...(latest.source_summary || {}),
      manualRevision: {
        basedOnVersion: latest.version_label,
        verdict: revision.verdict,
        why: revision.why || '',
        thresholdChanges: revision.thresholdChanges,
        addFilters: revision.addFilters || [],
        removeFilters: revision.removeFilters || [],
        notes: revision.notes || '',
        appliedAt: new Date().toISOString(),
        appliedFromFile: filePath,
      },
    };

    const notesParts = [
      `Manual revision applied from ${path.basename(filePath)}.`,
      revision.why || '',
      revision.notes || '',
      (revision.addFilters || []).length ? `Requested addFilters: ${(revision.addFilters || []).join(' | ')}` : '',
      (revision.removeFilters || []).length ? `Requested removeFilters: ${(revision.removeFilters || []).join(' | ')}` : '',
    ].filter(Boolean);

    await client.query(`UPDATE ai_secret_sauce_versions SET status = 'archived' WHERE status IN ('active', 'needs_improvement')`);

    const insertResult = await client.query(
      `INSERT INTO ai_secret_sauce_versions (version_label, rule_payload, source_summary, performance_summary, status, notes)
       VALUES ($1, $2, $3, $4, 'active', $5)
       RETURNING version_label`,
      [
        nextVersionLabel,
        JSON.stringify(nextFormula),
        JSON.stringify(nextSourceSummary),
        JSON.stringify(latest.performance_summary || {}),
        notesParts.join(' '),
      ]
    );

    console.log(`Applied manual Secret Sauce revision. New version: ${insertResult.rows[0].version_label}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to apply manual Secret Sauce revision:', error.message || error);
  process.exit(1);
});
