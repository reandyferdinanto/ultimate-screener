const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const { chromium } = require('playwright');
const sharp = require('sharp');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

// Schemas
const settingsSchema = new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed });
const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

const indonesiaStockSchema = new mongoose.Schema({
    ticker: String, name: String, active: Boolean, sector: String, lastPrice: Number
}, { collection: "indonesiastocks" });
const IndonesiaStock = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema);

const signalPerformanceSchema = new mongoose.Schema({
    ticker: String, entryDate: Date, exitDate: Date, entryPrice: Number, exitPrice: Number, durationDays: Number, isSuccess: Boolean, gainPct: Number, signalSource: String
});
const SignalPerformance = mongoose.models.SignalPerformance || mongoose.model("SignalPerformance", signalPerformanceSchema);

let bot;
let botToken = "";

async function generateFullAnalysis(chatId, tickerInput, interval = "1d") {
    let ticker = tickerInput.toUpperCase().trim();
    if (!ticker.includes(".")) ticker += ".JK";
    const rawTicker = ticker.split('.')[0];

    const timeLabel = interval === "15m" ? " (15m SCALP)" : "";
    const sentMsg = await bot.sendMessage(chatId, "```md\n# ANALYZING: " + rawTicker + timeLabel + "\nPlease wait...\n```", { parse_mode: 'Markdown' });

    try {
        // 1. Fetch Data in Parallel
        const [quote, techRes, stockInfo] = await Promise.all([
            yahooFinance.quote(ticker).catch(() => null),
            fetch(`https://ultimate-screener.ebite.biz.id/api/technical?symbol=${ticker}&interval=${interval}`).then(res => res.json()).catch(() => ({ success: false })),
            IndonesiaStock.findOne({ ticker: rawTicker })
        ]);

        if (!quote || !techRes.success) {
            throw new Error("Data not found for " + ticker);
        }

        const last = techRes.data[techRes.data.length - 1];
        const analysis = techRes.unifiedAnalysis;
        const elliott = techRes.elliott;

        const price = quote?.regularMarketPrice || last.close;
        const change = quote?.regularMarketChangePercent ? quote.regularMarketChangePercent.toFixed(2) : "0.00";

        // 2. Generate Screenshot (Technical Chart + Elliott Predictions)
        const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setViewportSize({ width: 1200, height: 1600 });
        const url = `https://ultimate-screener.ebite.biz.id/search?symbol=${ticker}&interval=${interval}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // Enable indicators via evaluating client-side buttons
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const toClick = ["SQZ_DELUXE", "SUPERTREND", "BB", "MFI", "VWAP", "OBV", "CMF", "EMA10", "BOUNCE_MARKER"];
            buttons.forEach(btn => {
                if (toClick.some(txt => btn.innerText.includes(txt))) {
                    btn.click();
                }
            });
        });
        
        await page.waitForTimeout(6000); // Wait for all charts to render

        // HIDE UNNECESSARY UI ELEMENTS FOR CLEAN CHART
        await page.evaluate(() => {
            const elementsToHide = [
                '.command-center',
                '.legend-panel',
                '.search-grid > div:last-child',
                'nav',
                'footer'
            ];            elementsToHide.forEach(selector => {
                const el = document.querySelector(selector);
                if (el) el.style.display = 'none';
            });

            const container = document.querySelector('.charts-column');
            if (container) {
                container.style.padding = '20px';
                container.style.background = '#0a0a0a';
            }

            // Focus on the main chart area
            const mainChart = document.querySelector('.chart-wrapper');
            if (mainChart) {
                mainChart.scrollIntoView();
            }
            });

            const buffer = await page.locator('.charts-column').screenshot({
            type: 'png'
            });
        await browser.close();

        // 3. Compose MD Analysis (Refined Conviction Report)
        let md = "```md\n";
        md += `# CONVICTION_REPORT: ${rawTicker}${timeLabel}\n`;
        md += `Price   : ${price} (${change}%)\n`;
        md += `Verdict : ${analysis.verdict}\n`;
        md += `Risk    : ${analysis.riskLevel}\n\n`;

        md += `## SCORE_METRICS\n`;
        md += `- Setup Quality : ${analysis.score.setup}%\n`;
        md += `- Vol Conviction: ${analysis.score.volume}%\n\n`;

        md += `## EXTENSION_WATCH\n`;
        md += `- Peak Status   : ${analysis.details.peakStatus.replace('_', ' ')}\n`;
        md += `- Vol Climax    : ${analysis.details.volClimax ? 'YES (High Risk)' : 'NO'}\n`;
        md += `- MFI Extreme   : ${analysis.details.mfiExtreme ? 'YES (>85)' : 'NO'}\n\n`;

        if (analysis.squeezeInsight) {
            md += `## VOLATILITY_ENGINE\n`;
            md += `- Squeeze Life : ${analysis.squeezeDuration} Bars\n`;
            md += `- Insight      : ${analysis.squeezeInsight}\n\n`;
        }

        if (elliott) {
            md += `## ELLIOTT_WAVE_PROJECT\n`;
            md += `- Trend       : ${elliott.trend}\n`;
            if (elliott.trend === 'BULLISH' && elliott.w5Target) {
                md += `- Reachability: ${elliott.w5Target.reachability}\n`;
                md += `- Target W5   : ${elliott.w5Target.current.toFixed(0)} (Current)\n`;
                if (elliott.w5Target.aggressive > elliott.w5Target.current) {
                    md += `- Stretch Tgt : ${elliott.w5Target.aggressive.toFixed(0)} (0.618 Ext)\n`;
                }
            }
            md += `- Support 61.8: ${elliott.retracement.h618?.toFixed(0)}\n`;
            md += `- Interpretation: ${elliott.interpretation}\n\n`;
        }

        md += `## FLOW_METRICS\n`;
        md += `- Flux Status   : ${analysis.details.flux}\n`;
        md += `- MFI Momentum  : ${analysis.details.mfi}\n`;
        md += `- OBV Trend     : ${analysis.details.obv}\n`;
        md += `- VWAP Position : ${analysis.details.vwap}\n`;
        md += `- KDJ J-Line    : ${analysis.details.kdj}\n`;
        md += `- Squeeze Status: ${analysis.details.squeeze}\n\n`;

        md += `## STRATEGIC_CONCLUSION\n`;
        md += `${analysis.suggestion}\n`;
        md += "```";

        const caption = `🟢 *${rawTicker}${timeLabel}:* \`${analysis.verdict}\``;
        const fullReport = `${caption}\n\n${md}`;

        if (fullReport.length > 1024) {
            // Send photo with short caption
            await bot.sendPhoto(chatId, buffer, {
                caption: caption,
                parse_mode: 'Markdown'
            });

            // Send full report as follow-up message
            const opts = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📊 View Interactive Chart', url: url },
                            { text: '🔄 Refresh', callback_data: `refresh_${rawTicker}` }
                        ],
                        [
                            { text: '💸 Get Buy Plan', callback_data: `buyplan_${rawTicker}` }
                        ]
                    ]
                }
            };
            await bot.sendMessage(chatId, fullReport, opts);
        } else {
            // Send together if within limits
            const opts = {
                caption: fullReport,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📊 View Interactive Chart', url: url },
                            { text: '🔄 Refresh', callback_data: `refresh_${rawTicker}` }
                        ],
                        [
                            { text: '💸 Get Buy Plan', callback_data: `buyplan_${rawTicker}` }
                        ]
                    ]
                }
            };
            await bot.sendPhoto(chatId, buffer, opts);
        }

        bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {});

    } catch (_) {
        console.error(_);
        bot.sendMessage(chatId, "```md\n# ERROR\nAnalysis failed: " + _.message + "\n```", { parse_mode: 'Markdown' });
        bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {});
    }
}

async function initBot() {
    await mongoose.connect(MONGODB_URI);
    const config = await Settings.findOne({ key: "telegram_config" });

    if (!config || !config.value.botToken) {
        console.log("No bot token found in settings. Waiting...");
        setTimeout(initBot, 30000);
        return;
    }

    botToken = config.value.botToken;
    bot = new TelegramBot(botToken, { polling: true });
    console.log("Telegram Bot started.");

    // Handle Callback Queries (Buttons)
    bot.on('callback_query', async (query) => {
        const data = query.data;
        const chatId = query.message.chat.id;

        if (data.startsWith('refresh_')) {
            const ticker = data.split('_')[1];
            bot.answerCallbackQuery(query.id, { text: `Refreshing ${ticker}...` });
            generateFullAnalysis(chatId, ticker);
        }

        if (data.startsWith('full_list_')) {
            const category = data.split('_')[2]; 
            bot.answerCallbackQuery(query.id, { text: `Fetching full list for ${category}...` });

            try {
                const res = await fetch(`https://ultimate-screener.ebite.biz.id/api/screener`);
                const json = await res.json();
                if (!json.success) return;

                const signals = json.data.filter(s => s.strategy && s.strategy.toUpperCase().includes(category));

                let text = "```md\n";
                text += `# FULL LIST: ${category}\n\n`;
                text += "| TICKER | SCORE | PRICE | SL    |\n";
                text += "|--------|-------|-------|-------|\n";
                signals.slice(0, 20).forEach(s => {
                    const rawTicker = s.ticker.replace(".JK", "").padEnd(6);
                    const score = (s.relevanceScore || 0).toString().padEnd(5);
                    const price = (s.buyArea || 0).toString().padEnd(5);
                    const sl = (s.sl || 0).toString().padEnd(5);
                    text += `| ${rawTicker} | ${score} | ${price} | ${sl} |\n`;
                });
                text += "```";
                bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
            } catch (e) {}
        }

        if (data.startsWith('buyplan_')) {
            const ticker = data.split('_')[1];
            bot.answerCallbackQuery(query.id, { text: `Building Realistic Plan for ${ticker}...` });

            try {
                const res = await fetch(`https://ultimate-screener.ebite.biz.id/api/technical?symbol=${ticker}.JK`).then(r => r.json());
                if (!res.success) throw new Error("Failed to fetch data for plan.");

                const last = res.data[res.data.length - 1];
                const price = last.close;
                const ema20 = last.ema20;

                const sl = Math.floor(ema20 * 0.97); 
                const riskPerShare = price - sl;
                if (riskPerShare <= 0) throw new Error("Price is below Stop Loss. Invalid plan.");

                const recentHigh = Math.max(...res.data.slice(-10).map(q => q.high));
                let tp1 = Math.min(res.pivots.r1, recentHigh);

                const riskPct = ((riskPerShare / price) * 100);
                const rewardPct = (((tp1 - price) / price) * 100);
                let rrRatio = rewardPct / riskPct;

                if (riskPct > 10) {
                    let rejectionMsg = "```md\n# NO BUY PLAN AVAILABLE\n\n";
                    rejectionMsg += `Reason: Risiko terlalu tinggi (${riskPct.toFixed(1)}%)\n`;
                    rejectionMsg += `Sangat jauh dari EMA20. Tunggu pullback.\n`;
                    rejectionMsg += "```";
                    bot.sendMessage(chatId, rejectionMsg, { parse_mode: 'Markdown' });
                    return;
                }

                if (rrRatio < 1.2) {
                    tp1 = res.pivots.r1 > price ? res.pivots.r1 : res.pivots.r2;
                    const newRewardPct = (((tp1 - price) / price) * 100);
                    rrRatio = newRewardPct / riskPct;
                }

                const swingTarget = Math.max(Math.floor(price + (riskPerShare * 3.5)), res.pivots.r2);
                const swingRewardPct = (((swingTarget - price) / price) * 100);

                let planMd = "```md\n";
                planMd += `# REALISTIC BUY PLAN: ${ticker}\n`;
                planMd += `Strategy: High-Conviction EMA20 Bounce\n\n`;
                planMd += `ENTRY : ${price} (Area: ${ema20.toFixed(0)} - ${price})\n`;
                planMd += `SL    : ${sl} (Risk: ${riskPct.toFixed(1)}%)\n`;
                planMd += `TP 1  : ${tp1.toFixed(0)} (Realistic Target: ${rewardPct.toFixed(1)}%)\n`;
                planMd += `TP 2  : ${swingTarget.toFixed(0)} (Swing Target: ${swingRewardPct.toFixed(1)}%)\n\n`;
                planMd += `Ratio : 1:${rrRatio.toFixed(1)} (Risk/Reward to TP1)\n`;
                planMd += `------------------------------\n`;
                planMd += `Position Sizing (Equity 10jt, Risk 2%):\n`;
                planMd += `Max Buy: ${Math.floor((10000000 * 0.02) / riskPerShare)} lembar.\n`;
                planMd += "```";

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
        text += "Your professional assistant for IDX stock analysis.\n\n";
        text += "Type /help to see available commands.\n";
        text += "Or just type a ticker name (e.g. BUMI) to start.\n";
        text += "```";
        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/help/, (msg) => {
        let text = "```md\n";
        text += "# AVAILABLE COMMANDS\n\n";
        text += "TICKER       - Get Chart (1d)\n";
        text += "TICKER scalp - Get Scalp Chart (15m)\n";
        text += "/scalp       - Show 15m Scalping Signals\n";
        text += "/top         - Show IDX top movers\n";
        text += "/daytrade    - Show high potential stocks (1d)\n";
        text += "/help        - Show this help menu\n";
        text += "```";
        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/scalp/, async (msg) => {
        try {
            bot.sendMessage(msg.chat.id, "```md\n# SCANNING 15M SCALP SETUPS...\nPlease wait...\n```", { parse_mode: 'Markdown' });

            const res = await fetch(`https://ultimate-screener.ebite.biz.id/api/screener`);
            const json = await res.json();

            if (json.success) {
                const signals = json.data.filter(s => s.strategy && s.strategy.includes('SCALP'))
                    .sort((a,b) => b.relevanceScore - a.relevanceScore);

                let text = "```md\n# 15M SCALP SIGNALS (EMA20 + SQZ)\n\n";
                text += "| TICKER | VOL | FLOW    | SQZ STATUS |\n";
                text += "|--------|-----|---------|------------|\n";

                signals.slice(0, 15).forEach(s => {
                    const rawTicker = s.ticker.replace(".JK", "").padEnd(6);
                    const vol = (s.metadata?.volConviction || s.metadata?.volScore || 0).toString().padEnd(3);
                    const flow = (s.metadata?.fluxStatus || "N/A").split(' ')[0].padEnd(7);
                    const sqz = (s.metadata?.squeezeStatus || "N/A").replace(" COMPRESSION", "").padEnd(10);
                    text += `| ${rawTicker} | ${vol}% | ${flow} | ${sqz} |\n`;
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
            bot.sendMessage(msg.chat.id, "```md\n# SCANNING EMA BOUNCE CATEGORIES...\nSynchronizing with Web Analysis Engine...\n```", { parse_mode: 'Markdown' });

            const res = await fetch(`https://ultimate-screener.ebite.biz.id/api/screener`);
            const json = await res.json();

            if (json.success) {
                const signals = json.data.filter(s => s.strategy && (s.strategy.startsWith('CONVICTION:') || s.strategy.includes('ACCUMULATION')));

                const elite = signals.filter(s => s.strategy.includes('ELITE')).sort((a,b) => b.relevanceScore - a.relevanceScore);
                const explosion = signals.filter(s => s.strategy.includes('EXPLOSION')).sort((a,b) => b.relevanceScore - a.relevanceScore);
                const dip = signals.filter(s => s.strategy.includes('DIP')).sort((a,b) => b.relevanceScore - a.relevanceScore);
                const silent = signals.filter(s => s.strategy.includes('SILENT') || s.strategy.includes('ACCUMULATION')).sort((a,b) => b.relevanceScore - a.relevanceScore);
                const turnaround = signals.filter(s => s.strategy.includes('TURNAROUND')).sort((a,b) => b.relevanceScore - a.relevanceScore);

                let text = "```md\n# EMA BOUNCE SUMMARY (WEB_SYNC)\n\n";

                const renderCategory = (title, items) => {
                    if (items.length === 0) return "";
                    let section = `## ${title}\n`;
                    items.slice(0, 4).forEach(s => {
                        const rawTicker = s.ticker.replace(".JK", "").padEnd(5);
                        const score = (s.relevanceScore || 0).toString().padEnd(3);
                        const flux = (s.metadata?.fluxStatus || "N/A").split(' ')[0];
                        const vol = (s.metadata?.volConviction || s.metadata?.volScore || 0);
                        section += `${rawTicker} | Vol:${vol}% | ${flux} | Sqz:${s.metadata?.squeezeStatus || 'N/A'}\n`;
                    });
                    return section + "\n";
                };

                text += renderCategory("ELITE BOUNCE", elite);
                text += renderCategory("VOLATILITY EXPLOSION", explosion);
                text += renderCategory("BUY ON DIP", dip);
                text += renderCategory("SILENT ACCUMULATION", silent);
                text += renderCategory("TURNAROUND CANDIDATES", turnaround);

                if (signals.length === 0) {
                    text += "No high-conviction setups found.\n";
                }
                text += "```";

                const inline_keyboard = [];
                inline_keyboard.push([
                    { text: '💎 Elite', callback_data: 'full_list_ELITE' },
                    { text: '💥 Explosion', callback_data: 'full_list_EXPLOSION' }
                ]);
                inline_keyboard.push([
                    { text: '📥 Dip', callback_data: 'full_list_DIP' },
                    { text: '🤫 Silent Acc', callback_data: 'full_list_SILENT' }
                ]);
                inline_keyboard.push([
                    { text: '🔄 Turnaround', callback_data: 'full_list_TURNAROUND' }
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

            const res = await fetch(`https://ultimate-screener.ebite.biz.id/api/screener`);
            const json = await res.json();

            if (json.success) {
                const signals = json.data.filter(s => s.strategy && s.strategy.includes('ARAHunter'))
                    .sort((a,b) => b.relevanceScore - a.relevanceScore);

                let text = "```md\n# ARA HUNTER: SQUEEZE RELEASE SIGNALS\n\n";
                text += "| TICKER | CHG%  | VOL  | MOM status |\n";
                text += "|--------|-------|------|------------|\n";

                signals.slice(0, 15).forEach(s => {
                    const rawTicker = s.ticker.replace(".JK", "").padEnd(6);
                    const chg = (s.metadata?.change || 0).toFixed(1).toString().padEnd(5);
                    const vol = (s.metadata?.volRatio || 0).toFixed(1).toString().padEnd(4);
                    const mom = (s.metadata?.momentum || 0).toFixed(0).toString().padEnd(10);
                    text += `| ${rawTicker} | ${chg}% | ${vol}x | ${mom} |\n`;
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

            const res = await fetch(`https://ultimate-screener.ebite.biz.id/api/market/movers`);
            const json = await res.json();
            if (!json.success) throw new Error("Movers failed");

            const gainers = json.gainers.slice(0, 10);
            const losers = json.losers.slice(0, 10);

            const gainerTechs = await Promise.all(gainers.map(async (s) => {
                const techRes = await fetch(`https://ultimate-screener.ebite.biz.id/api/technical?symbol=${s.ticker}.JK`).then(r => r.json()).catch(() => null);
                if (!techRes || !techRes.success || !techRes.pivots) return { ...s, resis: 0, mfi: 0, push: "Low" };
                const last = techRes.data[techRes.data.length - 1];
                let resis = techRes.pivots.r1 || 0;
                if (s.price >= resis && techRes.pivots.r2) resis = techRes.pivots.r2;
                const push = (last && last.mfi > 65 && last.macd.histogram > 0) ? "STRONG" : "NORMAL";
                return { ...s, resis, push, mfi: last ? last.mfi : 0 };
            }));

            const loserTechs = await Promise.all(losers.map(async (s) => {
                const techRes = await fetch(`https://ultimate-screener.ebite.biz.id/api/technical?symbol=${s.ticker}.JK&interval=15m`).then(r => r.json()).catch(() => null);
                if (!techRes || !techRes.success || !techRes.data) return { ...s, note: "Distribution", mfi: 0 };
                const data = techRes.data;
                const last = data[data.length - 1];
                const prevMfi = data[data.length - 4]?.mfi || 0;
                let note = "Distribution";
                if (last && (last.mfi > 55 || last.mfi > prevMfi + 5)) note = "Hidden Acc";
                return { ...s, note, mfi: last ? last.mfi : 0 };
            }));

            let text = "```md\n# IDX TOP GAINERS\n| TICKER | PRICE | CHG% | RESIS | PUSH |\n|--------|-------|------|-------|------|\n";
            gainerTechs.forEach(s => {
                text += `| ${s.ticker.padEnd(6)} | ${s.price.toString().padEnd(5)} | ${(s.changePercent || 0).toFixed(1).padEnd(4)}% | ${(!s.resis ? "-" : s.resis.toFixed(0)).padEnd(5)} | ${s.push.padEnd(4)} |\n`;
            });
            text += "\n# IDX TOP LOSERS\n| TICKER | PRICE | CHG% | MFI  | REMARK       |\n|--------|-------|------|------|--------------|\n";
            loserTechs.forEach(s => {
                text += `| ${s.ticker.padEnd(6)} | ${s.price.toString().padEnd(5)} | ${(s.changePercent || 0).toFixed(1).padEnd(4)}% | ${(s.mfi || 0).toFixed(0).padEnd(4)} | ${s.note.padEnd(12)} |\n`;
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

        let input = text.toUpperCase().trim();
        let interval = "1d";

        if (input.endsWith(" SCALP")) {
            input = input.replace(" SCALP", "").trim();
            interval = "15m";
        }

        let dbSearchTicker = input;
        if (!dbSearchTicker.includes('.')) dbSearchTicker += ".JK";

        const rawTicker = dbSearchTicker.split('.')[0];
        if (rawTicker.length < 3 || rawTicker.length > 7) return;
        if (!/^[A-Z0-9-]{3,7}$/.test(rawTicker)) return;

        const stock = await IndonesiaStock.findOne({ ticker: dbSearchTicker });
        if (stock) {
            generateFullAnalysis(msg.chat.id, dbSearchTicker, interval);
        }
    });

    bot.on('polling_error', (error) => {
        console.error("Polling error:", error.code);
    });
}

initBot();
