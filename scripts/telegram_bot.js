const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const YahooFinance = require('yahoo-finance2').default;

loadLocalEnv();

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

// Schemas
const settingsSchema = new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed });
const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

const indonesiaStockSchema = new mongoose.Schema({
    ticker: String, symbol: String, name: String, active: Boolean, sector: String, lastPrice: Number
}, { collection: "indonesiastocks" });
const IndonesiaStock = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema);

const signalPerformanceSchema = new mongoose.Schema({
    ticker: String, entryDate: Date, exitDate: Date, entryPrice: Number, exitPrice: Number, durationDays: Number, isSuccess: Boolean, gainPct: Number, signalSource: String
});
const SignalPerformance = mongoose.models.SignalPerformance || mongoose.model("SignalPerformance", signalPerformanceSchema);

let bot;
let botToken = "";
let restartTimer;
let initInProgress = false;

const APP_BASE_URL = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ultimate-screener.ebite.biz.id").replace(/\/$/, "");
const RETRY_DELAY_MS = 30000;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.NVAPI_API_KEY || "";
const NVIDIA_BASE_URL = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "openai/gpt-oss-120b";

function loadLocalEnv() {
    [".env.local", ".env"].forEach(file => {
        const filePath = path.join(process.cwd(), file);
        if (!fs.existsSync(filePath)) return;
        const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return;
            const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (!match) return;
            const key = match[1];
            if (process.env[key] !== undefined) return;
            process.env[key] = match[2].replace(/^['"]|['"]$/g, "");
        });
    });
}

function scheduleBotInit(reason) {
    if (restartTimer) return;
    console.log(`[Telegram] ${reason} Retrying in ${RETRY_DELAY_MS / 1000}s.`);
    restartTimer = setTimeout(() => {
        restartTimer = null;
        initBot().catch(error => {
            console.error("[Telegram] Retry failed:", error.message);
            scheduleBotInit("Bot initialization failed.");
        });
    }, RETRY_DELAY_MS);
}

async function telegramApi(method, token) {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

async function validateBotToken(token) {
    if (!token) return { ok: false, reason: "missing token" };
    const result = await telegramApi("getMe", token);
    if (result.json.ok) return { ok: true, bot: result.json.result };
    return {
        ok: false,
        reason: result.json.description || `Telegram API HTTP ${result.status}`,
        status: result.status,
        errorCode: result.json.error_code
    };
}

function pollingErrorMessage(error) {
    const response = error.response?.body || error.response || {};
    return [
        error.code,
        response.error_code,
        response.description,
        error.message
    ].filter(Boolean).join(" | ");
}

function normalizeTickerInput(value) {
    const input = String(value || "").trim().toUpperCase();
    if (!input) return "";
    if (input.includes(".")) return input;
    if (input.startsWith("^")) return input;
    return `${input}.JK`;
}

function rawTicker(value) {
    return String(value || "").trim().toUpperCase().replace(/\.JK$/, "").split(".")[0];
}

function tickerLookupKeys(value) {
    const yahooTicker = normalizeTickerInput(value);
    const raw = rawTicker(yahooTicker);
    return Array.from(new Set([yahooTicker, raw, `${raw}.JK`].filter(Boolean)));
}

async function findStockByTicker(value) {
    const keys = tickerLookupKeys(value);
    if (keys.length === 0) return null;
    return IndonesiaStock.findOne({
        $or: [
            { ticker: { $in: keys } },
            { symbol: { $in: keys } }
        ]
    });
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function fetchTechnical(ticker, interval = "1d") {
    const url = `${APP_BASE_URL}/api/technical?symbol=${encodeURIComponent(normalizeTickerInput(ticker))}&interval=${encodeURIComponent(interval)}`;
    return fetchJson(url).catch(error => ({ success: false, error: error.message }));
}

async function fetchScreenerSummary() {
    const json = await fetchJson(`${APP_BASE_URL}/api/screener`).catch(() => null);
    if (!json?.success || !Array.isArray(json.data)) return [];
    return json.data.slice(0, 12).map(signal => ({
        ticker: rawTicker(signal.ticker),
        category: signal.category || signal.metadata?.category || null,
        vector: signal.vector || signal.metadata?.vector || signal.signalSource || null,
        entryPrice: signal.entryPrice ?? signal.buyArea ?? null,
        currentPrice: signal.currentPrice ?? null,
        stopLossPrice: signal.stopLossPrice ?? null,
        targetPrice: signal.targetPrice ?? null,
        rewardRisk: signal.rewardRisk ?? null,
        deltaPct: signal.deltaPct ?? null,
        relevanceScore: signal.relevanceScore ?? null,
        thesis: signal.thesis || signal.metadata?.thesis || null,
        appearedAt: signal.appearedAt || signal.metadata?.appearedAt || signal.entryDate || null,
        evaluationStatus: signal.evaluation?.status || signal.metadata?.evaluationStatus || null,
    }));
}

async function fetchMoversSummary() {
    const json = await fetchJson(`${APP_BASE_URL}/api/market/movers`).catch(() => null);
    if (!json?.success) return null;
    const compactMover = item => ({
        ticker: rawTicker(item.ticker || item.symbol),
        price: item.price ?? item.lastPrice ?? null,
        changePercent: item.changePercent ?? item.changePct ?? null,
        volume: item.volume ?? null,
    });
    return {
        gainers: Array.isArray(json.gainers) ? json.gainers.slice(0, 6).map(compactMover) : [],
        losers: Array.isArray(json.losers) ? json.losers.slice(0, 6).map(compactMover) : [],
    };
}

function analysisUrl(ticker, interval = "1d") {
    return `${APP_BASE_URL}/search?symbol=${encodeURIComponent(normalizeTickerInput(ticker))}&interval=${encodeURIComponent(interval)}`;
}

function formatNumber(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return number.toLocaleString("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatPrice(value) {
    return formatNumber(value, 0);
}

function formatPct(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return `${number.toFixed(digits)}%`;
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatSignalLabel(value) {
    return String(value || "TECHNICAL").replace(/_/g, " ");
}

function cleanMarkdownText(value, maxLength = 700) {
    const text = String(value || "-").replace(/```/g, "'''").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

function formatReportCopy(value, maxLength = 700) {
    return cleanMarkdownText(value, maxLength)
        .replace(/Price previously stretched far above EMA20, pulled back in a controlled way, then moved sideways with lower volatility\/volume while trend support held\./gi, "Harga sebelumnya sudah jauh dari EMA20, lalu pullback dengan rapi. Setelah itu geraknya mulai sideways, volatilitas dan volume turun, tapi support tren masih dijaga.")
        .replace(/VOLATILITY ENGINE: EXPANSION PHASE\. Energy is being released aggressively\./gi, "Mesin volatilitas lagi fase ekspansi. Energinya sedang keluar cukup agresif.")
        .replace(/VOLATILITY ENGINE: BREAKOUT INITIALIZED \((\d+) Bars\)\. Tension is resolving upwards\./gi, "Mesin volatilitas mulai breakout ($1 candle). Tekanan mulai lepas ke atas.")
        .replace(/VOLATILITY ENGINE: NEUTRAL\. Seeking new range\./gi, "Mesin volatilitas lagi netral. Harga masih cari range baru.")
        .replace(/VOLATILITY ENGINE:/gi, "Mesin volatilitas:")
        .replace(/HIGH_COMPRESSION/gi, "kompresi tinggi")
        .replace(/NORMAL_COMPRESSION/gi, "kompresi normal")
        .replace(/LOW_COMPRESSION/gi, "kompresi ringan")
        .replace(/NO_SQUEEZE/gi, "belum squeeze")
        .replace(/\((\d+) Bars\)/gi, "($1 candle)")
        .replace(/Flux is/gi, "Flux lagi")
        .replace(/Momentum is ACCELERATING\./gi, "Momentum lagi akselerasi.")
        .replace(/Momentum is DECELERATING\./gi, "Momentum mulai melambat.")
        .replace(/chart live sedang risk-off/gi, "chart live lagi risk-off")
        .replace(/chart live risk-off/gi, "chart live lagi risk-off")
        .replace(/\s+/g, " ")
        .trim();
}

function getExecutionPlan(analysis) {
    return analysis?.screenerTradePlan || analysis?.tradePlan || null;
}

function buildInlineKeyboard(ticker, interval = "1d") {
    const raw = rawTicker(ticker);
    const currentInterval = normalizeIntervalInput(interval) || "1d";
    const timeframeButtons = ["1d", "15m", "1h", "4h"]
        .filter(item => item !== currentInterval)
        .map(item => ({ text: item.toUpperCase(), callback_data: `tf_${raw}_${item}` }));

    return {
        inline_keyboard: [
            [
                { text: '📊 View Interactive Chart', url: analysisUrl(ticker, interval) },
                { text: '🔄 Refresh', callback_data: `refresh_${raw}_${interval}` }
            ],
            timeframeButtons,
            [
                { text: '💸 Execution Plan', callback_data: `buyplan_${raw}_${interval}` }
            ]
        ]
    };
}

function buildConvictionReport(raw, interval, price, changePct, techRes) {
    const analysis = techRes.unifiedAnalysis || {};
    const screener = techRes.screenerContext || analysis.screenerContext;
    const activeSignals = techRes.activeScreenerSignals || analysis.activeScreenerSignals || [];
    const plan = getExecutionPlan(analysis);
    const timeLabel = interval === "15m" ? " (15m SCALP)" : interval !== "1d" ? ` (${interval})` : "";

    let md = "```md\n";
    md += `# CONVICTION_REPORT: ${raw}${timeLabel}\n`;
    md += `Price   : ${formatPrice(price)} (${formatPct(changePct)})\n`;
    md += `Verdict : ${analysis.verdict || "-"}\n`;
    md += `Risk    : ${analysis.riskLevel || "-"}\n\n`;

    if (screener) {
        md += "## SCREENER_SYNC\n";
        md += `- Category : ${formatSignalLabel(screener.category)}\n`;
        md += `- Vector   : ${screener.vector || screener.signalSource || "-"}\n`;
        md += `- Appeared : ${formatDateTime(screener.appearedAt || screener.entryDate)}\n`;
        md += `- Last Scan: ${formatDateTime(screener.lastScannedAt || screener.updatedAt)}\n`;
        md += `- Entry    : ${formatPrice(screener.entryPrice)}\n`;
        md += `- Stop     : ${formatPrice(screener.stopLossPrice)}\n`;
        md += `- Target   : ${formatPrice(screener.targetPrice)}\n`;
        md += `- RR/Delta : ${screener.rewardRisk ?? "-"}R / ${formatPct(screener.deltaPct)}\n`;
        if (screener.thesis) md += `- Thesis   : ${cleanMarkdownText(screener.thesis, 260)}\n`;
        if (activeSignals.length > 1) {
            md += `- Stack    : ${activeSignals.slice(0, 5).map(s => formatSignalLabel(s.category)).join(", ")}\n`;
        }
        md += "\n";
    }

    if (plan) {
        md += "## Rencana aksi\n";
        md += `- State          : ${plan.stateLabel || plan.action || "-"}\n`;
        md += `- RR             : ${plan.rewardRisk ?? "-"}R\n`;
        md += `- Maks. rugi     : ${plan.maxLossPct ?? "-"}%\n`;
        md += `- Area entry     : ${plan.entryZone || "-"}\n`;
        if (plan.supportLabel) md += `- Support aktif  : ${plan.supportLabel} ${formatPrice(plan.supportValue)}\n`;
        if (plan.riskEmaLabel) md += `- Risk EMA       : ${plan.riskEmaLabel} ${formatPrice(plan.riskEmaValue)}\n`;
        md += `- Beli ideal     : ${formatPrice(plan.idealBuy)}\n`;
        md += `- Batas waspada  : ${formatPrice(plan.earlyExit)}\n`;
        md += `- Stop batal     : ${formatPrice(plan.hardStop ?? plan.stopLoss)}\n`;
        md += `- Target 1       : ${formatPrice(plan.target1 ?? plan.takeProfit)}\n`;
        md += `- Target 2       : ${formatPrice(plan.target2)}\n`;
        if (plan.timeStopRule) md += `- Batas waktu    : ${formatReportCopy(plan.timeStopRule, 240)}\n`;
        if (plan.positionSizing) md += `- Ukuran posisi  : ${formatReportCopy(plan.positionSizing, 240)}\n`;
        md += "\n";
    }

    md += "## Ringkasan keputusan\n";
    md += `${formatReportCopy(analysis.suggestion, 500)}\n\n`;

    if (plan?.reason) {
        md += "## Kenapa verdict ini muncul\n";
        md += `${formatReportCopy(plan.reason, 360)}\n\n`;
    }

    if (plan?.timing) {
        md += "## Aksi berikutnya\n";
        md += `${formatReportCopy(plan.timing, 360)}\n\n`;
    }

    if (analysis.squeezeInsight) {
        md += "## Insight kompresi\n";
        md += `${formatReportCopy(analysis.squeezeInsight, 320)}\n\n`;
    }

    md += "## QUALITY_METRICS\n";
    md += `- Setup Quality : ${analysis.score?.setup ?? "-"}%\n`;
    md += `- Vol Conviction: ${analysis.score?.volume ?? "-"}%\n\n`;

    md += "## FLOW_METRICS\n";
    const details = analysis.details || {};
    ["mfi", "obv", "vwap", "rsi", "emaFast", "emaSwing", "emaBounce", "emaSupport", "cooldown", "squeeze", "flux", "execution", "rewardRisk", "maxLoss", "atrp"].forEach(key => {
        if (details[key] !== undefined) md += `- ${key.padEnd(10)}: ${details[key]}\n`;
    });
    md += "```";
    return md;
}

function buildExecutionPlanReport(ticker, interval, techRes) {
    const analysis = techRes.unifiedAnalysis || {};
    const plan = getExecutionPlan(analysis);
    const screener = techRes.screenerContext || analysis.screenerContext;
    const raw = rawTicker(ticker);
    if (!plan) throw new Error("No execution plan available from /api/technical.");

    let md = "```md\n";
    md += `# EXECUTION_PLAN: ${raw}${interval === "15m" ? " (15m)" : ""}\n`;
    md += `Source : ${plan.screenerSynced ? "SCREENER_SYNC + /api/technical" : "/api/technical tradePlan"}\n`;
    md += `Verdict: ${analysis.verdict || "-"}\n`;
    md += `State  : ${plan.stateLabel || plan.action || "-"}\n`;
    if (screener) md += `Signal : ${formatSignalLabel(screener.category)} / ${screener.vector || "-"}\n`;
    md += "\n";
    md += `ENTRY_ZONE : ${plan.entryZone || "-"}\n`;
    if (plan.supportLabel) md += `SUPPORT    : ${plan.supportLabel} ${formatPrice(plan.supportValue)}\n`;
    if (plan.riskEmaLabel) md += `RISK_EMA   : ${plan.riskEmaLabel} ${formatPrice(plan.riskEmaValue)}\n`;
    md += `IDEAL_BUY  : ${formatPrice(plan.idealBuy)}\n`;
    md += `EARLY_EXIT : ${formatPrice(plan.earlyExit)}\n`;
    md += `HARD_STOP  : ${formatPrice(plan.hardStop ?? plan.stopLoss)}\n`;
    md += `TARGET_1   : ${formatPrice(plan.target1 ?? plan.takeProfit)}\n`;
    md += `TARGET_2   : ${formatPrice(plan.target2)}\n`;
    md += `RR / RISK  : ${plan.rewardRisk ?? "-"}R / ${plan.maxLossPct ?? "-"}%\n\n`;
    if (plan.timeStopRule) md += `TIME_STOP  : ${cleanMarkdownText(plan.timeStopRule, 240)}\n`;
    if (plan.positionSizing) md += `SIZE_RULE  : ${cleanMarkdownText(plan.positionSizing, 240)}\n`;
    if (plan.reason) md += `REASON     : ${cleanMarkdownText(plan.reason, 300)}\n`;
    if (plan.timing) md += `NEXT       : ${cleanMarkdownText(plan.timing, 300)}\n`;
    md += "```";
    return md;
}

async function captureChart(ticker, interval) {
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setViewportSize({ width: 1200, height: 1600 });
        const url = analysisUrl(ticker, interval);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        await page.evaluate(() => {
            const elementsToHide = [
                '.command-center',
                '.legend-panel',
                '.search-grid > div:last-child',
                'nav',
                'footer'
            ];
            elementsToHide.forEach(selector => {
                const el = document.querySelector(selector);
                if (el) el.style.display = 'none';
            });

            const container = document.querySelector('.charts-column');
            if (container) {
                container.style.padding = '20px';
                container.style.background = '#0a0a0a';
            }

            const mainChart = document.querySelector('.chart-wrapper.main-viz');
            if (mainChart) mainChart.scrollIntoView();
        });

        await page.waitForSelector('.chart-wrapper.main-viz', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(3500);
        return await page.locator('.chart-wrapper.main-viz').screenshot({ type: 'png' });
    } finally {
        await browser.close();
    }
}

function parseCallback(data, prefix) {
    const payload = String(data || "").replace(prefix, "");
    const parts = payload.split("_");
    return {
        ticker: parts[0],
        interval: parts[1] || "1d"
    };
}

const SUPPORTED_INTERVALS = new Set(["15m", "1h", "4h", "1d"]);

function normalizeIntervalInput(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "scalp") return "15m";
    if (SUPPORTED_INTERVALS.has(normalized)) return normalized;
    return null;
}

function parseTickerRequests(text) {
    const tokens = String(text || "")
        .trim()
        .split(/[\s,;/]+/)
        .map(item => item.trim())
        .filter(item => item && !["OR", "AND", "ATAU", "DAN"].includes(item.toUpperCase()));

    const requests = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const intervalToken = normalizeIntervalInput(token);
        if (intervalToken) {
            if (requests.length > 0) requests[requests.length - 1].interval = intervalToken;
            continue;
        }

        const nextInterval = normalizeIntervalInput(tokens[index + 1]);
        requests.push({
            ticker: token,
            interval: nextInterval || "1d"
        });
        if (nextInterval) index += 1;
        if (requests.length >= 5) break;
    }

    return requests;
}

const NON_TICKER_WORDS = new Set([
    "APA", "APAKAH", "BAGAIMANA", "BAGUS", "BANTU", "BELI", "BISA", "BUAT", "BUY", "CEK", "COBA", "DAN", "DI", "HARI", "INI", "JIKA", "KALAU", "KAMU", "KIRA", "MASIH", "MENURUT", "MOHON", "SAHAM", "SAYA", "SELL", "STOP", "TARGET", "TOLONG", "UNTUK", "ATAU", "YANG", "DARI", "DENGAN", "ENTRY", "EXIT", "HOLD", "CUAN", "RISK", "RISIKO", "SCALP", "DAYTRADE"
]);

function extractTickerCandidates(text) {
    return Array.from(new Set(String(text || "")
        .toUpperCase()
        .replace(/[^A-Z0-9.\-^\s]/g, " ")
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token && !SUPPORTED_INTERVALS.has(token.toLowerCase()))
        .filter(token => !NON_TICKER_WORDS.has(token))
        .filter(token => {
            const raw = rawTicker(token);
            return raw.length >= 3 && raw.length <= 7 && /^[A-Z0-9-]{3,7}$/.test(raw);
        }))).slice(0, 5);
}

async function resolveMentionedStocks(text) {
    const candidates = extractTickerCandidates(text);
    const resolved = [];
    for (const candidate of candidates) {
        const stock = await findStockByTicker(candidate).catch(() => null);
        if (stock) {
            resolved.push({ ticker: normalizeTickerInput(candidate), raw: rawTicker(candidate), stock });
        }
        if (resolved.length >= 3) break;
    }
    return resolved;
}

function isDirectTickerText(text, matchedStocks) {
    if (matchedStocks.length === 0) return false;
    const tokens = String(text || "")
        .trim()
        .split(/[\s,;/]+/)
        .filter(Boolean);
    if (tokens.length === 0 || tokens.length > 10) return false;
    return tokens.every(token => {
        if (["OR", "AND", "ATAU", "DAN"].includes(token.toUpperCase())) return true;
        if (normalizeIntervalInput(token)) return true;
        const raw = rawTicker(token);
        return matchedStocks.some(item => item.raw === raw);
    });
}

function compactTechnicalContext(ticker, stock, quote, techRes) {
    const data = Array.isArray(techRes?.data) ? techRes.data : [];
    const last = data[data.length - 1] || {};
    const analysis = techRes?.unifiedAnalysis || {};
    const plan = getExecutionPlan(analysis) || {};
    return {
        ticker: rawTicker(ticker),
        name: stock?.name || null,
        sector: stock?.sector || null,
        source: "/api/technical + YahooFinance.quote",
        quote: {
            price: quote?.regularMarketPrice ?? last.close ?? null,
            changePercent: quote?.regularMarketChangePercent ?? null,
            marketTime: quote?.regularMarketTime ?? null,
        },
        indicators: {
            close: last.close ?? null,
            ema9: last.ema9 ?? null,
            ema13: last.ema13 ?? null,
            ema20: last.ema20 ?? null,
            ema60: last.ema60 ?? null,
            sma50: last.sma50 ?? null,
            rsi: last.rsi ?? null,
            mfi: last.mfi ?? null,
            vwap: last.vwap ?? null,
            atrp: last.atrp14 ?? null,
            macdHistogram: last.macd?.histogram ?? null,
            volume: last.volume ?? null,
        },
        pivots: techRes?.pivots || null,
        verdict: analysis.verdict || null,
        riskLevel: analysis.riskLevel || null,
        suggestion: analysis.suggestion || null,
        squeezeInsight: analysis.squeezeInsight || null,
        technicalFusionInsight: analysis.technicalFusionInsight || null,
        score: analysis.score || null,
        details: analysis.details || null,
        plan: {
            action: plan.action || null,
            state: plan.stateLabel || plan.state || null,
            bias: plan.bias || null,
            entryZone: plan.entryZone || null,
            idealBuy: plan.idealBuy ?? null,
            earlyExit: plan.earlyExit ?? null,
            hardStop: plan.hardStop ?? plan.stopLoss ?? null,
            target1: plan.target1 ?? plan.takeProfit ?? null,
            target2: plan.target2 ?? null,
            rewardRisk: plan.rewardRisk ?? null,
            maxLossPct: plan.maxLossPct ?? null,
            supportLabel: plan.supportLabel || null,
            supportValue: plan.supportValue ?? null,
            riskEmaLabel: plan.riskEmaLabel || null,
            riskEmaValue: plan.riskEmaValue ?? null,
            reason: plan.reason || null,
            timing: plan.timing || null,
            invalidation: plan.invalidation || null,
            noTradeReasons: plan.noTradeReasons || [],
        },
        screenerContext: analysis.screenerContext || techRes?.screenerContext || null,
        activeScreenerSignals: analysis.activeScreenerSignals || techRes?.activeScreenerSignals || [],
    };
}

async function buildAiMarketContext(text) {
    const mentionedStocks = await resolveMentionedStocks(text);
    const stockContexts = await Promise.all(mentionedStocks.map(async item => {
        const [quote, techRes] = await Promise.all([
            yahooFinance.quote(item.ticker).catch(() => null),
            fetchTechnical(item.ticker, "1d")
        ]);
        return compactTechnicalContext(item.ticker, item.stock, quote, techRes);
    }));
    const [screenerSummary, moversSummary] = await Promise.all([
        mentionedStocks.length === 0 ? fetchScreenerSummary() : Promise.resolve([]),
        fetchMoversSummary(),
    ]);

    return {
        generatedAt: new Date().toISOString(),
        appBaseUrl: APP_BASE_URL,
        userQuestion: text,
        mentionedTickers: mentionedStocks.map(item => item.raw),
        stocks: stockContexts,
        marketSnapshot: {
            movers: moversSummary,
            activeScreenerSignals: screenerSummary,
        },
        availableWebFeatures: [
            "CONVICTION_REPORT dari /api/technical",
            "EMA9/EMA13/EMA20 dynamic support, EMA risk, reward/risk, target dan hard stop",
            "Screener aktif: EMA Bounce, Cooldown, Squeeze, Silent Flyer, ARA Hunter",
            "Top movers IDX dari /api/market/movers",
            "Chart interactive di /search dan guide di /guide"
        ],
    };
}

function safeJson(value, maxLength = 14000) {
    const json = JSON.stringify(value, null, 2);
    if (json.length <= maxLength) return json;
    return `${json.slice(0, maxLength)}\n...TRUNCATED_CONTEXT...`;
}

async function callNvidiaChat(messages) {
    if (!NVIDIA_API_KEY) {
        throw new Error("NVIDIA_API_KEY is not configured");
    }
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${NVIDIA_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: NVIDIA_MODEL,
            messages,
            temperature: 0.35,
            top_p: 0.8,
            max_tokens: 1200,
            stream: false,
        }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(json.error?.message || `NVIDIA AI HTTP ${res.status}`);
    }
    return json.choices?.[0]?.message?.content || "Maaf, AI tidak mengembalikan jawaban.";
}

function buildAiSystemPrompt() {
    return [
        "Kamu adalah asisten Telegram untuk Ultimate Screener, aplikasi analisis saham IDX.",
        "Jawab dalam bahasa Indonesia kasual, ringkas, dan praktis.",
        "Gunakan HANYA data yang diberikan di MARKET_CONTEXT. Jangan mengarang harga, target, entry, sinyal, berita, atau data fundamental.",
        "Kalau data tidak ada atau tidak cukup, bilang jelas bahwa datanya belum tersedia dan arahkan user memakai command/web feature yang relevan.",
        "Fokus pada saham, trading plan, risk management, indikator, screener, dan fitur web Ultimate Screener.",
        "Bukan penasihat keuangan. Selalu tekankan validasi ulang dan risiko.",
        "Jika ada ticker di konteks, sebut timeframe 1D/EOD dan sumber /api/technical + Yahoo.",
        "Kalau plan menunjukkan WAIT/CHASE/SELL, jangan memaksakan BUY.",
        "Kalau user minta rekomendasi, jawab dengan struktur: Kesimpulan, Data penting, Plan/Risk, Yang perlu ditunggu.",
        "Jangan tampilkan reasoning internal. Jangan menyebut bahwa kamu melihat prompt/context JSON."
    ].join("\n");
}

function trimTelegramText(text, maxLength = 3800) {
    const clean = String(text || "-").replace(/```/g, "'''").trim();
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, maxLength - 80)}\n\n[Jawaban dipotong karena batas Telegram. Minta detail ticker tertentu kalau perlu.]`;
}

async function answerWithNvidiaAi(chatId, text) {
    const sent = await bot.sendMessage(chatId, "Sedang cek konteks web + data market dulu...");
    try {
        const context = await buildAiMarketContext(text);
        const answer = await callNvidiaChat([
            { role: "system", content: buildAiSystemPrompt() },
            { role: "user", content: `USER_QUESTION:\n${text}\n\nMARKET_CONTEXT:\n${safeJson(context)}` }
        ]);
        await bot.sendMessage(chatId, trimTelegramText(answer), { disable_web_page_preview: true });
    } catch (error) {
        const missingKey = String(error.message || "").includes("NVIDIA_API_KEY");
        const message = missingKey
            ? "AI fallback belum aktif karena NVIDIA_API_KEY belum diset di .env.local atau environment server. Command ticker dan screener tetap bisa dipakai."
            : `Maaf, AI fallback gagal dipakai: ${error.message}`;
        await bot.sendMessage(chatId, message);
    } finally {
        bot.deleteMessage(chatId, sent.message_id).catch(() => {});
    }
}

async function generateFullAnalysis(chatId, tickerInput, interval = "1d") {
    const ticker = normalizeTickerInput(tickerInput);
    const raw = rawTicker(ticker);

    const timeLabel = interval === "15m" ? " (15m SCALP)" : "";
    const sentMsg = await bot.sendMessage(chatId, "```md\n# ANALYZING: " + raw + timeLabel + "\nSyncing with web CONVICTION_REPORT...\n```", { parse_mode: 'Markdown' });

    try {
        const [quote, techRes] = await Promise.all([
            yahooFinance.quote(ticker).catch(() => null),
            fetchTechnical(ticker, interval)
        ]);

        if (!techRes.success) {
            throw new Error(techRes.error || "Data not found for " + ticker);
        }

        const last = techRes.data[techRes.data.length - 1];
        const analysis = techRes.unifiedAnalysis;
        const price = quote?.regularMarketPrice || last.close;
        const change = quote?.regularMarketChangePercent ?? 0;
        const url = analysisUrl(ticker, interval);
        const md = buildConvictionReport(raw, interval, price, change, techRes);
        const caption = `🟢 *${raw}${timeLabel}:* \`${analysis.verdict}\``;
        const fullReport = `${caption}\n\n${md}`;
        const replyMarkup = buildInlineKeyboard(ticker, interval);
        const buffer = await captureChart(ticker, interval).catch(error => {
            console.warn(`[Telegram] Chart screenshot failed for ${ticker}:`, error.message);
            return null;
        });
        if (buffer) {
            console.log(`[Telegram] Chart screenshot ready for ${ticker}: ${buffer.length} bytes`);
        }

        if (buffer && fullReport.length > 1024) {
            await bot.sendPhoto(chatId, buffer, {
                caption: caption,
                parse_mode: 'Markdown'
            });
            console.log(`[Telegram] Chart photo sent for ${ticker}`);

            const opts = {
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            };
            await bot.sendMessage(chatId, fullReport, opts);
        } else if (buffer) {
            const opts = {
                caption: fullReport,
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            };
            await bot.sendPhoto(chatId, buffer, opts);
            console.log(`[Telegram] Chart photo sent for ${ticker}`);
        } else {
            await bot.sendMessage(chatId, `${fullReport}\n\nChart: ${url}`, {
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            });
        }

        bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {});

    } catch (_) {
        console.error(_);
        bot.sendMessage(chatId, "```md\n# ERROR\nAnalysis failed: " + _.message + "\n```", { parse_mode: 'Markdown' });
        bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {});
    }
}

async function initBot() {
    if (initInProgress) return;
    initInProgress = true;

    await mongoose.connect(MONGODB_URI);
    const config = await Settings.findOne({ key: "telegram_config" });

    botToken = process.env.TELEGRAM_BOT_TOKEN || config?.value?.botToken || "";
    const tokenStatus = await validateBotToken(botToken).catch(error => ({
        ok: false,
        reason: error.message
    }));

    if (!tokenStatus.ok) {
        initInProgress = false;
        scheduleBotInit(`Telegram bot token is not usable: ${tokenStatus.reason}.`);
        return;
    }

    if (bot) {
        await bot.stopPolling().catch(() => {});
        bot.removeAllListeners();
    }

    bot = new TelegramBot(botToken, { polling: true });
    initInProgress = false;
    console.log(`Telegram Bot started as @${tokenStatus.bot.username}.`);

    // Handle Callback Queries (Buttons)
    bot.on('callback_query', async (query) => {
        const data = query.data;
        const chatId = query.message.chat.id;

        if (data.startsWith('refresh_')) {
            const { ticker, interval } = parseCallback(data, 'refresh_');
            bot.answerCallbackQuery(query.id, { text: `Refreshing ${ticker}...` });
            generateFullAnalysis(chatId, ticker, interval);
        }

        if (data.startsWith('tf_')) {
            const { ticker, interval } = parseCallback(data, 'tf_');
            bot.answerCallbackQuery(query.id, { text: `Switching ${ticker} to ${interval.toUpperCase()}...` });
            generateFullAnalysis(chatId, ticker, interval);
        }

        if (data.startsWith('full_list_')) {
            const category = data.replace('full_list_', '').toUpperCase(); 
            bot.answerCallbackQuery(query.id, { text: `Fetching full list for ${category}...` });

            try {
                const res = await fetch(`${APP_BASE_URL}/api/screener`);
                const json = await res.json();
                if (!json.success) return;

                const signals = json.data.filter(s => {
                    const haystack = [s.category, s.vector, s.strategy, s.signalSource, s.metadata?.category, s.metadata?.vector]
                        .filter(Boolean)
                        .join(' ')
                        .toUpperCase();
                    return haystack.includes(category);
                });

                let text = "```md\n";
                text += `# FULL LIST: ${category}\n\n`;
                text += "| TICKER | CAT      | ENTRY | CUR   | DELTA |\n";
                text += "|--------|----------|-------|-------|-------|\n";
                signals.slice(0, 20).forEach(s => {
                    const rawTicker = s.ticker.replace(".JK", "").padEnd(6);
                    const cat = formatSignalLabel(s.category || s.metadata?.category).slice(0, 8).padEnd(8);
                    const entry = formatPrice(s.buyArea).padEnd(5);
                    const cur = formatPrice(s.currentPrice).padEnd(5);
                    const delta = formatPct(s.deltaPct, 1).padEnd(5);
                    text += `| ${rawTicker} | ${cat} | ${entry} | ${cur} | ${delta} |\n`;
                });
                if (signals.length === 0) text += "No active signals found.\n";
                text += "```";
                bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
            } catch (e) {}
        }

        if (data.startsWith('buyplan_')) {
            const { ticker, interval } = parseCallback(data, 'buyplan_');
            bot.answerCallbackQuery(query.id, { text: `Building Realistic Plan for ${ticker}...` });

            try {
                const res = await fetchTechnical(ticker, interval);
                if (!res.success) throw new Error("Failed to fetch data for plan.");
                const planMd = buildExecutionPlanReport(ticker, interval, res);
                bot.sendMessage(chatId, planMd, { parse_mode: 'Markdown' });

            } catch (e) {
                bot.sendMessage(chatId, `Failed to generate plan: ${e.message}`);
            }
        }
    });

    // Commands
    bot.onText(/\/start/, (msg) => {
        let text = "```md\n";
        text += "# WELCOME TO ULTIMATE SCREENER BOT\n\n";
        text += "Telegram output is synced with the web CONVICTION_REPORT.\n\n";
        text += "Type /help to see current commands.\n";
        text += "Or type a ticker name, for example: BUMI, FIRE, PICO.\n";
        text += "```";
        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/help/, (msg) => {
        let text = "```md\n";
        text += "# HELP: WEB_SYNC COMMANDS\n\n";
        text += "Ticker analysis uses the same /api/technical data as /search.\n\n";
        text += "BUMI          - CONVICTION_REPORT 1D\n";
        text += "BUMI 1h       - CONVICTION_REPORT 1H\n";
        text += "FIRE 15m      - CONVICTION_REPORT 15m\n";
        text += "bagaimana BUMI hari ini? - AI jawab pakai data web + Yahoo\n";
        text += "MPIX 4h       - CONVICTION_REPORT 4H\n";
        text += "FIRE          - CONVICTION_REPORT 1D\n";
        text += "PICO scalp    - CONVICTION_REPORT 15m\n";
        text += "/chart BUMI   - Same as typing BUMI\n";
        text += "/analysis BUMI scalp - 15m analysis\n";
        text += "\n";
        text += "/daytrade     - Web screener summary: EMA Bounce, Cooldown, Squeeze, Silent Flyer\n";
        text += "/scalp        - Stored 15m scalp setups, if available\n";
        text += "/arahunter    - ARA Hunter candidates from screener\n";
        text += "/top          - IDX movers enriched with web verdict/risk\n";
        text += "/help         - Show this menu\n\n";
        text += "Buttons: View Chart, Refresh, Execution Plan.\n";
        text += "```";
        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/scalp/, async (msg) => {
        try {
            bot.sendMessage(msg.chat.id, "```md\n# SCANNING 15M SCALP SETUPS...\nPlease wait...\n```", { parse_mode: 'Markdown' });

            const res = await fetch(`${APP_BASE_URL}/api/screener`);
            const json = await res.json();

            if (json.success) {
                const signals = json.data.filter(s => {
                    const haystack = [s.category, s.vector, s.strategy, s.signalSource, s.metadata?.category, s.metadata?.vector]
                        .filter(Boolean)
                        .join(' ')
                        .toUpperCase();
                    return haystack.includes('SCALP') || haystack.includes('15M');
                })
                    .sort((a,b) => b.relevanceScore - a.relevanceScore);

                let text = "```md\n# 15M SCALP SIGNALS (WEB_SYNC)\n\n";
                text += "| TICKER | CAT      | ENTRY | CUR   | DELTA |\n";
                text += "|--------|----------|-------|-------|-------|\n";

                signals.slice(0, 15).forEach(s => {
                    const rawTicker = s.ticker.replace(".JK", "").padEnd(6);
                    const cat = formatSignalLabel(s.category || s.metadata?.category).slice(0, 8).padEnd(8);
                    const entry = formatPrice(s.buyArea).padEnd(5);
                    const cur = formatPrice(s.currentPrice).padEnd(5);
                    const delta = formatPct(s.deltaPct, 1).padEnd(5);
                    text += `| ${rawTicker} | ${cat} | ${entry} | ${cur} | ${delta} |\n`;
                });
                if (signals.length === 0) {
                    text += "No active scalp signals found.\n";
                }
                text += "```";

                bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
            }
        } catch (e) {
            bot.sendMessage(msg.chat.id, "```md\n# ERROR\nFailed to fetch scalp signals.\n```", { parse_mode: 'Markdown' });
        }
    });

    bot.onText(/\/chart (.+)/, async (msg, match) => {
        const input = match[1].toLowerCase();
        if (input.endsWith(" scalp")) {
            generateFullAnalysis(msg.chat.id, input.replace(" scalp", ""), "15m");
        } else {
            generateFullAnalysis(msg.chat.id, match[1], "1d");
        }
    });

    bot.onText(/\/analysis (.+)/, async (msg, match) => {
        const input = match[1].toLowerCase();
        if (input.endsWith(" scalp")) {
            generateFullAnalysis(msg.chat.id, input.replace(" scalp", ""), "15m");
        } else {
            generateFullAnalysis(msg.chat.id, match[1], "1d");
        }
    });

    bot.onText(/\/daytrade/, async (msg) => {
        try {
            bot.sendMessage(msg.chat.id, "```md\n# SCANNING WEB_SYNC SETUPS...\nReading the same screener context used by CONVICTION_REPORT...\n```", { parse_mode: 'Markdown' });

            const res = await fetch(`${APP_BASE_URL}/api/screener`);
            const json = await res.json();

            if (json.success) {
                const signals = json.data.filter(s => {
                    const category = String(s.category || s.metadata?.category || "").toUpperCase();
                    const vector = String(s.vector || s.metadata?.vector || "").toUpperCase();
                    const source = String(s.strategy || s.signalSource || "").toUpperCase();
                    return /EMA_BOUNCE|ELITE_BOUNCE|BUY_ON_DIP|TURNAROUND|COOLDOWN|SQUEEZE|DIP|EMA20/.test(`${category} ${vector} ${source}`);
                });

                const byCategory = (matcher) => signals
                    .filter(s => matcher(`${s.category || s.metadata?.category || ""} ${s.vector || s.metadata?.vector || ""} ${s.strategy || s.signalSource || ""}`.toUpperCase()))
                    .sort((a,b) => b.relevanceScore - a.relevanceScore);

                const cooldown = byCategory(text => text.includes('COOLDOWN'));
                const emaBounce = byCategory(text => /EMA_BOUNCE|ELITE_BOUNCE|BUY_ON_DIP|TURNAROUND|DIP|EMA20/.test(text));
                const squeeze = byCategory(text => text.includes('SQUEEZE'));
                let text = "```md\n# DAYTRADE SUMMARY (WEB_SYNC)\n\n";

                const renderCategory = (title, items) => {
                    if (items.length === 0) return "";
                    let section = `## ${title}\n`;
                    items.slice(0, 4).forEach(s => {
                        const rawTicker = s.ticker.replace(".JK", "").padEnd(5);
                        const cat = formatSignalLabel(s.category || s.metadata?.category).slice(0, 12);
                        const entry = formatPrice(s.buyArea).padStart(5);
                        const cur = formatPrice(s.currentPrice).padStart(5);
                        const delta = formatPct(s.deltaPct, 1).padStart(6);
                        section += `${rawTicker} | ${cat} | E:${entry} | C:${cur} | ${delta}\n`;
                    });
                    return section + "\n";
                };

                text += renderCategory("COOLDOWN RESET", cooldown);
                text += renderCategory("EMA BOUNCE / DIP", emaBounce);
                text += renderCategory("SQUEEZE ENGINE", squeeze);

                if (signals.length === 0) {
                    text += "No high-conviction setups found.\n";
                }
                text += "```";

                const inline_keyboard = [];
                inline_keyboard.push([
                    { text: 'Cooldown', callback_data: 'full_list_COOLDOWN' },
                    { text: 'EMA Bounce', callback_data: 'full_list_EMA_BOUNCE' }
                ]);
                inline_keyboard.push([
                    { text: 'Squeeze', callback_data: 'full_list_SQUEEZE' }
                ]);

                bot.sendMessage(msg.chat.id, text, { 
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard }
                });
            }
        } catch (e) {
            bot.sendMessage(msg.chat.id, "```md\n# ERROR\nFailed to fetch daytrade signals.\n```", { parse_mode: 'Markdown' });
        }
    });

    bot.onText(/\/arahunter/, async (msg) => {
        try {
            bot.sendMessage(msg.chat.id, "```md\n# SCANNING ARA HUNTER CANDIDATES...\nPlease wait...\n```", { parse_mode: 'Markdown' });

            const res = await fetch(`${APP_BASE_URL}/api/screener`);
            const json = await res.json();

            if (json.success) {
                const signals = json.data.filter(s => {
                    const haystack = [s.category, s.vector, s.strategy, s.signalSource, s.metadata?.category, s.metadata?.vector]
                        .filter(Boolean)
                        .join(' ')
                        .toUpperCase();
                    return haystack.includes('ARAHUNTER');
                })
                    .sort((a,b) => b.relevanceScore - a.relevanceScore);

                let text = "```md\n# ARA HUNTER (WEB_SYNC)\n\n";
                text += "| TICKER | ENTRY | CUR   | DELTA | VECTOR |\n";
                text += "|--------|-------|-------|-------|--------|\n";

                signals.slice(0, 15).forEach(s => {
                    const rawTicker = s.ticker.replace(".JK", "").padEnd(6);
                    const entry = formatPrice(s.buyArea).padEnd(5);
                    const cur = formatPrice(s.currentPrice).padEnd(5);
                    const delta = formatPct(s.deltaPct, 1).padEnd(5);
                    const vector = String(s.vector || s.metadata?.vector || "-").slice(0, 6).padEnd(6);
                    text += `| ${rawTicker} | ${entry} | ${cur} | ${delta} | ${vector} |\n`;
                });
                if (signals.length === 0) {
                    text += "No ARA Hunter candidates found yet.\n";
                }
                text += "```";

                bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
            }
        } catch (e) {
            bot.sendMessage(msg.chat.id, "```md\n# ERROR\nFailed to fetch ARA Hunter signals.\n```", { parse_mode: 'Markdown' });
        }
    });

    bot.onText(/\/top/, async (msg) => {
        try {
            bot.sendMessage(msg.chat.id, "```md\n# ANALYZING TOP MOVERS...\nPlease wait...\n```", { parse_mode: 'Markdown' });

            const res = await fetch(`${APP_BASE_URL}/api/market/movers`);
            const json = await res.json();
            if (!json.success) throw new Error("Movers failed");

            const gainers = json.gainers.slice(0, 10);
            const losers = json.losers.slice(0, 10);

            const gainerTechs = await Promise.all(gainers.map(async (s) => {
                const techRes = await fetchTechnical(s.ticker, "1d").catch(() => null);
                if (!techRes || !techRes.success || !techRes.pivots) return { ...s, resis: 0, mfi: 0, push: "Low", verdict: "-", risk: "-" };
                const last = techRes.data[techRes.data.length - 1];
                let resis = techRes.pivots.r1 || 0;
                if (s.price >= resis && techRes.pivots.r2) resis = techRes.pivots.r2;
                const verdict = techRes.unifiedAnalysis?.verdict || "-";
                const risk = techRes.unifiedAnalysis?.riskLevel || "-";
                const push = techRes.unifiedAnalysis?.screenerContext?.category || ((last && last.mfi > 65 && last.macd.histogram > 0) ? "STRONG" : "NORMAL");
                return { ...s, resis, push, mfi: last ? last.mfi : 0, verdict, risk };
            }));

            const loserTechs = await Promise.all(losers.map(async (s) => {
                const techRes = await fetchTechnical(s.ticker, "15m").catch(() => null);
                if (!techRes || !techRes.success || !techRes.data) return { ...s, note: "Distribution", mfi: 0, verdict: "-", risk: "-" };
                const data = techRes.data;
                const last = data[data.length - 1];
                const prevMfi = data[data.length - 4]?.mfi || 0;
                let note = "Distribution";
                if (last && (last.mfi > 55 || last.mfi > prevMfi + 5)) note = "Hidden Acc";
                return { ...s, note, mfi: last ? last.mfi : 0, verdict: techRes.unifiedAnalysis?.verdict || "-", risk: techRes.unifiedAnalysis?.riskLevel || "-" };
            }));

            let text = "```md\n# IDX TOP GAINERS (WEB_VERDICT)\n| TICKER | CHG% | RISK | SIGNAL/BIAS |\n|--------|------|------|-------------|\n";
            gainerTechs.forEach(s => {
                const bias = String(s.push || s.verdict || "-").replace(/_/g, " ").slice(0, 11).padEnd(11);
                text += `| ${s.ticker.padEnd(6)} | ${(s.changePercent || 0).toFixed(1).padEnd(4)}% | ${String(s.risk || "-").slice(0, 4).padEnd(4)} | ${bias} |\n`;
            });
            text += "\n# IDX TOP LOSERS (15M CHECK)\n| TICKER | CHG% | RISK | 15M REMARK   |\n|--------|------|------|--------------|\n";
            loserTechs.forEach(s => {
                text += `| ${s.ticker.padEnd(6)} | ${(s.changePercent || 0).toFixed(1).padEnd(4)}% | ${String(s.risk || "-").slice(0, 4).padEnd(4)} | ${s.note.padEnd(12)} |\n`;
            });
            text += "```";
            bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
        } catch (_) {
            bot.sendMessage(msg.chat.id, "```md\n# ERROR\nFailed to fetch movers.\n```", { parse_mode: 'Markdown' });
        }
    });

    // Handle direct ticker input
    bot.on('message', async (msg) => {
        const text = msg.text;
        if (!text || text.startsWith('/')) return;

        const matchedStocks = await resolveMentionedStocks(text);
        const requests = parseTickerRequests(text);

        if (isDirectTickerText(text, matchedStocks)) {
            for (const { ticker: tickerInput, interval } of requests) {
                const dbSearchTicker = normalizeTickerInput(tickerInput);
                const raw = rawTicker(dbSearchTicker);
                if (!matchedStocks.some(item => item.raw === raw)) continue;

                await generateFullAnalysis(msg.chat.id, dbSearchTicker, interval);
            }
            return;
        }

        await answerWithNvidiaAi(msg.chat.id, text);
    });

    bot.on('polling_error', (error) => {
        console.error("Polling error:", pollingErrorMessage(error));
        const statusCode = error.response?.statusCode || error.response?.body?.error_code;
        if (statusCode === 401) {
            bot.stopPolling().catch(() => {});
            scheduleBotInit("Telegram rejected the current bot token.");
        }
    });
}

initBot();
