const fs = require('fs');
const path = require('path');

const DEFAULT_STOCK_FILE = path.join(process.cwd(), 'data', 'idx_stocks_with_sectors.json');
const LEGACY_STOCK_FILE = 'C:\\Users\\eluon\\Downloads\\idx_stocks_with_sectors_20260501.json';

let cachedStocks = null;

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.JK$/, '');
}

function normalizeTicker(value) {
  const raw = normalizeSymbol(value);
  return raw ? `${raw}.JK` : '';
}

function loadIdxStocks() {
  if (cachedStocks) return cachedStocks;

  const filePath = process.env.IDX_STOCKS_FILE || (fs.existsSync(DEFAULT_STOCK_FILE) ? DEFAULT_STOCK_FILE : LEGACY_STOCK_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(`IDX stock universe file not found at ${filePath}.`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const sourceDate = parsed && parsed.metadata && parsed.metadata.source_date ? parsed.metadata.source_date : new Date().toISOString();
  const rows = Array.isArray(parsed && parsed.stocks) ? parsed.stocks : [];

  cachedStocks = rows
    .map((row) => {
      const symbol = normalizeSymbol(row.code || row.symbol || row.ticker);
      const ticker = normalizeTicker(symbol);
      if (!symbol || !ticker) return null;

      return {
        ticker,
        symbol,
        name: String(row.company_name || row.name || symbol),
        active: true,
        exchange: 'IDX',
        sector: String(row.sector || ''),
        industry: String(row.industry || row.listing_board || ''),
        updatedAt: new Date(sourceDate),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  return cachedStocks;
}

module.exports = { loadIdxStocks };
