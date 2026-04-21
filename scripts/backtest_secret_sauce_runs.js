const { Client } = require('pg');
const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const PG_URL = process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham';

function toPct(base, value) {
  return ((value - base) / base) * 100;
}

async function evaluateRun(run) {
  const entryPrice = Number(run.entry_price);
  const formula = run.rule_payload || {};
  const targetPrice = entryPrice * (1 + Number(formula.targetGainPct || 10) / 100);
  const stopPrice = entryPrice * (1 - Number(formula.stopLossPct || 5) / 100);
  const holdingDays = Number(formula.holdingDays || 5);

  const endDate = new Date(run.run_date);
  endDate.setDate(endDate.getDate() + holdingDays + 3);

  const chart = await yahooFinance.chart(`${run.ticker}.JK`, {
    period1: run.run_date,
    period2: endDate.toISOString().substring(0, 10),
    interval: '1d',
  });

  const quotes = (chart.quotes || []).filter((quote) => quote.close != null && quote.high != null && quote.low != null);
  if (quotes.length === 0) {
    return null;
  }

  let maxGainPct = 0;
  let maxDrawdownPct = 0;
  let finalReturnPct = toPct(entryPrice, quotes[quotes.length - 1].close);
  let outcome = 'pending';
  let hitTarget = false;
  let hitStop = false;
  let observed = 0;

  for (const quote of quotes) {
    observed += 1;
    maxGainPct = Math.max(maxGainPct, toPct(entryPrice, quote.high));
    maxDrawdownPct = Math.min(maxDrawdownPct, toPct(entryPrice, quote.low));
    finalReturnPct = toPct(entryPrice, quote.close);

    if (quote.low <= stopPrice) {
      outcome = 'failed';
      hitStop = true;
      break;
    }

    if (quote.high >= targetPrice) {
      outcome = 'success';
      hitTarget = true;
      break;
    }
  }

  if (!hitTarget && !hitStop && observed >= holdingDays) {
    outcome = finalReturnPct > 0 ? 'soft_success' : 'expired';
  }

  if (!hitTarget && !hitStop && observed < holdingDays) {
    return {
      evaluationDate: new Date().toISOString().substring(0, 10),
      daysObserved: observed,
      maxGainPct: Number(maxGainPct.toFixed(2)),
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
      finalReturnPct: Number(finalReturnPct.toFixed(2)),
      hitTarget: false,
      hitStop: false,
      outcome: 'pending',
      details: {
        targetPrice,
        stopPrice,
        quotesEvaluated: quotes.length,
      },
    };
  }

  return {
    evaluationDate: new Date().toISOString().substring(0, 10),
    daysObserved: observed,
    maxGainPct: Number(maxGainPct.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    finalReturnPct: Number(finalReturnPct.toFixed(2)),
    hitTarget,
    hitStop,
    outcome,
    details: {
      targetPrice,
      stopPrice,
      quotesEvaluated: quotes.length,
    },
  };
}

async function refreshVersionPerformance(client) {
  const aggregate = await client.query(`
    SELECT
      r.version_id,
      COUNT(*)::int AS total_evaluated,
      SUM(CASE WHEN b.outcome IN ('success', 'soft_success') THEN 1 ELSE 0 END)::int AS wins,
      ROUND(AVG(b.final_return_pct)::numeric, 2) AS avg_return_pct,
      ROUND(MAX(b.max_gain_pct)::numeric, 2) AS best_gain_pct,
      ROUND(MIN(b.max_drawdown_pct)::numeric, 2) AS worst_drawdown_pct
    FROM ai_secret_sauce_backtests b
    JOIN ai_secret_sauce_runs r ON r.id = b.run_id
    GROUP BY r.version_id
  `);

  for (const row of aggregate.rows) {
    const winRate = row.total_evaluated > 0 ? Number(((row.wins / row.total_evaluated) * 100).toFixed(2)) : 0;
    await client.query(
      `UPDATE ai_secret_sauce_versions
       SET performance_summary = $2,
           status = CASE
             WHEN status = 'archived' THEN status
             WHEN $3 >= 10 AND $4 < 40 THEN 'needs_improvement'
             WHEN status = 'needs_improvement' AND $4 >= 40 THEN 'active'
             ELSE status
           END
       WHERE id = $1`,
      [
        row.version_id,
        JSON.stringify({
          totalEvaluated: row.total_evaluated,
          wins: row.wins,
          winRate,
          avgReturnPct: Number(row.avg_return_pct || 0),
          bestGainPct: Number(row.best_gain_pct || 0),
          worstDrawdownPct: Number(row.worst_drawdown_pct || 0),
        }),
        row.total_evaluated,
        winRate,
      ]
    );
  }
}

async function main() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();

  try {
    const runs = await client.query(`
      SELECT r.id, r.ticker, r.run_date, r.entry_price, v.rule_payload
      FROM ai_secret_sauce_runs r
      JOIN ai_secret_sauce_versions v ON v.id = r.version_id
      WHERE r.status = 'pending'
      ORDER BY r.run_date ASC, r.id ASC
      LIMIT 100
    `);

    let completed = 0;

    for (const run of runs.rows) {
      const result = await evaluateRun(run);
      if (!result) {
        continue;
      }

      if (result.outcome === 'pending') {
        continue;
      }

      await client.query(
        `INSERT INTO ai_secret_sauce_backtests
         (run_id, evaluation_date, days_observed, max_gain_pct, max_drawdown_pct, final_return_pct, hit_target, hit_stop, outcome, details)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (run_id) DO UPDATE SET
           evaluation_date = EXCLUDED.evaluation_date,
           days_observed = EXCLUDED.days_observed,
           max_gain_pct = EXCLUDED.max_gain_pct,
           max_drawdown_pct = EXCLUDED.max_drawdown_pct,
           final_return_pct = EXCLUDED.final_return_pct,
           hit_target = EXCLUDED.hit_target,
           hit_stop = EXCLUDED.hit_stop,
           outcome = EXCLUDED.outcome,
           details = EXCLUDED.details`,
        [
          run.id,
          result.evaluationDate,
          result.daysObserved,
          result.maxGainPct,
          result.maxDrawdownPct,
          result.finalReturnPct,
          result.hitTarget,
          result.hitStop,
          result.outcome,
          JSON.stringify(result.details),
        ]
      );

      await client.query('UPDATE ai_secret_sauce_runs SET status = $2 WHERE id = $1', [run.id, result.outcome]);
      completed += 1;
    }

    await refreshVersionPerformance(client);
    console.log(`Backtested ${completed} Secret Sauce run(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to backtest Secret Sauce runs:', error);
  process.exit(1);
});
