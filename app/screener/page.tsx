"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Send, Settings, RefreshCw, BarChart2, Filter, ChevronDown, Check } from "lucide-react";
import Link from "next/link";
import Navigation from "@/components/Navigation";

interface SignalData {
  ticker: string;
  strategy?: string;
  signalSource?: string;
  currentPrice?: number;
  currentPriceSource?: string;
  deltaPct?: number | null;
  buyArea?: number;
  entryLow?: number;
  entryHigh?: number;
  idealBuy?: number;
  tp?: number;
  target1?: number;
  target2?: number;
  sl?: number;
  riskPct?: string | null;
  rewardRisk?: number;
  maxLossPct?: number;
  atrPct?: number | null;
  state?: string;
  stateLabel?: string;
  setupScore?: number;
  volumeScore?: number;
  daysHeld?: number;
  category?: string;
  vector?: string;
  appearedAt?: string;
  createdAt?: string;
  entryDate?: string;
  updatedAt?: string;
  lastScannedAt?: string;
  lastQuoteDate?: string;
  dataFreshness?: {
    source?: string;
    lastQuoteDate?: string;
    lastScannedAt?: string;
    quoteAgeHours?: number | null;
    isLikelyFreshDaily?: boolean;
  };
  priceHistory?: { date?: string; price: number }[];
  metadata?: Record<string, any>;
}

interface ScanMeta {
  source?: string;
  priceSource?: string;
  sortBy?: string;
  livePriceRefreshed?: number;
  livePriceFailed?: number;
  latestDataAt?: string | null;
  isLatestDataFresh?: boolean;
  latestSignalAt?: string | null;
  isLatestSignalFresh?: boolean;
  latestScannedAt?: string | null;
  isLatestScanFresh?: boolean;
  scanned?: number;
  matched?: number;
  failures?: number;
}

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatFreshness = (value?: string) => {
  if (!value) return "UNKNOWN";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "UNKNOWN";
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / 36_000) / 100);
  if (hours < 1) return "<1H AGO";
  if (hours < 24) return `${hours.toFixed(1)}H AGO`;
  return `${Math.floor(hours / 24)}D AGO`;
};

export default function ScreenerPage() {
  const [data, setData] = useState<SignalData[]>([]);
  const [view, setView] = useState<'signals' | 'entry' | 'cooldown' | 'sauce' | 'divergence' | 'sqz_div' | 'arahunter' | 'flyer'>('signals');
  const [priceRange, setPriceRange] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sqzTimeframe, setSqzTimeframe] = useState<'1d' | '4h'>('1d');
  const [vectorFilter, setVectorFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);

  const fetchData = async () => {
    if (view === 'entry') {
      setScanning(true);
      setMsg("SCANNING_LIVE_ENTRY_ZONES...");
      try {
        await loadCurrentData();
        setMsg("ENTRY_SCAN_COMPLETE");
      } catch {
        setMsg("ENTRY_SCAN_FAILED");
      } finally {
        setScanning(false);
        setTimeout(() => setMsg(""), 5000);
      }
      return;
    }

    setScanning(true);
    setMsg("INITIALIZING_CONVICTION_SCAN...");
    try {
      const scanRes = await fetch("/api/screener/scan", { method: "POST" });
      const scanJson = await scanRes.json();
      if (scanJson.success) {
        setMsg(`SCAN_COMPLETE // LATEST_YAHOO_DAILY_FETCHED @ ${formatDateTime(scanJson.scanCompletedAt)}`);
        await loadCurrentData();
      } else {
        setMsg("ERROR: " + scanJson.error);
      }
    } catch {
      setMsg("NETWORK_FAILURE");
    } finally {
      setScanning(false);
      setTimeout(() => setMsg(""), 5000);
    }
  };

  const loadCurrentData = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = view === 'entry'
        ? `/api/screener/entry-ideal?priceRange=${priceRange}&interval=1d`
        : `/api/screener?priceRange=${priceRange}&dateFilter=${dateFilter}`;
      const res = await fetch(endpoint);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setScanMeta(json.scanMeta || null);
      } else {
        setData([]);
        setScanMeta(null);
        setMsg(`LOAD_FAILED: ${json.error || 'UNKNOWN'}`);
      }
    } catch {
      console.error("Failed to load current data");
      setData([]);
      setScanMeta(null);
    } finally {
      setLoading(false);
    }
  }, [priceRange, dateFilter, view]);

  useEffect(() => {
    const savedToken = localStorage.getItem("botToken");
    const savedChat = localStorage.getItem("chatId");
    if (savedToken) setBotToken(savedToken);
    if (savedChat) setChatId(savedChat);
  }, []);

  useEffect(() => {
    loadCurrentData();
  }, [priceRange, dateFilter, view, loadCurrentData]);

  const baseSignals = data.filter(s => {
      const source = s.signalSource || s.strategy || "";
      const category = String(s.category || s.metadata?.category || "").toUpperCase();
      const vector = String(s.vector || s.metadata?.vector || "").toUpperCase();
      if (view === 'entry') return category === 'ENTRY_IDEAL' || source.includes('ENTRY_IDEAL');
      if (view === 'cooldown') return category === 'COOLDOWN' || /COOLDOWN|EXTENDED_EMA20_COOLDOWN|PULLBACK|SIDEWAYS/.test(`${source} ${vector}`.toUpperCase());
      if (view === 'sauce') return source.includes('Secret');
      if (view === 'flyer') return category === 'SILENT_FLYER' || /SILENT|FLYER|ACCUMULATION/i.test(source);
      if (view === 'divergence') return source.includes('CVD');
      if (view === 'sqz_div') {
          const sourceLower = source.toLowerCase();
          const vector = String(s.vector || s.metadata?.vector || "").toLowerCase();
          const isSqz = category === 'SQUEEZE_DIVERGENCE' || sourceLower.includes('squeeze divergence') || vector.includes('sqz_bull_div');
          const hasExplicitTf = sourceLower.includes('1d') || sourceLower.includes('4h') || vector.includes('1d') || vector.includes('4h');
          const isRightTF = sourceLower.includes(sqzTimeframe.toLowerCase()) || vector.includes(sqzTimeframe.toLowerCase()) || (!hasExplicitTf && sqzTimeframe === '1d');
          return isSqz && isRightTF;
      }
      return [
        category,
        vector,
        source.toUpperCase()
      ].some(value => /EMA_BOUNCE|ELITE_BOUNCE|BUY_ON_DIP|TURNAROUND|EXPLOSION|SQUEEZE_RELEASE|PERFECT_RETEST|RETEST|DIP|EMA20/.test(value));
  });

  const vectorOptions = Array.from(new Set(baseSignals.flatMap(s => {
    const category = String(s.category || s.metadata?.category || "").trim().toUpperCase();
    const vector = String(s.vector || s.metadata?.vector || "").trim().toUpperCase();
    return [category, vector].filter(Boolean);
  }))).sort((a, b) => a.localeCompare(b));

  const displayedSignals = vectorFilter === 'all'
    ? baseSignals
    : baseSignals.filter(s => {
      const source = String(s.signalSource || s.strategy || "").toUpperCase();
      const category = String(s.category || s.metadata?.category || "").toUpperCase();
      const vector = String(s.vector || s.metadata?.vector || "").toUpperCase();
      return [category, vector].some(value => value === vectorFilter) || source.includes(vectorFilter);
    });

  const activeAccent = view === 'entry'
    ? 'oklch(0.78 0.2 115)'
    : (view === 'cooldown' ? 'oklch(0.82 0.18 95)' : (view === 'sauce' ? 'oklch(0.85 0.25 200)' : (view === 'sqz_div' ? 'oklch(0.82 0.18 145)' : (view === 'flyer' ? 'oklch(0.75 0.2 320)' : 'var(--accent-emerald)'))));
  const activeViewLabel = view === 'entry'
    ? 'ENTRY_IDEAL_LIVE'
    : (view === 'cooldown' ? 'COOLDOWN_RESET' : (view === 'sauce' ? 'PREDICTIVE_MODELS' : (view === 'sqz_div' ? 'SQZ_MOMENTUM' : (view === 'flyer' ? 'INSTITUTIONAL_FLYER' : (view === 'divergence' ? 'CVD_DIVERGENCE' : 'TECHNICAL_BOUNCE_ENHANCED')))));
  const activeRiskBadge = view === 'entry'
    ? 'FILTER: IN_ZONE + RR>=1.5R'
    : (view === 'cooldown' ? 'PULLBACK: CONTROLLED_RESET' : (view === 'sauce' ? 'AI_ACCUMULATION' : (view === 'sqz_div' ? 'VOLATILITY_ENGINE' : (view === 'flyer' ? 'FLYER_RADAR: HIGH_INERTIA' : 'RISK_LIMIT: < 5.5%'))));

  const saveSettings = () => {
    localStorage.setItem("botToken", botToken);
    localStorage.setItem("chatId", chatId);
    setShowSettings(false);
    setMsg("CONFIG_SAVED");
    setTimeout(() => setMsg(""), 3000);
  };

  const sendToTelegram = async () => {
    if (!botToken || !chatId) {
      setMsg("CONFIG_MISSING");
      return;
    }
    setSending(true);
    try {
      const signalsToPush = displayedSignals.slice(0, 3);
      if (signalsToPush.length === 0) {
          setMsg("NO_SIGNALS_TO_PUSH");
          setSending(false);
          return;
      }

      const text = `🎯 *SECRET SAUCE ANALYTICS REPORT*\n\n` + 
        signalsToPush.map(s => {
          const meta = s.metadata || {};
          const mfi = parseFloat(String(meta.mfi)) || 0;
          const dist20 = parseFloat(String(meta.dist20)) || 0;
          const consolidation = parseFloat(String(meta.consolidationScore)) || 0;
          
          let projection = "🔄 *PATTERN FORMING*";
          if (consolidation < 4.0 && mfi > 60 && mfi < 88 && dist20 > 0 && dist20 < 5) {
              projection = "🚀 *BREAKOUT ANALYSIS:* Strong accumulation coiling near EMA20.";
          }

          return `🚀 *${s.ticker}*\n` +
            `💰 Area: ${s.buyArea} | Tgt: ${s.tp}\n` +
            `📊 MFI: ${mfi.toFixed(1)} | Dist: ${dist20.toFixed(1)}%\n` +
            `${projection}\n` +
            `🛑 SL: ${s.sl}`;
        }).join('\n\n---\n\n');

      const res = await fetch("/api/telegram", {
        method: "POST",
        body: JSON.stringify({ botToken, chatId, text }),
      });
      const json = await res.json();
      if (json.success) setMsg("Pushed to Telegram!");
      else setMsg("Push failed: " + json.error);
    } catch {
      setMsg("Connection error.");
    } finally {
      setSending(false);
      setTimeout(() => setMsg(""), 4000);
    }
  };

  return (
    <div className="screener-root min-h-screen bg-[#050505] text-silver-300 font-mono">
      
      <main className="screener-container">
        <header className="screener-header">
          <div className="header-left">
            <h1 className="main-title">ULTIMATE_SCREENER</h1>
            <div className="tabs-container custom-scrollbar">
              {[
                { id: 'signals', label: 'EMA_BOUNCE', color: 'var(--accent-emerald)' },
                { id: 'entry', label: 'ENTRY_IDEAL', color: 'oklch(0.78 0.2 115)' },
                { id: 'cooldown', label: 'COOLDOWN', color: 'oklch(0.82 0.18 95)' },
                { id: 'flyer', label: 'SILENT_FLYER', color: 'oklch(0.75 0.2 320)' },
                { id: 'divergence', label: 'CVD_DIVERGENCE', color: 'oklch(0.7 0.2 300)' },
                { id: 'sqz_div', label: 'SQZ_DIVERGENCE', color: 'oklch(0.82 0.18 145)' },
                { id: 'sauce', label: 'SECRET_SAUCE', color: 'oklch(0.85 0.25 200)' }
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => { setView(tab.id as any); setVectorFilter('all'); }} 
                  className={`tab-item ${view === tab.id ? 'active' : ''}`}
                  style={{ '--tab-accent': tab.color } as any}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="controls-group">
            <div className="filters-row">
              {view === 'sqz_div' && (
                <div className="select-wrapper">
                  <select value={sqzTimeframe} onChange={e => setSqzTimeframe(e.target.value as any)}>
                    <option value="1d">1D_FRAME</option>
                    <option value="4h">4H_FRAME</option>
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              )}
              <div className="select-wrapper">
                <select value={priceRange} onChange={e => setPriceRange(e.target.value)}>
                    <option value="all">ALL_PRICES</option>
                    <option value="under300">&lt; 300</option>
                    <option value="under500">&lt; 500</option>
                    <option value="above500">&gt; 500</option>
                </select>
                <ChevronDown size={14} className="select-icon" />
              </div>
              {view !== 'entry' && (
                <div className="select-wrapper">
                  <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                      <option value="all">ALL_TIME</option>
                      <option value="today">TODAY</option>
                      <option value="3d">3_DAYS</option>
                      <option value="7d">7_DAYS</option>
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              )}
            </div>
            
            <div className="actions-row">
              <button className="action-btn scan-btn" onClick={fetchData} disabled={loading || scanning}>
                <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
                <span>{scanning ? "SCANNING..." : (view === 'entry' ? "RUN_ENTRY_SCAN" : "RUN_SCAN")}</span>
              </button>
              <button className="action-btn icon-only" onClick={() => setShowSettings(!showSettings)}>
                <Settings size={14} />
              </button>
              <button 
                className={`action-btn icon-only ${(!botToken || !chatId || loading || scanning) ? 'disabled' : ''}`} 
                onClick={sendToTelegram} 
                disabled={sending || loading || scanning}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </header>

        {msg && <div className="status-toast">{msg}</div>}

        {showSettings && (
          <div className="settings-panel animate-slide-down">
            <div className="panel-header">COMM_SYSTEM_CONFIG</div>
            <div className="settings-grid">
              <div className="input-field">
                <label>BOT_TOKEN</label>
                <input type="password" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="Enter API Token..." />
              </div>
              <div className="input-field">
                <label>CHAT_ID</label>
                <input type="text" value={chatId} onChange={e => setChatId(e.target.value)} placeholder="Enter Target ID..." />
              </div>
              <button className="save-settings-btn" onClick={saveSettings}>
                <Check size={14} />
                <span>SAVE_CONFIG</span>
              </button>
            </div>
          </div>
        )}

        <div className="signals-viewport panel">
          <div className="viewport-header">
            <div className="header-status">
              <div className="pulse-dot" style={{ backgroundColor: activeAccent }}></div>
              <span className="view-label">
                {activeViewLabel}
              </span>
              {(loading || scanning) && <span className="refreshing-tag animate-pulse">REFRESHING_VECTORS...</span>}
            </div>
            <span className="risk-badge">
               {activeRiskBadge}
            </span>
          </div>

          <div className="scan-freshness-strip">
            <span>DATA_SOURCE: {scanMeta?.source ? (view === 'entry' ? 'LIVE_TRADEPLAN' : 'STORED_SIGNALS') : 'LOADING'}</span>
            {view !== 'entry' && scanMeta?.priceSource && <span>PRICE_SOURCE: {scanMeta.priceSource}</span>}
            {scanMeta?.sortBy && <span>SORT: LATEST_SIGNAL</span>}
            {view !== 'entry' && scanMeta?.livePriceRefreshed !== undefined && <span>LIVE_QUOTES: {scanMeta.livePriceRefreshed}</span>}
            {view !== 'entry' && Boolean(scanMeta?.livePriceFailed) && <span className="fresh-warn">QUOTE_FAILED: {scanMeta?.livePriceFailed}</span>}
            <span>LAST_SIGNAL: {formatFreshness(scanMeta?.latestSignalAt || scanMeta?.latestScannedAt || undefined)}</span>
            <span>LAST_PRICE: {formatFreshness(scanMeta?.latestDataAt || scanMeta?.latestScannedAt || undefined)}</span>
            {view !== 'entry' && <span>DB_SCAN: {formatFreshness(scanMeta?.latestScannedAt || undefined)}</span>}
            {view === 'entry' && <span>MATCHED: {scanMeta?.matched ?? 0}/{scanMeta?.scanned ?? '-'}</span>}
            {view === 'entry' && Boolean(scanMeta?.failures) && <span className="fresh-warn">FAILED_FETCH: {scanMeta?.failures}</span>}
            <span className={(scanMeta?.isLatestSignalFresh ?? scanMeta?.isLatestScanFresh) ? 'fresh-ok' : 'fresh-warn'}>
              {(scanMeta?.isLatestSignalFresh ?? scanMeta?.isLatestScanFresh) ? (view === 'entry' ? 'LIVE_SCAN_RECENT' : 'LATEST_SIGNAL_RECENT') : 'PRESS_RUN_SCAN_FOR_LATEST'}
            </span>
          </div>

          {(loading || scanning) && data.length === 0 ? (
            <div className="loading-container">
              <div className="scanner-glow"></div>
              <div className="loading-text">{scanning ? (view === 'entry' ? "SCANNING_ENTRY_WINDOWS..." : "MAPPING_MARKET_DNA...") : "ESTABLISHING_DATA_LINK..."}</div>
              <div className="loading-sub">{view === 'entry' ? "REPLAYING /api/technical TRADE PLANS" : "ANALYZING 900+ CANDIDATES"}</div>
            </div>
          ) : displayedSignals.length === 0 ? (
            <div className="empty-viewport">NO_SIGNALS_DETECTED_IN_THIS_VECTOR</div>
          ) : (
            <div className={`table-responsive custom-scrollbar ${(loading || scanning) ? 'opacity-50' : ''}`}>
              <table className="signals-table">
                <thead>
                  <tr>
                    <th style={{width: '14%'}}>TICKER</th>
                    <th style={{width: '16%'}}>
                      <div className="vector-header-filter">
                        <span>VECTOR</span>
                        <select value={vectorFilter} onChange={e => setVectorFilter(e.target.value)} className="vector-column-select">
                          <option value="all">ALL_VECTOR</option>
                          {vectorOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </th>
                    <th className="hide-tablet" style={{width: '10%'}}>APPEARED</th>
                    <th className="hide-tablet text-right" style={{width: '8%'}}>{view === 'entry' ? 'RISK/RR' : 'RISK%'}</th>
                    <th className="text-right" style={{width: '10%'}}>{view === 'entry' ? 'ENTRY_ZONE' : 'ENTRY'}</th>
                    <th className="text-right" style={{width: '12%'}}>{view === 'entry' ? 'TARGET_1' : 'PIVOT_TP'}</th>
                    <th className="hide-tablet text-right" style={{width: '10%'}}>{view === 'entry' ? 'HARD_STOP' : 'ABORT_SL'}</th>
                    <th className="text-right" style={{width: '8%'}}>DELTA</th>
                    <th className="hide-mobile text-center" style={{width: '12%'}}>PATH</th>
                    <th className="text-center" style={{width: '5%'}}>OPS</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSignals.map((row, i) => {
                    const referencePrice = row.idealBuy || row.buyArea;
                    const targetPrice = row.target1 || row.tp;
                    const hasCurrentPrice = typeof row.currentPrice === 'number' && Number.isFinite(row.currentPrice);
                    const profit = row.deltaPct ?? ((hasCurrentPrice && referencePrice) ? ((row.currentPrice! - referencePrice) / referencePrice) * 100 : null);
                    const history = row.priceHistory || [];
                    const pathData = history.length > 1 ? history : (referencePrice && hasCurrentPrice ? [{ price: referencePrice }, { price: row.currentPrice! }] : []);
                    const entryDisplay = view === 'entry' && row.entryLow && row.entryHigh
                      ? `${row.entryLow}-${row.entryHigh}`
                      : row.buyArea;
                    const riskDisplay = view === 'entry'
                      ? `${row.maxLossPct?.toFixed(1) || row.riskPct || '-'}%/${row.rewardRisk?.toFixed(2) || '-'}R`
                      : (row.riskPct ? `${row.riskPct}%` : '-');
                    
                    return (
                      <tr key={i} className="signal-row">
                        <td>
                          <div className="ticker-cell">
                            <span className="ticker-name">{row.ticker.replace('.JK', '')}</span>
                            {row.metadata?.fluxStatus && (
                              <div className="ticker-metadata">
                                <span>FLX: {row.metadata.fluxStatus}</span>
                                <span>SQZ: {row.metadata.squeezeStatus}</span>
                              </div>
                            )}
                            <div className="ticker-metadata">
                              <span>{row.category || row.metadata?.category || 'TECHNICAL'}</span>
                              <span>QUOTE: {formatFreshness(row.lastQuoteDate || row.metadata?.lastQuoteDate)}</span>
                              {row.state && <span>{row.stateLabel || row.state}</span>}
                              {row.metadata?.confidenceLevel && (
                                <span className={`confidence-badge ${row.metadata.confidenceLevel.toLowerCase()}`}>
                                  {row.metadata.confidenceLevel}
                                </span>
                              )}
                              {row.metadata?.expectedReturn && (
                                <span className="target-return">
                                  TARGET: {row.metadata.expectedReturn}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="strategy-badge" style={(() => {
                              const s = row.strategy?.toLowerCase() || '';
                              let color = 'oklch(0.7 0.2 150)'; // Default emerald
                              
                              if (s.includes('entry_ideal')) color = 'oklch(0.78 0.2 115)';
                              else if (s.includes('cooldown')) color = 'oklch(0.82 0.18 95)';
                              else if (s.includes('secret')) color = 'oklch(0.85 0.25 200)';
                              else if (s.includes('silent') || s.includes('flyer') || s.includes('accumulation')) color = 'oklch(0.75 0.2 320)';
                              else if (s.includes('elite')) color = 'oklch(0.85 0.3 180)';
                              else if (s.includes('explosion') || s.includes('volatility')) color = 'oklch(0.85 0.25 150)';
                              else if (s.includes('dip')) color = 'oklch(0.8 0.25 160)';
                              else if (s.includes('turnaround')) color = 'oklch(0.85 0.15 240)';
                              else if (s.includes('arahunter')) color = 'oklch(0.85 0.2 85)';
                              else if (s.includes('scalp')) color = 'oklch(0.75 0.2 45)';
                              else if (s.includes('retest')) color = 'oklch(0.8 0.15 220)';
                              else if (s.includes('cvd')) color = 'oklch(0.7 0.2 300)';
                              else if (s.includes('squeeze')) color = 'oklch(0.82 0.18 145)';
                              else if (s.includes('bounce')) {
                                  // Check for high confidence indicators
                                  const metadata = row.metadata || {};
                                  if (metadata.confidenceLevel === 'HIGH' || metadata.confidenceLevel === 'FAST_HIGH_PROB') {
                                      color = 'oklch(0.85 0.3 180)'; // Gold for high confidence
                                  } else if (metadata.confidenceLevel === 'MEDIUM') {
                                      color = 'oklch(0.85 0.25 200)'; // Cyan for medium
                                  } else {
                                      color = 'oklch(0.7 0.2 150)'; // Default emerald
                                  }
                              }
                              
                              return {
                                  color: color,
                                  borderColor: `oklch(from ${color} l c h / 0.3)`,
                                  backgroundColor: `oklch(from ${color} l c h / 0.1)`
                              };
                          })()}>
                            {row.strategy?.replace('CONVICTION: ', '').replace('SIGNAL: ', '').replace('SCALP: ', '') || 'BOUNCE'}
                          </span>
                          <div className="vector-subline">{row.vector || row.metadata?.vector || 'GENERAL'}</div>
                        </td>
                        <td className="hide-tablet">
                          <div className="appeared-cell">
                            <span>{formatDateTime(row.appearedAt || row.createdAt || row.entryDate)}</span>
                            <small>SCAN {formatFreshness(row.lastScannedAt || row.updatedAt || row.metadata?.lastScannedAt || row.metadata?.scanRunAt)}</small>
                          </div>
                        </td>
                        <td className="hide-tablet text-right risk-cell">{riskDisplay}</td>
                        <td className="text-right weight-700">{entryDisplay}</td>
                        <td className="text-right weight-700 text-emerald">{targetPrice ? Number(targetPrice).toFixed(Number(targetPrice) % 1 !== 0 ? 2 : 0) : '-'}</td>
                        <td className="text-right hide-tablet text-rose weight-700">{row.sl ?? '-'}</td>
                        <td className="text-right">
                          <div className="profit-cell">
                            <span className={`profit-val ${profit === null || profit >= 0 ? 'pos' : 'neg'}`}>
                              {profit === null ? '-' : `${profit >= 0 ? '+' : ''}${profit.toFixed(1)}%`}
                            </span>
                            <span className="time-val">
                              {hasCurrentPrice ? `CUR ${row.currentPrice}` : 'CUR -'}
                            </span>
                          </div>
                        </td>
                        <td className="hide-mobile">
                          <div className="sparkline-container">
                            {pathData.length > 1 && (
                              <svg viewBox="0 0 100 30" preserveAspectRatio="none">
                                <path
                                  d={(() => {
                                      const prices = pathData.map(p => p.price);
                                      const min = Math.min(...prices);
                                      const max = Math.max(...prices);
                                      const range = max - min || 1;
                                      return pathData.map((p, idx) => {
                                          const x = (idx / (pathData.length - 1)) * 100;
                                          const y = 28 - ((p.price - min) / range) * 26;
                                          return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                                      }).join(' ');
                                  })()}
                                  className={`sparkline-path ${profit === null || profit >= 0 ? 'pos' : 'neg'}`}
                                />
                              </svg>
                            )}
                          </div>
                        </td>
                        <td className="text-center">
                          <Link href={`/search?symbol=${row.ticker}`} className="analyze-link">
                              <BarChart2 size={14} />
                              <span className="hide-tablet">INTEL</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <style jsx global>{`
        :root {
            --bg-dark: #050505;
            --panel-bg: oklch(0.15 0.02 240);
            --border-tactical: oklch(0.25 0.02 240);
            --accent-emerald: oklch(0.7 0.2 150);
            --accent-cyan: oklch(0.75 0.2 200);
            --accent-rose: oklch(0.6 0.2 25);
            --text-muted: oklch(0.6 0.02 240);
            --glass-bg: oklch(0.15 0.02 240 / 0.8);
        }

        .screener-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .screener-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 32px;
            flex-wrap: wrap;
        }

        .header-left {
            flex: 1;
            min-width: 300px;
        }

        .main-title {
            font-size: 1.5rem;
            font-weight: 1000;
            color: white;
            letter-spacing: 0.15em;
            margin-bottom: 20px;
            text-shadow: 0 0 20px oklch(1 0 0 / 0.1);
        }

        .tabs-container {
            display: flex;
            gap: 4px;
            overflow-x: auto;
            padding-bottom: 8px;
            mask-image: linear-gradient(to right, black 85%, transparent 100%);
        }

        .tab-item {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-size: 0.7rem;
            font-weight: 900;
            padding: 8px 16px;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
            letter-spacing: 0.05em;
            border-bottom: 2px solid transparent;
        }

        .tab-item:hover { color: white; }
        .tab-item.active {
            color: var(--tab-accent);
            border-bottom-color: var(--tab-accent);
            background: oklch(from var(--tab-accent) l c h / 0.05);
        }

        .controls-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: flex-end;
        }

        .filters-row, .actions-row {
            display: flex;
            gap: 8px;
        }

        .select-wrapper {
            position: relative;
            background: oklch(0.12 0.01 240);
            border: 1px solid var(--border-tactical);
            border-radius: 6px;
        }

        .select-wrapper select {
            appearance: none;
            background: transparent;
            border: none;
            color: white;
            font-size: 0.7rem;
            font-weight: 800;
            padding: 6px 32px 6px 12px;
            cursor: pointer;
            width: 100%;
            font-family: inherit;
        }

        .select-icon {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            pointer-events: none;
            color: var(--text-muted);
        }

        .action-btn {
            background: oklch(0.2 0.02 240);
            border: 1px solid var(--border-tactical);
            color: white;
            font-size: 0.7rem;
            font-weight: 900;
            padding: 0 16px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .action-btn:hover:not(:disabled) {
            background: oklch(0.25 0.02 240);
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
        }

        .action-btn.icon-only { padding: 0 10px; }
        .action-btn.disabled { opacity: 0.4; cursor: not-allowed; }

        .scan-btn {
            background: oklch(0.7 0.2 150 / 0.1);
            border-color: oklch(0.7 0.2 150 / 0.3);
            color: var(--accent-emerald);
        }

        .scan-btn:hover:not(:disabled) {
            background: oklch(0.7 0.2 150 / 0.2);
            border-color: var(--accent-emerald);
        }

        .status-toast {
            background: oklch(0.7 0.2 150 / 0.1);
            border: 1px solid var(--accent-emerald);
            color: var(--accent-emerald);
            padding: 10px 16px;
            font-size: 0.75rem;
            font-weight: 800;
            border-radius: 8px;
            animation: slide-in 0.3s ease-out;
        }

        .settings-panel {
            background: var(--panel-bg);
            border: 1px solid var(--border-tactical);
            border-radius: 12px;
            padding: 20px;
        }

        .panel-header {
            font-size: 0.7rem;
            font-weight: 900;
            color: var(--text-muted);
            margin-bottom: 16px;
            letter-spacing: 0.1em;
        }

        .settings-grid {
            display: grid;
            grid-template-columns: 1fr 1fr auto;
            gap: 16px;
            align-items: flex-end;
        }

        .input-field label {
            display: block;
            font-size: 0.6rem;
            color: var(--text-muted);
            margin-bottom: 6px;
        }

        .input-field input {
            width: 100%;
            background: oklch(0.1 0 0);
            border: 1px solid var(--border-tactical);
            padding: 10px;
            color: white;
            font-family: inherit;
            font-size: 0.8rem;
            border-radius: 6px;
        }

        .save-settings-btn {
            height: 40px;
            background: var(--accent-emerald);
            color: black;
            border: none;
            padding: 0 20px;
            border-radius: 6px;
            font-weight: 900;
            font-size: 0.7rem;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }

        .signals-viewport {
            background: var(--panel-bg);
            border: 1px solid var(--border-tactical);
            border-radius: 16px;
            overflow: hidden;
        }

        .table-responsive {
            overflow-x: auto;
            overflow-y: visible;
        }

        .viewport-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-tactical);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .scan-freshness-strip {
            display: flex;
            gap: 14px;
            flex-wrap: wrap;
            padding: 10px 24px;
            border-bottom: 1px solid var(--border-tactical);
            background: oklch(0.11 0.015 240 / 0.85);
            color: var(--text-muted);
            font-size: 0.6rem;
            font-weight: 900;
            letter-spacing: 0.06em;
        }

        .fresh-ok { color: var(--accent-emerald); }
        .fresh-warn { color: oklch(0.85 0.2 70); }

        .header-status {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .pulse-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        .view-label {
            font-size: 0.8rem;
            font-weight: 1000;
            color: white;
            letter-spacing: 0.05em;
        }

        .refreshing-tag {
            font-size: 0.6rem;
            font-weight: 900;
            color: var(--accent-cyan);
            background: oklch(from var(--accent-cyan) l c h / 0.1);
            padding: 2px 8px;
            border-radius: 4px;
            letter-spacing: 0.05em;
        }

        .opacity-50 { opacity: 0.5; }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

        .risk-badge {
            font-size: 0.65rem;
            font-weight: 900;
            color: var(--accent-rose);
            background: oklch(0.6 0.2 25 / 0.1);
            padding: 4px 10px;
            border-radius: 4px;
            border: 1px solid oklch(0.6 0.2 25 / 0.2);
        }

        .loading-container {
            padding: 80px 40px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            position: relative;
        }

        .scanner-glow {
            width: 240px;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--accent-emerald), transparent);
            position: relative;
            overflow: hidden;
        }

        .scanner-glow::after {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, white, transparent);
            animation: scan 2s infinite linear;
        }

        .loading-text { font-size: 1rem; font-weight: 1000; color: var(--accent-emerald); letter-spacing: 0.1em; }
        .loading-sub { font-size: 0.7rem; color: var(--text-muted); }

        .signals-table {
            width: 100%;
            min-width: 1280px;
            border-collapse: collapse;
            font-size: 0.8rem;
            table-layout: auto;
        }

        .signals-table th {
            text-align: left;
            padding: 10px 12px;
            color: var(--text-muted);
            font-size: 0.6rem;
            font-weight: 900;
            letter-spacing: 0.1em;
            border-bottom: 1px solid var(--border-tactical);
            background: oklch(0.18 0.02 240);
        }

        .vector-header-filter {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 180px;
        }

        .vector-column-select {
            width: 100%;
            min-width: 170px;
            appearance: none;
            background: oklch(0.11 0.012 240);
            border: 1px solid var(--border-tactical);
            color: white;
            border-radius: 5px;
            padding: 5px 8px;
            font-family: inherit;
            font-size: 0.58rem;
            font-weight: 900;
            letter-spacing: 0.04em;
        }

        .signal-row {
            border-bottom: 1px solid var(--border-tactical);
            transition: background 0.2s;
        }

        .signal-row:hover { background: oklch(0.18 0.02 240 / 0.5); }

        .signal-row td { padding: 10px 12px; vertical-align: middle; overflow: visible; }

        .ticker-name { font-size: 1.1rem; font-weight: 1000; color: white; display: block; }
        .ticker-metadata { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .ticker-metadata span { font-size: 0.55rem; color: var(--text-muted); font-weight: 800; }

        .confidence-badge {
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.5rem;
          font-weight: 1000;
          text-transform: uppercase;
        }

        .confidence-badge.high {
          background: oklch(0.7 0.2 150 / 0.2);
          color: var(--accent-emerald);
          border: 1px solid oklch(0.7 0.2 150 / 0.4);
        }

        .confidence-badge.medium {
          background: oklch(0.85 0.25 200 / 0.2);
          color: oklch(0.85 0.25 200);
          border: 1px solid oklch(0.85 0.25 200 / 0.4);
        }

        .confidence-badge.standard {
          background: oklch(0.75 0.2 320 / 0.2);
          color: oklch(0.75 0.2 320);
          border: 1px solid oklch(0.75 0.2 320 / 0.4);
        }

        .confidence-badge.fast_high_prob {
          background: oklch(0.85 0.3 180 / 0.2);
          color: oklch(0.85 0.3 180);
          border: 1px solid oklch(0.85 0.3 180 / 0.4);
        }

        .target-return {
          background: oklch(0.6 0.2 25 / 0.2);
          color: oklch(0.6 0.2 25);
          border: 1px solid oklch(0.6 0.2 25 / 0.4);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.5rem;
          font-weight: 1000;
        }

        .strategy-badge {
            font-size: 0.6rem;
            font-weight: 1000;
            padding: 2px 8px;
            border-radius: 4px;
            background: oklch(0.7 0.2 150 / 0.1);
            color: var(--accent-emerald);
            border: 1px solid oklch(0.7 0.2 150 / 0.3);
            white-space: normal;
            overflow: visible;
            text-overflow: clip;
            display: inline-block;
            max-width: 100%;
            line-height: 1.35;
        }

        .vector-subline {
            margin-top: 6px;
            color: var(--text-muted);
            font-size: 0.55rem;
            font-weight: 900;
            letter-spacing: 0.04em;
            overflow: visible;
            text-overflow: clip;
            white-space: normal;
            overflow-wrap: anywhere;
        }

        .appeared-cell { display: flex; flex-direction: column; gap: 4px; }
        .appeared-cell span { color: white; font-size: 0.7rem; font-weight: 900; }
        .appeared-cell small { color: var(--text-muted); font-size: 0.55rem; font-weight: 900; }

        .strategy-badge.sauce {
            color: oklch(0.85 0.25 200);
            background: oklch(0.85 0.25 200 / 0.1);
            border-color: oklch(0.85 0.25 200 / 0.3);
        }

        .profit-val { font-size: 1rem; font-weight: 1000; display: block; }
        .profit-val.pos { color: var(--accent-emerald); }
        .profit-val.neg { color: var(--accent-rose); }
        .time-val { font-size: 0.65rem; color: var(--text-muted); font-weight: 800; }

        .sparkline-container { width: 100px; height: 30px; margin: 0 auto; }
        .sparkline-path { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
        .sparkline-path.pos { stroke: var(--accent-emerald); filter: drop-shadow(0 0 4px oklch(0.7 0.2 150 / 0.4)); }
        .sparkline-path.neg { stroke: var(--accent-rose); filter: drop-shadow(0 0 4px oklch(0.6 0.2 25 / 0.4)); }

        .analyze-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: oklch(0.2 0.02 240);
            border: 1px solid var(--border-tactical);
            color: white;
            font-size: 0.65rem;
            font-weight: 900;
            border-radius: 4px;
            text-decoration: none;
            transition: all 0.2s;
        }

        .analyze-link:hover {
            background: white;
            color: black;
            border-color: white;
        }

        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .text-emerald { color: var(--accent-emerald); }
        .text-rose { color: var(--accent-rose); }
        .weight-700 { font-weight: 700; }

        @keyframes scan { from { left: -100%; } to { left: 100%; } }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } }
        @keyframes slide-in { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        /* RESPONSIVE */
        @media (max-width: 1024px) {
            .screener-header { flex-direction: column; align-items: flex-start; gap: 24px; }
            .controls-group { width: 100%; align-items: stretch; }
            .filters-row { flex-wrap: wrap; }
            .select-wrapper { flex: 1; min-width: 120px; }
            .settings-grid { grid-template-columns: 1fr; }
            .hide-tablet { display: none; }
            .signals-table td, .signals-table th { padding: 12px 16px; }
        }

        @media (max-width: 640px) {
            .screener-container { padding: 16px; }
            .hide-mobile { display: none; }
            .ticker-name { font-size: 0.95rem; }
            .main-title { font-size: 1.25rem; }
            .tab-item { padding: 6px 12px; font-size: 0.65rem; }
            .signals-table td, .signals-table th { padding: 12px; }
            .profit-val { font-size: 0.9rem; }
        }

        .custom-scrollbar::-webkit-scrollbar { height: 4px; width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-tactical); border-radius: 10px; }
      `}</style>
    </div>
  );
}
