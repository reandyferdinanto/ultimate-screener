const stocksFile = require("../data/idx_stocks_with_sectors.json");

const DEFAULT_INTERVALS = ["1d", "4h", "1h", "15m"];

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeSymbol(stock) {
  const code = String(stock.code || stock.symbol || stock.ticker || "").trim().toUpperCase();
  if (!code) return "";
  return code.endsWith(".JK") ? code : `${code}.JK`;
}

async function mapWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const results = [];

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
    }
  }));

  return results;
}

async function scanSymbol(origin, symbol, intervals, timeoutMs) {
  const outcomes = [];

  for (const interval of intervals) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL("/api/technical", origin);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("interval", interval);
      const response = await fetch(url, { signal: controller.signal });
      const json = await response.json().catch(() => ({}));

      outcomes.push({
        interval,
        ok: response.ok && json.success !== false,
        error: response.ok ? json.error : `HTTP_${response.status}`,
        setup: json?._debug?.setupScore,
      });
    } catch (error) {
      outcomes.push({
        interval,
        ok: false,
        error: error instanceof Error ? error.message : "FETCH_FAILED",
      });
    } finally {
      clearTimeout(timeout);
    }

    await sleep(150);
  }

  return outcomes;
}

async function main() {
  const origin = argValue("origin", process.env.SCREENER_ORIGIN || "http://127.0.0.1:3000");
  const limit = Number(argValue("limit", process.env.SCREENER_SCAN_LIMIT || "0"));
  const concurrency = Math.max(1, Math.min(12, Number(argValue("concurrency", process.env.SCREENER_SCAN_CONCURRENCY || "4")) || 4));
  const timeoutMs = Math.max(5_000, Number(argValue("timeoutMs", process.env.SCREENER_SCAN_TIMEOUT_MS || "45000")) || 45_000);
  const intervals = String(argValue("intervals", process.env.SCREENER_SCAN_INTERVALS || DEFAULT_INTERVALS.join(",")))
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const stocks = (stocksFile.stocks || [])
    .map(normalizeSymbol)
    .filter(Boolean);
  const selected = limit > 0 ? stocks.slice(0, limit) : stocks;
  let ok = 0;
  let failed = 0;

  console.log(`Postgres screener scan started: ${selected.length} symbols, intervals=${intervals.join(",")}, concurrency=${concurrency}`);

  await mapWithConcurrency(selected, concurrency, async (symbol, index) => {
    const outcomes = await scanSymbol(origin, symbol, intervals, timeoutMs);
    const symbolOk = outcomes.some(outcome => outcome.ok);
    ok += symbolOk ? 1 : 0;
    failed += symbolOk ? 0 : 1;
    const failedIntervals = outcomes.filter(outcome => !outcome.ok);
    const suffix = failedIntervals.length > 0
      ? ` failed=${failedIntervals.map(item => `${item.interval}:${item.error}`).join("|")}`
      : "";
    console.log(`[${index + 1}/${selected.length}] ${symbol} ${symbolOk ? "stored" : "failed"}${suffix}`);
  });

  console.log(`Postgres screener scan completed. symbols_ok=${ok} symbols_failed=${failed}`);
  if (ok === 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
