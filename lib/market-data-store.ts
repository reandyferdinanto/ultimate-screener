import { query } from "@/lib/db-pg";

type CandleRow = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type IndicatorRow = CandleRow & {
  ema9?: number;
  ema20?: number;
  ema60?: number;
  ema200?: number;
  atr14?: number;
  atrp14?: number;
  rsi?: number | null;
  mfi?: number;
  vwap?: number;
  squeezeDeluxe?: unknown;
  [key: string]: unknown;
};

type PersistInput = {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  indicators: IndicatorRow[];
  analysis: any;
};

let schemaReady = false;

const toDate = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString();
const dbNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

async function ensureMarketDataSchema() {
  if (schemaReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS market_candles (
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      time_epoch BIGINT NOT NULL,
      time_ts TIMESTAMPTZ NOT NULL,
      open NUMERIC NOT NULL,
      high NUMERIC NOT NULL,
      low NUMERIC NOT NULL,
      close NUMERIC NOT NULL,
      volume NUMERIC NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'yahoo',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, timeframe, time_epoch)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS technical_indicator_snapshots (
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      time_epoch BIGINT NOT NULL,
      time_ts TIMESTAMPTZ NOT NULL,
      close NUMERIC NOT NULL,
      ema9 NUMERIC,
      ema20 NUMERIC,
      ema60 NUMERIC,
      ema200 NUMERIC,
      atr14 NUMERIC,
      atrp14 NUMERIC,
      rsi NUMERIC,
      mfi NUMERIC,
      vwap NUMERIC,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, timeframe, time_epoch)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS signal_events (
      id BIGSERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      time_epoch BIGINT NOT NULL,
      time_ts TIMESTAMPTZ NOT NULL,
      action TEXT NOT NULL,
      state TEXT NOT NULL,
      entry_low NUMERIC,
      entry_high NUMERIC,
      ideal_buy NUMERIC,
      hard_stop NUMERIC,
      early_exit NUMERIC,
      target1 NUMERIC,
      target2 NUMERIC,
      reward_risk NUMERIC,
      max_loss_pct NUMERIC,
      expires_at_epoch BIGINT,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (symbol, timeframe, time_epoch, action, state)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS signal_outcomes (
      signal_id BIGINT PRIMARY KEY REFERENCES signal_events(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      hit_target BOOLEAN NOT NULL DEFAULT FALSE,
      hit_stop BOOLEAN NOT NULL DEFAULT FALSE,
      hit_time_stop BOOLEAN NOT NULL DEFAULT FALSE,
      max_gain_pct NUMERIC,
      max_drawdown_pct NUMERIC,
      bars_to_result INTEGER,
      evaluated_at_epoch BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_time ON market_candles (symbol, timeframe, time_epoch DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_signal_events_symbol_time ON signal_events (symbol, timeframe, time_epoch DESC)`);

  schemaReady = true;
}

async function refreshSignalOutcomes(symbol: string, timeframe: string, candles: CandleRow[]) {
  if (candles.length < 2) return 0;

  const minTime = candles[0].time;
  const latestTime = candles[candles.length - 1].time;
  const { rows } = await query(`
    SELECT id, time_epoch, ideal_buy::float AS ideal_buy, hard_stop::float AS hard_stop,
      target1::float AS target1, expires_at_epoch
    FROM signal_events
    WHERE symbol = $1 AND timeframe = $2 AND time_epoch >= $3 AND time_epoch < $4
    ORDER BY time_epoch DESC
    LIMIT 200
  `, [symbol, timeframe, minTime, latestTime]);

  let updated = 0;
  for (const signal of rows) {
    const entry = dbNumber(signal.ideal_buy);
    if (entry === null || entry <= 0) continue;

    const startIndex = candles.findIndex(candle => candle.time > Number(signal.time_epoch));
    if (startIndex === -1) continue;

    let status = "pending";
    let barsToResult: number | null = null;
    let evaluatedAt: number | null = null;
    let hitTarget = false;
    let hitStop = false;
    let hitTimeStop = false;
    let maxHigh = entry;
    let minLow = entry;

    for (let i = startIndex; i < candles.length; i++) {
      const candle = candles[i];
      maxHigh = Math.max(maxHigh, candle.high);
      minLow = Math.min(minLow, candle.low);

      if (signal.target1 !== null && candle.high >= Number(signal.target1)) {
        status = "target";
        hitTarget = true;
        barsToResult = i - startIndex + 1;
        evaluatedAt = candle.time;
        break;
      }

      if (signal.hard_stop !== null && candle.low <= Number(signal.hard_stop)) {
        status = "stop";
        hitStop = true;
        barsToResult = i - startIndex + 1;
        evaluatedAt = candle.time;
        break;
      }

      if (signal.expires_at_epoch !== null && candle.time >= Number(signal.expires_at_epoch)) {
        status = "time_stop";
        hitTimeStop = true;
        barsToResult = i - startIndex + 1;
        evaluatedAt = candle.time;
        break;
      }
    }

    const maxGainPct = ((maxHigh - entry) / entry) * 100;
    const maxDrawdownPct = ((minLow - entry) / entry) * 100;
    await query(`
      INSERT INTO signal_outcomes (signal_id, status, hit_target, hit_stop, hit_time_stop, max_gain_pct, max_drawdown_pct, bars_to_result, evaluated_at_epoch)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (signal_id) DO UPDATE SET
        status = EXCLUDED.status,
        hit_target = EXCLUDED.hit_target,
        hit_stop = EXCLUDED.hit_stop,
        hit_time_stop = EXCLUDED.hit_time_stop,
        max_gain_pct = EXCLUDED.max_gain_pct,
        max_drawdown_pct = EXCLUDED.max_drawdown_pct,
        bars_to_result = EXCLUDED.bars_to_result,
        evaluated_at_epoch = EXCLUDED.evaluated_at_epoch,
        updated_at = NOW()
    `, [
      signal.id,
      status,
      hitTarget,
      hitStop,
      hitTimeStop,
      Number(maxGainPct.toFixed(2)),
      Number(maxDrawdownPct.toFixed(2)),
      barsToResult,
      evaluatedAt
    ]);
    updated++;
  }

  return updated;
}

function buildValues(rows: unknown[][]) {
  const params = rows.flat();
  const width = rows[0]?.length || 0;
  const values = rows.map((row, rowIndex) => {
    const start = rowIndex * width;
    return `(${row.map((_, colIndex) => `$${start + colIndex + 1}`).join(", ")})`;
  }).join(", ");

  return { values, params };
}

export async function persistTechnicalAnalysis(input: PersistInput) {
  try {
    await ensureMarketDataSchema();

    if (input.candles.length > 0) {
      const candleRows = input.candles.map(candle => [
        input.symbol,
        input.timeframe,
        candle.time,
        toDate(candle.time),
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume || 0
      ]);
      const { values, params } = buildValues(candleRows);
      await query(`
        INSERT INTO market_candles (symbol, timeframe, time_epoch, time_ts, open, high, low, close, volume)
        VALUES ${values}
        ON CONFLICT (symbol, timeframe, time_epoch) DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume,
          updated_at = NOW()
      `, params);
    }

    if (input.indicators.length > 0) {
      const indicatorRows = input.indicators.map(row => [
        input.symbol,
        input.timeframe,
        row.time,
        toDate(row.time),
        row.close,
        dbNumber(row.ema9),
        dbNumber(row.ema20),
        dbNumber(row.ema60),
        dbNumber(row.ema200),
        dbNumber(row.atr14),
        dbNumber(row.atrp14),
        dbNumber(row.rsi),
        dbNumber(row.mfi),
        dbNumber(row.vwap),
        JSON.stringify(row)
      ]);
      const { values, params } = buildValues(indicatorRows);
      await query(`
        INSERT INTO technical_indicator_snapshots (symbol, timeframe, time_epoch, time_ts, close, ema9, ema20, ema60, ema200, atr14, atrp14, rsi, mfi, vwap, payload)
        VALUES ${values}
        ON CONFLICT (symbol, timeframe, time_epoch) DO UPDATE SET
          close = EXCLUDED.close,
          ema9 = EXCLUDED.ema9,
          ema20 = EXCLUDED.ema20,
          ema60 = EXCLUDED.ema60,
          ema200 = EXCLUDED.ema200,
          atr14 = EXCLUDED.atr14,
          atrp14 = EXCLUDED.atrp14,
          rsi = EXCLUDED.rsi,
          mfi = EXCLUDED.mfi,
          vwap = EXCLUDED.vwap,
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `, params);
    }

    const latest = input.indicators[input.indicators.length - 1];
    const plan = input.analysis?.tradePlan;
    if (latest && plan) {
      await query(`
        INSERT INTO signal_events (
          symbol, timeframe, time_epoch, time_ts, action, state, entry_low, entry_high, ideal_buy,
          hard_stop, early_exit, target1, target2, reward_risk, max_loss_pct, expires_at_epoch, payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (symbol, timeframe, time_epoch, action, state) DO UPDATE SET
          entry_low = EXCLUDED.entry_low,
          entry_high = EXCLUDED.entry_high,
          ideal_buy = EXCLUDED.ideal_buy,
          hard_stop = EXCLUDED.hard_stop,
          early_exit = EXCLUDED.early_exit,
          target1 = EXCLUDED.target1,
          target2 = EXCLUDED.target2,
          reward_risk = EXCLUDED.reward_risk,
          max_loss_pct = EXCLUDED.max_loss_pct,
          expires_at_epoch = EXCLUDED.expires_at_epoch,
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `, [
        input.symbol,
        input.timeframe,
        latest.time,
        toDate(latest.time),
        plan.action,
        plan.state,
        dbNumber(plan.entryLow),
        dbNumber(plan.entryHigh),
        dbNumber(plan.idealBuy),
        dbNumber(plan.hardStop),
        dbNumber(plan.earlyExit),
        dbNumber(plan.target1),
        dbNumber(plan.target2),
        dbNumber(plan.rewardRisk),
        dbNumber(plan.maxLossPct),
        dbNumber(plan.expiresAt),
        JSON.stringify(input.analysis)
      ]);
    }

    const outcomesUpdated = await refreshSignalOutcomes(input.symbol, input.timeframe, input.candles);

    return {
      enabled: true,
      candles: input.candles.length,
      indicatorSnapshots: input.indicators.length,
      signalStored: Boolean(latest && plan),
      outcomesUpdated
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown persistence error";
    console.warn("[market-data-store] persistence skipped:", message);
    return { enabled: false, error: message };
  }
}

export async function getRecentSignalEvents(symbol: string, timeframe: string, limit = 5) {
  try {
    await ensureMarketDataSchema();
    const { rows } = await query(`
      SELECT
        signal_events.time_ts AS "createdAt",
        signal_events.action,
        COALESCE(signal_outcomes.status, signal_events.state) AS status,
        ideal_buy::float AS "entryPrice",
        target1::float AS "targetPrice",
        hard_stop::float AS "stopLoss",
        reward_risk::float AS "rewardRisk",
        max_loss_pct::float AS "maxLossPct",
        signal_outcomes.max_gain_pct::float AS "maxGainPct",
        signal_outcomes.max_drawdown_pct::float AS "maxDrawdownPct",
        signal_outcomes.bars_to_result AS "barsToResult"
      FROM signal_events
      LEFT JOIN signal_outcomes ON signal_outcomes.signal_id = signal_events.id
      WHERE signal_events.symbol = $1 AND signal_events.timeframe = $2
      ORDER BY signal_events.time_epoch DESC
      LIMIT $3
    `, [symbol, timeframe, limit]);

    return rows;
  } catch {
    return [];
  }
}
