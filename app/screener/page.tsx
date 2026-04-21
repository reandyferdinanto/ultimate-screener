"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Send, Settings, RefreshCw, BarChart2 } from "lucide-react";
import Link from "next/link";

interface SignalData {
  ticker: string;
  strategy?: string;
  signalSource?: string;
  currentPrice?: number;
  buyArea?: number;
  tp?: number;
  sl?: number;
  riskPct?: string;
  daysHeld: number;
  priceHistory?: { price: number }[];
  metadata?: Record<string, string | number>;
}

export default function ScreenerPage() {
  const [data, setData] = useState<SignalData[]>([]);
  const [view, setView] = useState<'signals' | 'sauce' | 'divergence' | 'sqz_div' | 'arahunter'>('signals');
  const [priceRange, setPriceRange] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sqzTimeframe, setSqzTimeframe] = useState<'1d' | '4h'>('1d');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const fetchData = async () => {
    setScanning(true);
    setMsg("Running conviction-based scan... Filtering low risk only.");
    try {
      const scanRes = await fetch("/api/screener/scan", { method: "POST" });
      const scanJson = await scanRes.json();
      if (scanJson.success) {
        setMsg("Scan complete! Showing high conviction setups.");
        await loadCurrentData();
      } else {
        setMsg("Scan failed: " + scanJson.error);
      }
    } catch {
      setMsg("Connection error.");
    } finally {
      setScanning(false);
      setTimeout(() => setMsg(""), 5000);
    }
  };

  const loadCurrentData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/screener?priceRange=${priceRange}&dateFilter=${dateFilter}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      console.error("Failed to load current data");
    } finally {
      setLoading(false);
    }
  }, [priceRange, dateFilter]);

  useEffect(() => {
    const savedToken = localStorage.getItem("botToken");
    const savedChat = localStorage.getItem("chatId");
    if (savedToken) setBotToken(savedToken);
    if (savedChat) setChatId(savedChat);
  }, []);

  useEffect(() => {
    loadCurrentData();
  }, [priceRange, dateFilter, view, loadCurrentData]);

  const displayedSignals = data.filter(s => {
      if (view === 'sauce') return s.strategy?.includes('Secret');
      if (view === 'divergence') return s.strategy?.includes('CVD');
      if (view === 'sqz_div') {
          const isSqz = s.strategy?.includes('Squeeze');
          // Squeeze Divergence (1D) or Squeeze Divergence (4H)
          const isRightTF = s.signalSource?.includes(sqzTimeframe.toUpperCase());
          return isSqz && isRightTF;
      }
      return !s.strategy?.includes('Secret') && !s.strategy?.includes('CVD') && !s.strategy?.includes('Squeeze');
  });

  const saveSettings = () => {
    localStorage.setItem("botToken", botToken);
    localStorage.setItem("chatId", chatId);
    setShowSettings(false);
    setMsg("Settings saved.");
    setTimeout(() => setMsg(""), 3000);
  };

  const sendToTelegram = async () => {
    if (!botToken || !chatId) {
      setMsg("Config missing!");
      return;
    }
    setSending(true);
    try {
      const signalsToPush = displayedSignals.slice(0, 3);
      if (signalsToPush.length === 0) {
          setMsg("No signals to push!");
          setSending(false);
          return;
      }

      const text = `🎯 *SECRET SAUCE ANALYTICS REPORT*\n\n` + 
        signalsToPush.map(s => {
          const meta = s.metadata || {};
          
          // Technical indicators for the report
          const mfi = parseFloat(String(meta.mfi)) || 0;
          const dist20 = parseFloat(String(meta.dist20)) || 0;
          const consolidation = parseFloat(String(meta.consolidationScore)) || 0;
          
          const isAccumulation = mfi > 60 && mfi < 88;
          const isTight = consolidation < 4.0;
          const isNearSupport = dist20 < 5;
          const isAbove20 = dist20 > 0;
          
          let projection = "";
          if (isTight && isAccumulation && isAbove20 && isNearSupport) {
              projection = "🚀 *BREAKOUT ANALYSIS:* Strong accumulation with price coiling near EMA20. High probability to move higher tomorrow.";
          } else if (dist20 > 10) {
              projection = "⚠️ *RETRACEMENT ALERT:* Price is overextended from EMA20. High risk of profit-taking. Watch for support retest near EMA20.";
          } else if (mfi > 88) {
              projection = "📉 *DISTRIBUTION RISK:* Overbought levels detected. Volume may cool down, finding base support before next leg up.";
          } else if (isAbove20 && !isNearSupport) {
              projection = "📈 *TREND FLOW:* Moving in a bullish channel. Expect temporary pullback to find solid support before continuation.";
          } else {
              projection = "🔄 *PATTERN FORMING:* Consolidating. Watch for volume spike confirmation as price tightens.";
          }

          return `🚀 *${s.ticker}* (Secret Sauce)\n` +
            `💰 *Entry Area:* ${s.buyArea} | *Target:* ${s.tp}\n` +
            `📊 *MFI:* ${mfi.toFixed(1)} | *Dist EMA20:* ${dist20.toFixed(1)}%\n` +
            `📦 *Tightness:* ${consolidation.toFixed(1)}% (Variance)\n` +
            `${projection}\n` +
            `🛑 *Stop Loss:* ${s.sl}`;
        }).join('\n\n---\n\n');

      const res = await fetch("/api/telegram", {
        method: "POST",
        body: JSON.stringify({ botToken, chatId, text }),
      });
      const json = await res.json();
      if (json.success) setMsg("Signals pushed to Telegram!");
      else setMsg("Push failed: " + json.error);
    } catch {
      setMsg("Connection error.");
    } finally {
      setSending(false);
      setTimeout(() => setMsg(""), 4000);
    }
  };

  return (
    <div style={{ padding: '12px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: '1 1 300px' }}>
          <h1 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0, letterSpacing: '0.1em', fontWeight: '800' }}>ULTIMATE SCREENER</h1>
          <div className="nav-tabs" style={{ marginTop: '16px', borderBottom: 'none' }}>
            <span 
              onClick={() => setView('signals')} 
              className={`tab-link ${view === 'signals' ? 'active' : ''}`}
            >
              EMA BOUNCE
            </span>
            <span 
              onClick={() => setView('divergence')} 
              className={`tab-link ${view === 'divergence' ? 'active' : ''}`}
              style={{ color: view === 'divergence' ? 'oklch(0.7 0.2 300)' : '', borderBottomColor: view === 'divergence' ? 'oklch(0.7 0.2 300)' : '' }}
            >
              CVD DIVERGENCE
            </span>
            <span 
              onClick={() => setView('sqz_div')} 
              className={`tab-link ${view === 'sqz_div' ? 'active' : ''}`}
              style={{ color: view === 'sqz_div' ? 'oklch(0.82 0.18 145)' : '', borderBottomColor: view === 'sqz_div' ? 'oklch(0.82 0.18 145)' : '' }}
            >
              SQZ DIVERGENCE
            </span>
            <span 
              onClick={() => setView('sauce')} 
              className={`tab-link ${view === 'sauce' ? 'active' : ''}`}
              style={{ color: view === 'sauce' ? 'oklch(0.85 0.25 200)' : '', borderBottomColor: view === 'sauce' ? 'oklch(0.85 0.25 200)' : '' }}
            >
              SECRET SAUCE
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 300px' }}>
          {view === 'sqz_div' && (
            <select className="input" style={{ width: '100px', height: '32px', fontSize: '0.75rem', padding: '0 8px', borderColor: 'var(--accent-green)' }} value={sqzTimeframe} onChange={e => setSqzTimeframe(e.target.value as any)}>
              <option value="1d">1D_FRAME</option>
              <option value="4h">4H_FRAME</option>
            </select>
          )}
          <select className="input" style={{ width: '130px', height: '32px', fontSize: '0.75rem', padding: '0 8px' }} value={priceRange} onChange={e => setPriceRange(e.target.value)}>
              <option value="all">ALL PRICES</option>
              <option value="under300">UNDER 300</option>
              <option value="under500">UNDER 500</option>
              <option value="above500">ABOVE 500</option>
          </select>
          <select className="input" style={{ width: '110px', height: '32px', fontSize: '0.75rem', padding: '0 8px', borderColor: dateFilter !== 'all' ? 'var(--accent-green)' : '' }} value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
              <option value="all">ALL TIME</option>
              <option value="today">TODAY</option>
              <option value="3d">3 DAYS</option>
              <option value="7d">7 DAYS</option>
          </select>
          <button className="button" style={{ height: '32px' }} onClick={fetchData} disabled={loading || scanning}>
            <RefreshCw size={14} style={{ marginRight: '6px' }}/>
            <span className="mobile-hide">{scanning ? "SCANNING..." : "SCAN"}</span>
          </button>
          <button className="button" style={{ height: '32px' }} onClick={() => setShowSettings(!showSettings)}>
            <Settings size={14} style={{ marginRight: '6px' }}/>
          </button>
          <button className={`button ${(!botToken || !chatId || loading || scanning) ? 'button-disabled' : ''}`} style={{ height: '32px' }} onClick={sendToTelegram} disabled={sending || loading || scanning}>
            <Send size={14} style={{ marginRight: '6px' }}/>
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom: '16px', padding: '10px', border: '1px solid var(--accent-green)', color: 'var(--accent-green)', fontSize: '0.75rem', backgroundColor: 'oklch(0.82 0.18 145 / 0.05)' }}>
          {msg}
        </div>
      )}

      {showSettings && (
        <div className="panel" style={{ marginBottom: '24px', borderStyle: 'dashed' }}>
          <div className="panel-header">System Comms</div>
          <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>BOT TOKEN</label>
              <input className="input" type="password" value={botToken} onChange={e => setBotToken(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>CHAT ID</label>
              <input className="input" type="text" value={chatId} onChange={e => setChatId(e.target.value)} />
            </div>
            <button className="button" onClick={saveSettings} style={{ alignSelf: 'flex-start' }}>SAVE</button>
          </div>
        </div>
      )}

      <div className="panel scanline-container">
        <div className="panel-header" style={{ borderBottom: 'none', marginBottom: '8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
               <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: view === 'sauce' ? 'oklch(0.85 0.25 200)' : (view === 'sqz_div' ? 'oklch(0.82 0.18 145)' : 'var(--accent-green)') }}></div>
               {(view === 'sauce' ? 'Secret Sauce Predictions' : (view === 'sqz_div' ? 'Squeeze Momentum Divergences' : (view === 'divergence' ? 'CVD Divergence Signals' : 'EMA Bounce Signals')))}
            </span>
            <span className={view === 'sauce' ? 'glow-text-amber' : (view === 'sqz_div' ? 'positive' : (view === 'divergence' ? 'glow-text-purple' : 'positive'))} style={{ fontSize: '0.65rem', fontWeight: '800' }}>
               {view === 'sauce' ? 'PREDICTIVE ACCUMULATION' : (view === 'sqz_div' ? 'VOLATILITY ENGINE' : (view === 'divergence' ? 'MOMENTUM & VOLUME' : 'RISK LIMIT: < 5.5%'))}
            </span>
        </div>
        {(loading || scanning) ? (
          <div style={{ padding: '60px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div className="scanner-line"></div>
            <div style={{ color: 'var(--accent-green)', fontSize: '0.875rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>
                {scanning ? "SCANNING 900+ STOCKS..." : "SYNCING WITH EXCHANGE..."}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                {scanning ? "Applying Technical Filters & CVD Analysis" : "Retrieving Latest Market Data"}
            </div>
          </div>
        ) : (
          displayedSignals.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--accent-red)', fontSize: '0.875rem' }}>NO {view === 'sauce' ? 'PREDICTIVE SETUPS' : (view === 'divergence' ? 'CVD DIVERGENCE' : 'LOW-RISK')} SETUPS FOUND</div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th className="mobile-hide-col">Strategy</th>
                    <th className="mobile-hide">Risk%</th>
                    <th>Buy</th>
                    <th>TP (Pivot)</th>
                    <th className="mobile-hide-col">SL</th>
                    <th>Progress</th>
                    <th className="mobile-hide-col">Chart</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                    {displayedSignals.map((row, i) => {
                      const currentProfit = (row.currentPrice && row.buyArea) ? ((row.currentPrice - row.buyArea) / row.buyArea) * 100 : 0;
                      const rawPath = row.priceHistory || [];
                      const path = rawPath.length > 0 ? rawPath : (row.buyArea && row.currentPrice ? [{ price: row.buyArea }, { price: row.currentPrice }] : []);
                      
                      return (
                      <tr key={i}>
                        <td style={{ verticalAlign: 'top', padding: '12px 8px' }}>
                          <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '1rem' }}>{row.ticker}</div>
                          {row.metadata?.fluxStatus && (
                            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                               <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--accent-green)' }}>●</span> FLOW: {row.metadata.fluxStatus}
                               </div>
                               <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--accent-green)' }}>●</span> VOL: {row.metadata.volConviction}%
                               </div>
                               <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--accent-green)' }}>●</span> SQZ: {row.metadata.squeezeStatus}
                               </div>
                            </div>
                          )}
                        </td>
                        <td className="mobile-hide-col">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ 
                                fontSize: '0.55rem', 
                                padding: '2px 6px', 
                                backgroundColor: row.strategy?.includes('Secret') ? 'oklch(0.85 0.25 200 / 0.15)' : 
                                               (row.strategy?.includes('TURNAROUND') ? 'oklch(0.85 0.2 200 / 0.15)' : 
                                               (row.strategy?.includes('EXPLOSION') ? 'oklch(0.85 0.25 150 / 0.15)' : 
                                               (row.strategy?.includes('ELITE') ? 'oklch(0.85 0.3 180 / 0.15)' :
                                               (row.strategy?.includes('DIP') ? 'oklch(0.8 0.25 160 / 0.15)' :
                                               (row.strategy?.includes('SILENT') ? 'oklch(0.7 0.2 300 / 0.15)' :
                                               'oklch(0.82 0.18 145 / 0.1)'))))),
                                color: row.strategy?.includes('Secret') ? 'oklch(0.85 0.25 200)' : 
                                       (row.strategy?.includes('TURNAROUND') ? 'oklch(0.85 0.2 200)' : 
                                       (row.strategy?.includes('EXPLOSION') ? 'oklch(0.85 0.25 150)' : 
                                       (row.strategy?.includes('ELITE') ? 'oklch(0.85 0.3 180)' :
                                       (row.strategy?.includes('DIP') ? 'oklch(0.8 0.25 160)' :
                                       (row.strategy?.includes('SILENT') ? 'oklch(0.7 0.2 300)' :
                                       'var(--accent-green)'))))),
                                border: `1px solid ${row.strategy?.includes('Secret') ? 'oklch(0.85 0.25 200)' : 
                                                   (row.strategy?.includes('TURNAROUND') ? 'oklch(0.85 0.2 200)' : 
                                                   (row.strategy?.includes('EXPLOSION') ? 'oklch(0.85 0.25 150)' : 
                                                   (row.strategy?.includes('ELITE') ? 'oklch(0.85 0.3 180)' :
                                                   (row.strategy?.includes('DIP') ? 'oklch(0.8 0.25 160)' :
                                                   (row.strategy?.includes('SILENT') ? 'oklch(0.7 0.2 300)' :
                                                   'var(--accent-green)')))))}`,
                                fontWeight: 'bold',
                                textAlign: 'center',
                                whiteSpace: 'nowrap'
                            }}>
                                {row.strategy?.replace('CONVICTION: ', '').replace('SIGNAL: ', '') || 'BOUNCE'}
                            </span>
                          </div>
                        </td>
                        <td className="mobile-hide" style={{ color: 'var(--accent-green)', fontSize: '0.75rem' }}>{row.riskPct}%</td>
                        <td style={{ fontWeight: '600' }}>{row.buyArea}</td>
                        <td className="positive" style={{ fontWeight: '600' }}>{row.tp ? Number(row.tp).toFixed(Number(row.tp) % 1 !== 0 ? 2 : 0) : '-'}</td>
                        <td className="negative mobile-hide-col">{row.sl}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                             <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: currentProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                {currentProfit >= 0 ? '+' : ''}{currentProfit.toFixed(2)}%
                             </div>
                             <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                {row.daysHeld !== undefined ? (row.daysHeld >= 24 ? `${Math.floor(row.daysHeld/24)}d ${row.daysHeld%24}h` : `${row.daysHeld}h`) : '0h'}
                             </div>
                          </div>
                        </td>
                        <td className="mobile-hide-col" style={{ padding: '12px 8px' }}>
                           {path.length > 0 ? (
                             <div style={{ position: 'relative', width: '100px', height: '30px', margin: 'auto' }}>
                               <svg width="100" height="30" style={{ overflow: 'visible' }}>
                                  <path
                                    d={(() => {
                                        const pts = path.length > 1 ? path : [{ price: row.buyArea || 0 }, { price: row.currentPrice || row.buyArea || 0 }];
                                        const prices = pts.map(p => p.price);
                                        const minPrice = Math.min(...prices);
                                        const maxPrice = Math.max(...prices);
                                        const range = maxPrice - minPrice || 1;
                                        
                                        const points = pts.map((p, idx) => {
                                            const x = (idx / (pts.length - 1)) * 100;
                                            const y = 28 - ((p.price - minPrice) / range) * 26;
                                            return {x, y};
                                        });

                                        let d = `M ${points[0].x} ${points[0].y}`;
                                        for (let j = 1; j < points.length; j++) {
                                            d += ` L ${points[j].x} ${points[j].y}`;
                                        }
                                        return d;
                                    })()}
                                    fill="none"
                                    stroke={currentProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ filter: `drop-shadow(0 0 3px ${currentProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}66)` }}
                                  />
                               </svg>
                             </div>
                           ) : (
                              <div style={{ height: '2px', width: '100px', background: 'var(--border-color)', opacity: 0.3, margin: '14px auto' }}></div>
                           )}
                        </td>
                        <td>
                          <Link href={`/search?symbol=${row.ticker}`} className="button" style={{ padding: '4px 8px', fontSize: '0.65rem', borderStyle: 'dashed' }}>
                              <BarChart2 size={12} style={{ marginRight: '4px' }}/>
                              ANALYZE
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      <style jsx>{`
        .button-disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .scanner-line {
            width: 200px;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--accent-green), transparent);
            position: relative;
            overflow: hidden;
        }
        .scanner-line::after {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(130, 255, 160, 0.8), transparent);
            animation: scan 1.5s infinite ease-in-out;
        }
        @keyframes scan {
            0% { left: -100%; }
            100% { left: 100%; }
        }
        @media (max-width: 600px) {
            .mobile-hide-col {
                display: none;
            }
        }
      `}</style>
    </div>
  );
}
