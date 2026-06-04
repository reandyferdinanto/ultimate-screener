import { query } from "@/lib/db-pg";

type ScreenerSnapshotInput = {
  data: unknown[];
  scanMeta: Record<string, unknown>;
};

type ScreenerSnapshot = ScreenerSnapshotInput & {
  generatedAt: string;
  expiresAt: string;
};

let schemaReady = false;

async function ensureScreenerCacheSchema() {
  if (schemaReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS screener_result_snapshots (
      id BIGSERIAL PRIMARY KEY,
      snapshot_type TEXT NOT NULL DEFAULT 'main',
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 days',
      row_count INTEGER NOT NULL DEFAULT 0,
      data JSONB NOT NULL,
      scan_meta JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_screener_result_snapshots_latest
    ON screener_result_snapshots (snapshot_type, generated_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_screener_result_snapshots_expires
    ON screener_result_snapshots (expires_at)
  `);

  schemaReady = true;
}

export async function pruneExpiredScreenerSnapshots() {
  await ensureScreenerCacheSchema();
  await query(`
    DELETE FROM screener_result_snapshots
    WHERE expires_at <= NOW()
       OR generated_at < NOW() - INTERVAL '10 days'
  `);
}

export async function invalidateScreenerSnapshots(snapshotType = "main") {
  await ensureScreenerCacheSchema();
  await query(`
    DELETE FROM screener_result_snapshots
    WHERE snapshot_type = $1
  `, [snapshotType]);
}

export async function saveScreenerSnapshot({ data, scanMeta }: ScreenerSnapshotInput) {
  await ensureScreenerCacheSchema();
  await pruneExpiredScreenerSnapshots();

  const { rows } = await query(`
    INSERT INTO screener_result_snapshots (snapshot_type, data, scan_meta, row_count)
    VALUES ('main', $1::jsonb, $2::jsonb, $3)
    RETURNING generated_at AS "generatedAt", expires_at AS "expiresAt"
  `, [
    JSON.stringify(data),
    JSON.stringify(scanMeta || {}),
    Array.isArray(data) ? data.length : 0,
  ]);

  return rows[0] as { generatedAt: string; expiresAt: string };
}

export async function getLatestScreenerSnapshot(): Promise<ScreenerSnapshot | null> {
  await ensureScreenerCacheSchema();
  await pruneExpiredScreenerSnapshots();

  const { rows } = await query(`
    SELECT
      data,
      scan_meta AS "scanMeta",
      generated_at AS "generatedAt",
      expires_at AS "expiresAt"
    FROM screener_result_snapshots
    WHERE snapshot_type = 'main'
      AND expires_at > NOW()
      AND generated_at >= NOW() - INTERVAL '10 days'
    ORDER BY generated_at DESC
    LIMIT 1
  `);

  if (!rows[0]) return null;

  return {
    data: Array.isArray(rows[0].data) ? rows[0].data : [],
    scanMeta: rows[0].scanMeta || {},
    generatedAt: rows[0].generatedAt,
    expiresAt: rows[0].expiresAt,
  };
}
