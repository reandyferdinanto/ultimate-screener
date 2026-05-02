import fs from "fs";
import path from "path";
import { connectToDatabase } from "@/lib/db";
import { IndonesiaStockModel } from "@/lib/models/IndonesiaStock";

export type FileBackedIndonesiaStock = {
  ticker: string;
  symbol: string;
  name: string;
  active: boolean;
  exchange: string;
  lastPrice?: number;
  marketCapText?: string;
  sector: string;
  industry: string;
  updatedAt: string;
};

type IdxStockFileRow = {
  code?: unknown;
  symbol?: unknown;
  ticker?: unknown;
  company_name?: unknown;
  name?: unknown;
  sector?: unknown;
  industry?: unknown;
  listing_board?: unknown;
};

const DEFAULT_STOCK_FILE = path.join(process.cwd(), "data", "idx_stocks_with_sectors.json");
const LEGACY_STOCK_FILE = "C:\\Users\\eluon\\Downloads\\idx_stocks_with_sectors_20260501.json";

let cachedStocks: FileBackedIndonesiaStock[] | null = null;
let cachedAsyncStocks: Promise<FileBackedIndonesiaStock[]> | null = null;

function normalizeTicker(value: unknown) {
  const raw = String(value || "").trim().toUpperCase().replace(/\.JK$/, "");
  return raw ? `${raw}.JK` : "";
}

function normalizeSymbol(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\.JK$/, "");
}

function stockLookupKeys(value?: string) {
  const raw = normalizeSymbol(value);
  return raw ? [raw, `${raw}.JK`] : [];
}

function resolveStockFilePath() {
  const explicit = String(process.env.IDX_STOCKS_FILE || "").trim();
  if (explicit) return explicit;
  if (fs.existsSync(DEFAULT_STOCK_FILE)) return DEFAULT_STOCK_FILE;
  if (fs.existsSync(LEGACY_STOCK_FILE)) return LEGACY_STOCK_FILE;
  return DEFAULT_STOCK_FILE;
}

function mapDbStock(row: any): FileBackedIndonesiaStock | null {
  const symbol = normalizeSymbol(row?.symbol || row?.ticker || row?.code);
  const ticker = normalizeTicker(symbol);
  if (!symbol || !ticker) return null;

  return {
    ticker,
    symbol,
    name: String(row?.name || symbol),
    active: row?.active !== false,
    exchange: String(row?.exchange || "IDX"),
    lastPrice: Number.isFinite(Number(row?.lastPrice)) ? Number(row.lastPrice) : undefined,
    marketCapText: row?.marketCapText ? String(row.marketCapText) : undefined,
    sector: String(row?.sector || ""),
    industry: String(row?.industry || ""),
    updatedAt: new Date(row?.updatedAt || new Date()).toISOString(),
  };
}

export function loadIdxStocks(): FileBackedIndonesiaStock[] {
  if (cachedStocks) return cachedStocks;

  const filePath = resolveStockFilePath();
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `IDX stock universe file not found at ${filePath}. Set IDX_STOCKS_FILE or use getIdxStocksUniverse().`
    );
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const sourceDate = parsed?.metadata?.source_date || new Date().toISOString();
  const rows = Array.isArray(parsed?.stocks) ? parsed.stocks : [];

  const stocks = rows
    .map((row: IdxStockFileRow): FileBackedIndonesiaStock | null => {
      const symbol = normalizeSymbol(row?.code || row?.symbol || row?.ticker);
      const ticker = normalizeTicker(symbol);
      if (!symbol || !ticker) return null;

      return {
        ticker,
        symbol,
        name: String(row?.company_name || row?.name || symbol),
        active: true,
        exchange: "IDX",
        sector: String(row?.sector || ""),
        industry: String(row?.industry || row?.listing_board || ""),
        updatedAt: new Date(sourceDate).toISOString(),
      };
    })
    .filter((stock: FileBackedIndonesiaStock | null): stock is FileBackedIndonesiaStock => Boolean(stock))
    .sort((a: FileBackedIndonesiaStock, b: FileBackedIndonesiaStock) => a.ticker.localeCompare(b.ticker));

  cachedStocks = stocks;
  return stocks;
}

async function loadIdxStocksFromDatabase() {
  await connectToDatabase();
  const rows = await IndonesiaStockModel.find({ active: true }).lean();
  const stocks = rows
    .map(mapDbStock)
    .filter((stock: FileBackedIndonesiaStock | null): stock is FileBackedIndonesiaStock => Boolean(stock))
    .sort((a: FileBackedIndonesiaStock, b: FileBackedIndonesiaStock) => a.ticker.localeCompare(b.ticker));

  try {
    fs.mkdirSync(path.dirname(DEFAULT_STOCK_FILE), { recursive: true });
    const payload = {
      metadata: {
        source_date: new Date().toISOString(),
        source: "indonesiastocks collection",
      },
      stocks: stocks.map(stock => ({
        code: stock.symbol,
        company_name: stock.name,
        sector: stock.sector,
        industry: stock.industry,
        listing_board: stock.exchange,
      })),
    };
    fs.writeFileSync(DEFAULT_STOCK_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn("[idx-stock-file] failed to persist local IDX universe cache:", error instanceof Error ? error.message : error);
  }

  cachedStocks = stocks;
  return stocks;
}

export async function getIdxStocksUniverse() {
  if (cachedStocks) return cachedStocks;
  if (!cachedAsyncStocks) {
    cachedAsyncStocks = (async () => {
      const filePath = resolveStockFilePath();
      if (fs.existsSync(filePath)) {
        return loadIdxStocks();
      }

      return loadIdxStocksFromDatabase();
    })();
  }

  return cachedAsyncStocks;
}

export function findIdxStocksByLookupKeys(keys: string[]) {
  const wanted = new Set(keys.flatMap(stockLookupKeys));
  if (wanted.size === 0) return [];

  return loadIdxStocks().filter(stock =>
    stockLookupKeys(stock.ticker).some(key => wanted.has(key)) ||
    stockLookupKeys(stock.symbol).some(key => wanted.has(key))
  );
}

export async function findIdxStocksByLookupKeysAsync(keys: string[]) {
  const wanted = new Set(keys.flatMap(stockLookupKeys));
  if (wanted.size === 0) return [];

  const stocks = await getIdxStocksUniverse();
  return stocks.filter(stock =>
    stockLookupKeys(stock.ticker).some(key => wanted.has(key)) ||
    stockLookupKeys(stock.symbol).some(key => wanted.has(key))
  );
}
