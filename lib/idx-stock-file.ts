import fs from "fs";

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

const DEFAULT_STOCK_FILE = "C:\\Users\\eluon\\Downloads\\idx_stocks_with_sectors_20260501.json";

let cachedStocks: FileBackedIndonesiaStock[] | null = null;

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

export function loadIdxStocks(): FileBackedIndonesiaStock[] {
  if (cachedStocks) return cachedStocks;

  const filePath = process.env.IDX_STOCKS_FILE || DEFAULT_STOCK_FILE;
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

export function findIdxStocksByLookupKeys(keys: string[]) {
  const wanted = new Set(keys.flatMap(stockLookupKeys));
  if (wanted.size === 0) return [];

  return loadIdxStocks().filter(stock =>
    stockLookupKeys(stock.ticker).some(key => wanted.has(key)) ||
    stockLookupKeys(stock.symbol).some(key => wanted.has(key))
  );
}
