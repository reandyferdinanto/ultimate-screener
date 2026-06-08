'use client';

import { useState, useEffect, Suspense } from 'react';
import AdvancedChart from '@/components/AdvancedChart';
import { 
  Activity, 
  AlertTriangle, 
  BarChart3, 
  Clock3, 
  Info, 
  Layers3, 
  Shield, 
  Target, 
  TrendingDown, 
  TrendingUp,
  Coins,
  Clock,
  Layers,
  Sparkles,
  Flame,
  Globe,
  Sliders
} from 'lucide-react';

// Market session detection
function getCurrentSession() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  if (utcHour >= 0 && utcHour < 8) {
    return {
      name: 'Asian',
      color: 'from-cyan-400 to-blue-500',
      textColor: 'text-cyan-400',
      bgColor: 'bg-cyan-500/5',
      borderColor: 'border-cyan-500/20',
      glowColor: 'shadow-cyan-500/20',
      timezone: 'Tokyo / Sydney / Singapore',
      volatility: 'Low - Medium',
      hours: '00:00 - 08:00 UTC',
      focus: 'Scalping & Mean Reversion',
    };
  } else if (utcHour >= 8 && utcHour < 16) {
    return {
      name: 'London',
      color: 'from-fuchsia-400 to-violet-600',
      textColor: 'text-fuchsia-400',
      bgColor: 'bg-fuchsia-500/5',
      borderColor: 'border-fuchsia-500/20',
      glowColor: 'shadow-fuchsia-500/20',
      timezone: 'London / Europe',
      volatility: 'Highest Liquidity',
      hours: '08:00 - 16:00 UTC',
      focus: 'Trend Breakouts & Momentum',
    };
  } else {
    return {
      name: 'New York',
      color: 'from-emerald-400 to-teal-600',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/5',
      borderColor: 'border-emerald-500/20',
      glowColor: 'shadow-emerald-500/20',
      timezone: 'New York / US',
      volatility: 'Extremely High',
      hours: '16:00 - 24:00 UTC',
      focus: 'News Releases & Reversals',
    };
  }
}

export default function GoldPage() {
  return (
    <Suspense fallback={
        <div className="loading-fallback flex flex-col items-center justify-center min-h-[400px]">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-yellow-500 border-t-transparent mb-4"></div>
            <p className="text-slate-400 font-mono text-xs uppercase tracking-widest">Initialising Gold Workspace...</p>
        </div>
    }>
      <GoldContent />
    </Suspense>
  );
}

function GoldContent() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState('1h');
  const [currentSession, setCurrentSession] = useState(getCurrentSession());
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');

  // Chart indicator toggles
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA60, setShowEMA60] = useState(true);
  const [showEMA200, setShowEMA200] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showAO, setShowAO] = useState(true);
  const [showSqueezeDeluxe, setShowSqueezeDeluxe] = useState(true);
  const [showMFI, setShowMFI] = useState(false);
  const [showBollingerBands, setShowBollingerBands] = useState(false);
  const [showSuperTrend, setShowSuperTrend] = useState(false);
  const [showVWAP, setShowVWAP] = useState(false);
  const [showOBV, setShowOBV] = useState(false);
  const [showCMF, setShowCMF] = useState(false);

  const symbol = 'GC=F'; // Gold Futures
  const displayTicker = 'XAU/USD';

  useEffect(() => {
    loadGoldData();
    
    // Update session every minute
    const sessionInterval = window.setInterval(() => {
      setCurrentSession(getCurrentSession());
    }, 60000);
    
    return () => window.clearInterval(sessionInterval);
  }, [interval]);

  async function loadGoldData() {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/technical?symbol=${symbol}&interval=${interval}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error loading gold data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  const timeframes = [
    { value: '1m', label: 'M1', group: 'Scalping' },
    { value: '5m', label: 'M5', group: 'Scalping' },
    { value: '15m', label: 'M15', group: 'Intraday' },
    { value: '30m', label: 'M30', group: 'Intraday' },
    { value: '1h', label: 'H1', group: 'Swing' },
    { value: '4h', label: 'H4', group: 'Swing' },
    { value: '1d', label: 'D1', group: 'Position' },
    { value: '1wk', label: 'W1', group: 'Position' }
  ];

  // Helper values
  const latestCandle = data?.data?.[data?.data?.length - 1];
  const prevCandle = data?.data?.[data?.data?.length - 2];
  const priceChange = latestCandle && prevCandle ? latestCandle.close - prevCandle.close : 0;
  const priceChangePercent = latestCandle && prevCandle ? (priceChange / prevCandle.close) * 100 : 0;
  const latestPrice = latestCandle?.close || 0;
  
  // Stacking & trend assessment
  const getTrend = () => {
    if (!latestCandle) return { label: 'NEUTRAL', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', textColor: '#94a3b8', desc: 'No data' };
    const { ema9, ema20, ema60, ema200 } = latestCandle;
    if (!ema9 || !ema20 || !ema60 || !ema200) return { label: 'CALCULATING', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', textColor: '#f59e0b', desc: 'Calculating averages...' };
    
    const bullish = ema9 > ema20 && ema20 > ema60 && ema60 > ema200;
    const bearish = ema9 < ema20 && ema20 < ema60 && ema60 < ema200;
    
    if (bullish) {
      return { label: 'BULLISH', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]', textColor: '#10b981', desc: 'EMAs stacked in bullish expansion' };
    } else if (bearish) {
      return { label: 'BEARISH', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]', textColor: '#f43f5e', desc: 'EMAs stacked in bearish expansion' };
    } else {
      return { label: 'CONSOLIDATING', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]', textColor: '#f59e0b', desc: 'EMAs entangled, range bound' };
    }
  };

  const trendStatus = getTrend();
  
  // Conviction scores
  const conviction = data?.divergenceReport?.conviction || 0;
  const verdict = data?.divergenceReport?.verdict || 'NO SIGNAL';
  const isBearishSetup = verdict.toLowerCase().includes('bearish') || verdict.toLowerCase().includes('warning');
  
  // Pivot Points mapping
  const pivots = data?.pivots;
  const getPivotPosition = (price: number, pvs: any) => {
    if (!pvs) return 50;
    const min = pvs.s3;
    const max = pvs.r3;
    if (price <= min) return 0;
    if (price >= max) return 100;
    return ((price - min) / (max - min)) * 100;
  };

  // Ensure Bollinger Bands maps correctly for the chart
  const chartData = data?.data ? data.data.map((d: any) => ({
    ...d,
    bb: d.bollingerBands || d.bb,
  })) : [];

  return (
    <div className="search-root min-h-screen bg-[#050505] text-silver-300 font-mono">
      
      <main className="search-container">
        
        {/* Command Center Panel */}
        <div className="command-center panel chart-command">
          <div className="command-copy">
            <div className="command-kicker"><Coins size={14} /> XAU/USD Spot Price Command</div>
            <h1>Gold Trading Dashboard</h1>
            <p>Gunakan chart ini untuk menyamakan bias conviction report, support/resistance pivot points, dan parameter model indikator teknis sebelum mengambil keputusan trading.</p>
          </div>

          <div className="command-row main">
            
            {/* Session quick status */}
            <div className="session-quick-status flex items-center gap-3 px-4 py-2 rounded-xl bg-[#090e16]/60 border border-slate-900 shadow-inner">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full bg-gradient-to-r ${currentSession.color} opacity-75 animate-ping`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 bg-gradient-to-r ${currentSession.color}`}></span>
              </span>
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono">
                {currentSession.name} Session ({currentSession.hours})
              </span>
            </div>

            <div className="timeframe-block">
              <span>Timeframe chart</span>
              <div className="timeframe-selector">
                  {timeframes.map(tf => (
                      <button
                          key={tf.value}
                          className={`tf-pill ${interval === tf.value ? 'active' : ''}`}
                          onClick={() => setInterval(tf.value)}
                          suppressHydrationWarning
                      >
                          {tf.label}
                      </button>
                  ))}
              </div>
            </div>

            <button 
              className="analyze-btn" 
              onClick={loadGoldData} 
              disabled={loading}
              style={{ background: 'var(--accent-gold)' }}
            >
              {loading ? "Syncing" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Sync Errors */}
        {error && <div className="chart-error panel">{error}</div>}

        {/* Loading Spinner */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-40 bg-slate-950/20 border border-slate-900 rounded-xl">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-yellow-500 border-t-transparent mb-4"></div>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">Connecting with TA-Lib Engine...</p>
          </div>
        )}

        {data && data.data && (
          <div className="search-grid">
            
            {/* Left Column: Charts & Indicators */}
            <div className="charts-column">
              {/* Alert Banner for Lower Timeframe Divergences */}
              {interval === '1d' && data.lowerTimeframeSignals && data.lowerTimeframeSignals.length > 0 && (
                <div className="mb-4 p-4 border rounded-lg bg-rose-950/15" style={{
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  boxShadow: '0 0 15px rgba(239, 68, 68, 0.1)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'oklch(0.7 0.2 40)', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
                    <AlertTriangle size={15} />
                    <span>Lower Timeframe Divergence Alerts (1d Context)</span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '8px', lineHeight: '1.4' }}>
                    Divergences detected on lower timeframes indicate possible momentum shifts before they appear on the daily chart:
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                    {data.lowerTimeframeSignals.map((sig: any, index: number) => (
                      <div key={index} style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--accent-amber)', fontWeight: 'bold', fontSize: '10px' }}>{sig.interval.toUpperCase()} Timeframe</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '9px', fontWeight: 'bold' }}>{sig.conviction}% Conv.</span>
                        </div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '11px', fontWeight: '500', marginTop: '2px' }}>
                          {sig.divergences.join(', ')}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                          {sig.verdict}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lightweight Chart wrapper */}
              <div className="chart-wrapper main-viz panel" style={{ padding: 0, height: "auto", overflow: "visible" }}>
                {chartData.length > 0 ? (
                  <AdvancedChart
                    key={`main-${symbol}-${interval}-${showEMA9}-${showEMA20}-${showEMA60}-${showEMA200}-${showRSI}-${showAO}-${showSqueezeDeluxe}-${showMFI}-${showBollingerBands}-${showSuperTrend}-${showVWAP}-${showOBV}-${showCMF}-${chartType}`}
                    data={chartData}
                    pivots={pivots}
                    ticker={displayTicker}
                    chartType={chartType}
                    showEMA9={showEMA9}
                    showEMA20={showEMA20}
                    showEMA60={showEMA60}
                    showEMA200={showEMA200}
                    showRSI={showRSI}
                    showAO={showAO}
                    showSqueezeDeluxe={showSqueezeDeluxe}
                    showMFI={showMFI}
                    showBB={showBollingerBands}
                    showSuperTrend={showSuperTrend}
                    showVWAP={showVWAP}
                    showOBV={showOBV}
                    showCMF={showCMF}
                  />
                ) : (
                  <div className="flex items-center justify-center py-40 text-slate-500 font-mono text-xs">
                    No chart points available. Try refreshing or changing timeframe.
                  </div>
                )}
              </div>

              {/* Chart Overview stats row */}
              <section className="chart-overview panel" style={{ '--chart-accent': 'var(--accent-gold)' } as any}>
                <div className="chart-overview-main">
                  <div>
                    <div className="chart-kicker"><Activity size={14} /> Live market context</div>
                    <h2>{displayTicker} <span>{interval.toUpperCase()}</span></h2>
                    <p>Membaca harga terakhir, pergerakan tren, level volatilitas, dan bias divergence model secara dinamis.</p>
                  </div>
                  <div className={`chart-sync-badge ok`}>Live feeds</div>
                </div>

                <div className="chart-stat-grid">
                  <div className="chart-stat-card price">
                    <span>Harga Terakhir</span>
                    <strong className="text-white">${latestPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    <small className={priceChangePercent >= 0 ? 'stat-up' : 'stat-down'}>
                      {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}% dari candle sebelumnya
                    </small>
                  </div>
                  <div className="chart-stat-card entry">
                    <span>Trend Matrix</span>
                    <strong style={{ color: trendStatus.textColor || '#38bdf8' } as any}>{trendStatus.label}</strong>
                    <small>Arah EMA stack saat ini</small>
                  </div>
                  <div className="chart-stat-card stop">
                    <span>Engine Conviction</span>
                    <strong style={{ color: isBearishSetup ? 'var(--accent-rose)' : conviction > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)' } as any}>
                      {conviction}%
                    </strong>
                    <small>Signal scanner confidence</small>
                  </div>
                  <div className="chart-stat-card target">
                    <span>ATR Volatility</span>
                    <strong style={{ color: 'var(--accent-gold)' }}>{latestCandle?.atr ? latestCandle.atr.toFixed(2) : '0.00'}</strong>
                    <small>Average True Range value</small>
                  </div>
                </div>
              </section>

              {/* Chart controls mixer panel */}
              <section className="chart-controls-panel panel">
                <div className="control-group view-mode">
                  <div className="control-label"><Layers3 size={13} /> View Mode</div>
                  <div className="chart-type-toggle">
                      <button className={`${chartType === 'candle' ? 'active' : ''}`} onClick={() => setChartType('candle')}>
                          Candle
                      </button>
                      <button className={`${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>
                          Line
                      </button>
                  </div>
                </div>

                <div className="control-group">
                  <div className="control-label">Trend Lines</div>
                  <div className="indicator-matrix">
                      <button className={`matrix-btn trend ${showEMA9 ? 'active' : ''}`} onClick={() => setShowEMA9(!showEMA9)}>
                        <span className="indicator-color" style={{ backgroundColor: '#3b82f6' }}></span>EMA 9
                      </button>
                      <button className={`matrix-btn trend ${showEMA20 ? 'active' : ''}`} onClick={() => setShowEMA20(!showEMA20)}>
                        <span className="indicator-color" style={{ backgroundColor: '#f59e0b' }}></span>EMA 20
                      </button>
                      <button className={`matrix-btn trend ${showEMA60 ? 'active' : ''}`} onClick={() => setShowEMA60(!showEMA60)}>
                        <span className="indicator-color" style={{ backgroundColor: '#8b5cf6' }}></span>EMA 60
                      </button>
                      <button className={`matrix-btn trend ${showEMA200 ? 'active' : ''}`} onClick={() => setShowEMA200(!showEMA200)}>
                        <span className="indicator-color" style={{ backgroundColor: '#ec4899' }}></span>EMA 200
                      </button>
                      <button className={`matrix-btn trend ${showBollingerBands ? 'active' : ''}`} onClick={() => setShowBollingerBands(!showBollingerBands)}>
                        <span className="indicator-color" style={{ backgroundColor: '#94a3b8' }}></span>Bollinger
                      </button>
                      <button className={`matrix-btn trend ${showSuperTrend ? 'active' : ''}`} onClick={() => setShowSuperTrend(!showSuperTrend)}>
                        <span className="indicator-color" style={{ backgroundColor: '#22c55e' }}></span>SuperTrend
                      </button>
                  </div>
                </div>

                <div className="control-group">
                  <div className="control-label">Momentum & volume</div>
                  <div className="indicator-matrix">
                      <button className={`matrix-btn vol ${showRSI ? 'active' : ''}`} onClick={() => setShowRSI(!showRSI)}>
                        <span className="indicator-color" style={{ backgroundColor: '#fbbf24' }}></span>RSI
                      </button>
                      <button className={`matrix-btn vol ${showAO ? 'active' : ''}`} onClick={() => setShowAO(!showAO)}>
                        <span className="indicator-color" style={{ backgroundColor: '#22c55e' }}></span>AO
                      </button>
                      <button className={`matrix-btn vol ${showSqueezeDeluxe ? 'active' : ''}`} onClick={() => setShowSqueezeDeluxe(!showSqueezeDeluxe)}>
                        <span className="indicator-color" style={{ backgroundColor: '#ea580c' }}></span>Squeeze
                      </button>
                      <button className={`matrix-btn vol ${showMFI ? 'active' : ''}`} onClick={() => setShowMFI(!showMFI)}>
                        <span className="indicator-color" style={{ backgroundColor: '#10b981' }}></span>MFI
                      </button>
                      <button className={`matrix-btn vol ${showVWAP ? 'active' : ''}`} onClick={() => setShowVWAP(!showVWAP)}>
                        <span className="indicator-color" style={{ backgroundColor: '#38bdf8' }}></span>VWAP
                      </button>
                      <button className={`matrix-btn vol ${showOBV ? 'active' : ''}`} onClick={() => setShowOBV(!showOBV)}>
                        <span className="indicator-color" style={{ backgroundColor: '#a78bfa' }}></span>OBV
                      </button>
                      <button className={`matrix-btn vol ${showCMF ? 'active' : ''}`} onClick={() => setShowCMF(!showCMF)}>
                        <span className="indicator-color" style={{ backgroundColor: '#fb7185' }}></span>CMF
                      </button>
                  </div>
                </div>
              </section>

              {/* Heatmap S/R slider wrapper */}
              {pivots && (
                <div className="legend-panel panel">
                  <div className="legend-header">
                    <Layers size={14} className="text-yellow-500" />
                    <span>Pivot Heatmap & Spot Location</span>
                  </div>
                  
                  <div className="relative w-full h-4 bg-slate-900 rounded-full border border-slate-800 overflow-hidden shadow-inner my-2">
                    <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-yellow-500/40 z-10"></div>
                    <div className="absolute left-0 w-1/2 top-0 bottom-0 bg-emerald-500/10"></div>
                    <div className="absolute left-1/2 right-0 top-0 bottom-0 bg-rose-500/10"></div>
                    <div className="absolute top-0 bottom-0 w-[1px] bg-emerald-500/20" style={{ left: '33.3%' }}></div>
                    <div className="absolute top-0 bottom-0 w-[1px] bg-emerald-500/20" style={{ left: '16.6%' }}></div>
                    <div className="absolute top-0 bottom-0 w-[1px] bg-rose-500/20" style={{ left: '66.6%' }}></div>
                    <div className="absolute top-0 bottom-0 w-[1px] bg-rose-500/20" style={{ left: '83.3%' }}></div>

                    <div 
                      className="absolute top-0 bottom-0 w-3 bg-yellow-400 rounded-full border border-slate-950 shadow-md shadow-yellow-500/50 z-20 transition-all duration-700"
                      style={{ left: `${getPivotPosition(latestPrice, pivots)}%`, transform: 'translateX(-50%)' }}
                      title={`Spot Price: $${latestPrice}`}
                    ></div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-1">
                    <span className="text-emerald-500 uppercase tracking-widest text-[9px] font-bold">Support Range</span>
                    <span className="text-yellow-500 font-bold">Spot Price: ${latestPrice.toFixed(2)}</span>
                    <span className="text-rose-500 uppercase tracking-widest text-[9px] font-bold">Resistance Range</span>
                  </div>
                </div>
              )}

              {/* Chart guide legends */}
              <section className="chart-guide panel">
                <div><Target size={15} /><strong>Asian Session</strong><span>Low volatility, range consolidation trading models apply.</span></div>
                <div><Shield size={15} /><strong>London Session</strong><span>High volatility, trend breakout trading models apply.</span></div>
                <div><TrendingUp size={15} /><strong>NY Session</strong><span>News releases, macro rate actions, high trend momentum.</span></div>
                <div><Clock3 size={15} /><strong>Divergence</strong><span>D+ represents Bullish Divergence setups; D- represents Bearish setups.</span></div>
              </section>

              {/* Compression Insight */}
              {showSqueezeDeluxe && latestCandle?.squeezeDeluxe && (
                <div className="compression-callout">
                  <div>Volatility compression state</div>
                  <p>
                    {latestCandle.squeezeDeluxe.squeeze?.high ? 'High' : latestCandle.squeezeDeluxe.squeeze?.mid ? 'Normal' : latestCandle.squeezeDeluxe.squeeze?.low ? 'Low' : 'No'} squeeze compression active. 
                    Flux is {latestCandle.squeezeDeluxe.flux?.toFixed(2) || '0.00'}. Momentum is {latestCandle.squeezeDeluxe.momentum > (latestCandle.squeezeDeluxe.signal || 0) ? 'ACCELERATING' : 'DECELERATING'}.
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Divergence Engine & Pivot list */}
            <div className="analysis-column">
              
              {/* Divergence report conviction panel */}
              {data.divergenceReport && (
                <div className="conviction-panel panel" style={{ '--accent-color': data.divergenceReport.color } as any}>
                  <div className="panel-header report-header">
                    <div>
                      <span>Divergence Report</span>
                      <small>Divergence-focused analysis with market structure, EMA bounces, and accumulation detection.</small>
                    </div>
                    <div className={`report-sync-pill ${data.divergenceReport.conviction >= 70 ? "ok" : data.divergenceReport.conviction >= 50 ? "warn" : "neutral"}`}>
                      Conviction: {data.divergenceReport.conviction}%
                    </div>
                  </div>

                  <div className="verdict-hero">
                    <div className="v-header">
                      <div className="v-label">Current verdict</div>
                      <div className="verdict-icon">
                        {isBearishSetup ? (
                          <TrendingDown size={14} className="text-rose-400" />
                        ) : (
                          <TrendingUp size={14} className="text-emerald-400" />
                        )}
                      </div>
                    </div>
                    <div className="v-value" style={{ color: data.divergenceReport.color }}>
                      {data.divergenceReport.verdict}
                    </div>
                    <div className="v-meta">
                      <span>Conviction: <strong>{data.divergenceReport.conviction}%</strong></span>
                    </div>
                  </div>

                  {data.divergenceReport.shouldReport && (
                    <div className="divergence-signals-panel">
                      <div className="mini-section-title">🎯 Detected Signals</div>
                      <div className="signals-list">
                        {data.divergenceReport.signals?.map((signal: string, idx: number) => (
                          <div key={idx} className="signal-item">{signal}</div>
                        ))}
                      </div>

                      {data.divergenceReport.details && (
                        <div className="divergence-details">
                          <div className="mini-section-title">📊 Analysis Details</div>
                          <p>{data.divergenceReport.details}</p>
                        </div>
                      )}

                      {data.divergenceReport.marketStructure && (
                        <div className="market-structure-panel">
                          <div className="mini-section-title">🏗️ Market Structure</div>
                          <div className="structure-grid">
                            <div><span>Quality</span><strong>{data.divergenceReport.marketStructure.quality}</strong></div>
                            <div><span>Score</span><strong>{data.divergenceReport.marketStructure.score}/100</strong></div>
                            <div><span>Details</span><strong>{data.divergenceReport.marketStructure.details}</strong></div>
                          </div>
                        </div>
                      )}

                      {data.divergenceReport.emaBounce?.isBouncing && (
                        <div className="ema-bounce-panel">
                          <div className="mini-section-title">🎯 EMA Bounce</div>
                          <p>{data.divergenceReport.emaBounce.details}</p>
                        </div>
                      )}

                      {data.divergenceReport.accumulation?.isAccumulating && (
                        <div className="accumulation-panel">
                          <div className="mini-section-title">💰 Accumulation</div>
                          <p>{data.divergenceReport.accumulation.details}</p>
                          <div className="accumulation-strength">
                            <span>Strength</span>
                            <div className="strength-bar">
                              <div className="strength-fill animate-pulse" style={{ width: `${data.divergenceReport.accumulation.strength}%`, background: 'var(--accent-gold)', boxShadow: '0 0 10px var(--accent-gold)' }}></div>
                            </div>
                            <strong>{data.divergenceReport.accumulation.strength}%</strong>
                          </div>
                        </div>
                      )}

                      {data.divergenceReport.indicators && (
                        <div className="indicators-panel">
                          <div className="mini-section-title">📊 Key Indicators</div>
                          <div className="indicators-grid">
                            <div><span>RSI</span><strong>{data.divergenceReport.indicators.rsi?.toFixed(1) || 'N/A'}</strong></div>
                            <div><span>MFI</span><strong>{data.divergenceReport.indicators.mfi?.toFixed(1) || 'N/A'}</strong></div>
                            <div><span>AO</span><strong>{data.divergenceReport.indicators.ao?.toFixed(2) || 'N/A'}</strong></div>
                            <div><span>Squeeze</span><strong>{data.divergenceReport.indicators.squeezeIntensity > 0 ? `Active (${data.divergenceReport.indicators.squeezeIntensity})` : 'None'}</strong></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Playbook synced row */}
                  <div className={`screener-sync-panel synced`} style={{ '--accent-color': 'var(--accent-gold)' } as any}>
                    <div className="sync-title-row">
                      <div className="sync-title"><Clock3 size={14} /> Session Playbook</div>
                      <div className="sync-badge" style={{ background: 'var(--accent-gold)', color: 'black' }}>
                        {currentSession.name}
                      </div>
                    </div>
                    <div className="sync-vector">Style focus: {currentSession.focus}</div>
                    <div className="sync-ok">Standard hours: {currentSession.hours} | Volatility: {currentSession.volatility}</div>
                    
                    <div className="mt-4 space-y-3 font-mono text-[11px] leading-relaxed">
                      <div>
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Typical Price Action</span>
                        <ul className="space-y-1 text-slate-300 font-mono">
                          {currentSession.name === 'Asian' && (
                            <>
                              <li>• Range compression, lower ATR (0.3% - 0.5% average)</li>
                              <li>• High respect for horizontal support & resistance levels</li>
                              <li>• Lower false breakout occurrences before London crossover</li>
                            </>
                          )}
                          {currentSession.name === 'London' && (
                            <>
                              <li>• Major breakout opportunities, strong directional runs</li>
                              <li>• Peak daily liquidity (0.8% - 1.2% average volatility)</li>
                              <li>• Watch for London Fix price spikes at 15:00 UTC</li>
                            </>
                          )}
                          {currentSession.name === 'New York' && (
                            <>
                              <li>• USD macroeconomic data-driven volatility spikes</li>
                              <li>• Reversal signals common during London market close</li>
                              <li>• Correlation checks with treasury yields at highest weight</li>
                            </>
                          )}
                        </ul>
                      </div>
                      
                      <div className="pt-2 border-t border-slate-900/60">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Execution Directives</span>
                        <ul className="space-y-1 text-slate-300 font-mono">
                          {currentSession.name === 'Asian' && (
                            <>
                              <li>✓ Employ tighter stop losses (compress risk parameters)</li>
                              <li>✓ Mean reversion plays: Sell high extreme, buy low extreme</li>
                              <li>✗ Avoid chasing breakout triggers before high volume times</li>
                            </>
                          )}
                          {currentSession.name === 'London' && (
                            <>
                              <li>✓ Ride established trends using momentum indicators</li>
                              <li>✓ Widen stop buffers to avoid noise triggers</li>
                              <li>✓ Wait for the first 30m candle close to verify breakouts</li>
                            </>
                          )}
                          {currentSession.name === 'New York' && (
                            <>
                              <li>✓ Trade macroeconomic reports (e.g. CPI, NFP, Fed calls)</li>
                              <li>✓ Check DXY index correlation (inverse movement rules)</li>
                              <li>✗ Reduce sizing after London close (lowers liquidity overlay)</li>
                            </>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Macro Correlation panel */}
                  <div className="execution-plan" style={{ '--plan-color': 'var(--accent-gold)' } as any}>
                    <div className="execution-header">
                      <div>
                        <div className="execution-kicker">Macro Correlation anchors</div>
                        <div className="execution-state">Key XAU/USD Drivers</div>
                      </div>
                      <div className="execution-rr">
                        <span>SPOTS</span>
                        <small>Commodity</small>
                      </div>
                    </div>

                    <div className="execution-grid text-left font-mono">
                      <div className="execution-cell">
                        <span>US Dollar (DXY)</span>
                        <strong className="text-rose-400">INVERSE (~80%)</strong>
                      </div>
                      <div className="execution-cell">
                        <span>Treasury Yields</span>
                        <strong className="text-rose-400">INVERSE (Rate cost)</strong>
                      </div>
                      <div className="execution-cell">
                        <span>Inflation (CPI)</span>
                        <strong className="text-emerald-400">DIRECT (Purchasing)</strong>
                      </div>
                      <div className="execution-cell">
                        <span>Risk-Off Flow</span>
                        <strong className="text-emerald-400">DIRECT (Safe haven)</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pivot Targets list */}
              {pivots && (
                <div className="pivots-panel panel">
                  <div className="panel-header">Pivot targets</div>
                  <div className="pivots-list">
                    <div className="pivot-row pos"><span>R3 Resistance</span><strong>{pivots.r3.toFixed(2)}</strong></div>
                    <div className="pivot-row pos"><span>R2 Resistance</span><strong>{pivots.r2.toFixed(2)}</strong></div>
                    <div className="pivot-row pos"><span>R1 Resistance</span><strong>{pivots.r1.toFixed(2)}</strong></div>
                    <div className="pivot-row base"><span>Base Pivot</span><strong>{pivots.p.toFixed(2)}</strong></div>
                    <div className="pivot-row neg"><span>S1 Support</span><strong>{pivots.s1.toFixed(2)}</strong></div>
                    <div className="pivot-row neg"><span>S2 Support</span><strong>{pivots.s2.toFixed(2)}</strong></div>
                    <div className="pivot-row neg"><span>S3 Support</span><strong>{pivots.s3.toFixed(2)}</strong></div>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </main>

      <style jsx global>{`
        :root {
            --bg-dark: #050505;
            --panel-bg: oklch(0.15 0.02 240);
            --border-tactical: oklch(0.25 0.02 240);
            --accent-emerald: oklch(0.7 0.2 150);
            --accent-cyan: oklch(0.75 0.2 200);
            --accent-rose: oklch(0.6 0.2 25);
            --accent-gold: oklch(0.85 0.15 80);
            --text-muted: oklch(0.6 0.02 240);
        }

        .search-container {
            max-width: 1600px;
            margin: 0 auto;
            padding: clamp(8px, 1.4vw, 18px);
            display: flex;
            flex-direction: column;
            gap: clamp(10px, 1.5vw, 16px);
        }

        .command-center {
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            background:
                radial-gradient(circle at top left, oklch(0.85 0.15 80 / 0.12), transparent 34%),
                linear-gradient(135deg, oklch(0.16 0.025 240), oklch(0.09 0.01 240));
            border-color: oklch(0.34 0.035 240);
        }

        .chart-command {
            position: relative;
            overflow: hidden;
        }

        .chart-command::after {
            content: '';
            position: absolute;
            inset: 0;
            pointer-events: none;
            background-image: linear-gradient(90deg, oklch(1 0 0 / 0.035) 1px, transparent 1px), linear-gradient(0deg, oklch(1 0 0 / 0.025) 1px, transparent 1px);
            background-size: 42px 42px;
            mask-image: linear-gradient(135deg, black, transparent 68%);
        }

        .command-copy,
        .command-row {
            position: relative;
            z-index: 1;
        }

        .command-kicker {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--accent-gold);
            font-size: 0.68rem;
            font-weight: 1000;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin-bottom: 8px;
        }

        .command-copy h1 {
            margin: 0;
            color: white;
            font-size: clamp(1.25rem, 2.4vw, 2rem);
            line-height: 1;
            letter-spacing: -0.04em;
        }

        .command-copy p {
            margin: 10px 0 0;
            color: oklch(0.73 0.025 240);
            max-width: 820px;
            font-size: 0.78rem;
            line-height: 1.45;
        }

        .command-row {
            display: flex;
            gap: 20px;
            align-items: center;
            flex-wrap: wrap;
        }

        .analyze-btn {
            background: var(--accent-gold);
            color: black;
            border: none;
            padding: 0 24px;
            font-weight: 1000;
            font-size: 0.7rem;
            height: 36px;
            min-height: 42px;
            border-radius: 12px;
            cursor: pointer;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            transition: all 0.2s;
        }

        .analyze-btn:hover {
            box-shadow: 0 0 15px oklch(0.85 0.15 80 / 0.4);
            transform: translateY(-1px);
        }

        .timeframe-block {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .timeframe-block > span {
            color: var(--text-muted);
            font-size: 0.62rem;
            font-weight: 1000;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .timeframe-selector {
            display: flex;
            background: oklch(0.08 0.01 240 / 0.88);
            border: 1px solid oklch(0.34 0.035 240);
            padding: 4px;
            border-radius: 12px;
            gap: 4px;
        }

        .tf-pill {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-size: 0.65rem;
            font-weight: 900;
            padding: 6px 14px;
            min-height: 40px;
            border-radius: 7px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .tf-pill.active { background: var(--accent-gold); color: black; box-shadow: 0 0 18px oklch(0.85 0.15 80 / 0.25); }

        .chart-error {
            padding: 12px 14px;
            color: oklch(0.88 0.18 55);
            border-color: oklch(0.88 0.18 55 / 0.35);
            background: oklch(0.88 0.18 55 / 0.08);
            font-size: 0.75rem;
            font-weight: 900;
        }

        .chart-overview {
            padding: 18px;
            border-color: oklch(from var(--chart-accent) l c h / 0.32);
            background:
                linear-gradient(135deg, oklch(from var(--chart-accent) l c h / 0.1), transparent 42%),
                oklch(0.12 0.018 240 / 0.96);
        }

        .chart-overview-main {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 18px;
            margin-bottom: 16px;
        }

        .chart-kicker {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--chart-accent);
            font-size: 0.62rem;
            font-weight: 1000;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin-bottom: 8px;
        }

        .chart-overview h2 {
            margin: 0;
            color: white;
            font-size: clamp(1.25rem, 2.4vw, 2rem);
            letter-spacing: -0.04em;
        }

        .chart-overview h2 span {
            color: var(--chart-accent);
            font-size: 0.7rem;
            letter-spacing: 0.12em;
            vertical-align: middle;
            margin-left: 8px;
        }

        .chart-overview p {
            max-width: 760px;
            color: oklch(0.72 0.025 240);
            font-size: 0.74rem;
            line-height: 1.55;
            margin: 8px 0 0;
        }

        .chart-sync-badge {
            border-radius: 999px;
            padding: 7px 10px;
            font-size: 0.58rem;
            font-weight: 1000;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            white-space: nowrap;
        }

        .chart-sync-badge.ok {
            color: black;
            background: var(--chart-accent);
        }

        .chart-stat-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
        }

        .chart-stat-card {
            min-width: 0;
            background: oklch(0.07 0.01 240 / 0.72);
            border: 1px solid oklch(1 0 0 / 0.08);
            border-radius: 12px;
            padding: 12px;
            box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.04);
        }

        .chart-stat-card span,
        .chart-stat-card small {
            display: block;
            color: var(--text-muted);
            font-size: 0.56rem;
            font-weight: 1000;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .chart-stat-card strong {
            display: block;
            color: white;
            font-size: 1.15rem;
            margin: 5px 0;
            font-variant-numeric: tabular-nums;
            overflow-wrap: anywhere;
        }

        .chart-stat-card.entry strong { color: #38bdf8; }
        .chart-stat-card.stop strong { color: var(--accent-rose); }
        .chart-stat-card.target strong { color: var(--accent-gold); }
        .stat-up { color: var(--accent-emerald) !important; }
        .stat-down { color: var(--accent-rose) !important; }

        .chart-controls-panel {
            display: grid;
            grid-template-columns: auto 1fr 1fr;
            gap: 14px;
            align-items: stretch;
            padding: 14px;
            background: oklch(0.115 0.016 240 / 0.96);
        }

        .control-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-width: 0;
        }

        .control-label {
            display: flex;
            align-items: center;
            gap: 7px;
            color: white;
            font-size: 0.6rem;
            font-weight: 1000;
            letter-spacing: 0.09em;
            text-transform: uppercase;
        }

        .chart-type-toggle {
            display: flex;
            border: 1px solid var(--border-tactical);
            border-radius: 10px;
            overflow: hidden;
            background: oklch(0.07 0.01 240);
        }

        .chart-type-toggle button {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-size: 0.65rem;
            font-weight: 900;
            padding: 8px 14px;
            min-height: 40px;
            cursor: pointer;
        }

        .chart-type-toggle button.active { background: var(--accent-emerald); color: black; }

        .indicator-matrix {
            display: flex;
            gap: 8px;
            overflow-x: auto;
            padding-bottom: 4px;
            mask-image: linear-gradient(to right, black 90%, transparent 100%);
        }

        .matrix-btn {
            background: oklch(0.2 0 0);
            border: 1px solid var(--border-tactical);
            color: var(--text-muted);
            font-size: 0.65rem;
            font-weight: 900;
            padding: 6px 12px;
            border-radius: 4px;
            white-space: nowrap;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }

        .matrix-btn:hover {
            background: oklch(0.25 0 0);
            transform: translateY(-1px);
        }

        .indicator-color {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
        }

        .matrix-btn.active.trend {
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
            background: oklch(0.75 0.2 200 / 0.1);
            box-shadow: 0 0 8px oklch(0.75 0.2 200 / 0.3);
        }
        .matrix-btn.active.vol {
            border-color: oklch(0.85 0.25 200);
            color: oklch(0.85 0.25 200);
            background: oklch(0.85 0.25 200 / 0.1);
            box-shadow: 0 0 8px oklch(0.85 0.25 200 / 0.3);
        }

        .chart-guide {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 1px;
            padding: 0;
            overflow: hidden;
            background: var(--border-tactical);
        }

        .chart-guide div {
            background: oklch(0.115 0.016 240);
            padding: 14px;
            min-width: 0;
        }

        .chart-guide svg {
            color: var(--accent-gold);
            margin-bottom: 8px;
        }

        .chart-guide strong {
            display: block;
            color: white;
            font-size: 0.68rem;
            font-weight: 1000;
            margin-bottom: 5px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .chart-guide span {
            display: block;
            color: oklch(0.7 0.02 240);
            font-size: 0.65rem;
            line-height: 1.45;
        }

        .compression-callout {
            padding: 14px 16px;
            background: oklch(0.85 0.25 200 / 0.045);
            border: 1px dashed oklch(0.85 0.25 200 / 0.3);
            border-left: 3px solid oklch(0.85 0.25 200);
            border-radius: 12px;
        }

        .compression-callout div {
            color: oklch(0.85 0.25 200);
            font-size: 0.62rem;
            font-weight: 1000;
            margin-bottom: 6px;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }

        .compression-callout p {
            color: white;
            font-size: 0.72rem;
            line-height: 1.55;
            margin: 0;
        }

        .search-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 370px;
            gap: 24px;
            align-items: start;
        }

        .charts-column { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
        
        .chart-wrapper.main-viz {
            height: 600px;
            padding: 0;
            overflow: hidden;
            border-color: oklch(0.34 0.035 240);
            box-shadow: 0 24px 80px oklch(0 0 0 / 0.38);
        }

        .legend-panel {
            background: oklch(0.12 0.01 240);
            border: 1px solid var(--border-tactical);
            border-radius: 12px;
            padding: 16px;
        }

        .legend-header { font-size: 0.65rem; font-weight: 1000; color: white; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; opacity: 0.8; }

        .conviction-panel { border-color: oklch(from var(--accent-color) l c h / 0.5) !important; box-shadow: 0 0 30px -10px oklch(from var(--accent-color) l c h / 0.2); }

        .report-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        .report-header > div:first-child {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
        }

        .report-header small {
            color: var(--text-muted);
            font-size: 0.56rem;
            font-weight: 800;
            letter-spacing: 0;
            text-transform: none;
            line-height: 1.35;
        }

        .report-sync-pill {
            border-radius: 999px;
            padding: 5px 8px;
            font-size: 0.52rem;
            font-weight: 1000;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            white-space: nowrap;
        }

        .report-sync-pill.ok {
            color: black;
            background: var(--accent-color);
        }

        .report-sync-pill.warn {
            color: oklch(0.88 0.18 70);
            background: oklch(0.88 0.18 70 / 0.1);
            border: 1px solid oklch(0.88 0.18 70 / 0.28);
        }

        .report-sync-pill.neutral {
            color: var(--text-muted);
            background: oklch(0.2 0 0);
            border: 1px solid var(--border-tactical);
        }
        
        .verdict-hero {
            padding: 24px;
            background: oklch(from var(--accent-color) l c h / 0.05);
            text-align: center;
            border-bottom: 1px solid var(--border-tactical);
        }

        .v-header {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .v-label { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.2em; }
        .v-value { font-size: 1.25rem; font-weight: 1000; letter-spacing: 0.02em; }
        .v-meta { display: flex; justify-content: center; gap: 12px; margin-top: 12px; font-size: 0.6rem; align-items: center; }
        
        .verdict-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: oklch(from var(--accent-color) l c h / 0.1);
        }

        .screener-sync-panel {
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-tactical);
            background:
                linear-gradient(135deg, oklch(from var(--accent-color) l c h / 0.11), transparent 46%),
                oklch(0.08 0 0 / 0.76);
        }

        .sync-title-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: center;
            margin-bottom: 8px;
        }

        .sync-title {
            display: flex;
            align-items: center;
            gap: 7px;
            color: white;
            font-size: 0.62rem;
            font-weight: 1000;
            letter-spacing: 0.08em;
        }

        .sync-badge {
            color: black;
            background: var(--accent-color);
            border-radius: 999px;
            padding: 4px 8px;
            font-size: 0.52rem;
            font-weight: 1000;
            white-space: nowrap;
        }

        .sync-vector {
            color: var(--accent-color);
            font-size: 0.58rem;
            font-weight: 900;
            letter-spacing: 0.08em;
            margin-bottom: 12px;
            overflow-wrap: anywhere;
        }

        .sync-ok {
            border-radius: 8px;
            padding: 8px 10px;
            margin-bottom: 10px;
            font-size: 0.62rem;
            font-weight: 900;
            line-height: 1.45;
            color: oklch(0.78 0.2 150);
            background: oklch(0.78 0.2 150 / 0.1);
            border: 1px solid oklch(0.78 0.2 150 / 0.22);
        }

        .execution-plan {
            padding: 18px 20px;
            border-bottom: 1px solid var(--border-tactical);
            background: oklch(from var(--plan-color) l c h / 0.045);
        }

        .execution-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 14px;
        }

        .execution-kicker {
            font-size: 0.52rem;
            color: var(--text-muted);
            font-weight: 1000;
            letter-spacing: 0.16em;
            margin-bottom: 4px;
        }

        .execution-state {
            color: var(--plan-color);
            font-size: 0.82rem;
            font-weight: 1000;
            letter-spacing: 0.04em;
        }

        .execution-rr {
            text-align: right;
            color: var(--plan-color);
            font-variant-numeric: tabular-nums;
        }

        .execution-rr span {
            display: block;
            font-size: 1rem;
            font-weight: 1000;
        }

        .execution-rr small {
            display: block;
            font-size: 0.5rem;
            color: var(--text-muted);
            margin-top: 2px;
        }

        .execution-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 12px;
        }

        .execution-cell {
            background: oklch(0.08 0 0 / 0.72);
            border: 1px solid oklch(from var(--plan-color) l c h / 0.18);
            border-radius: 6px;
            padding: 8px;
            min-width: 0;
        }

        .execution-cell span {
            display: block;
            font-size: 0.5rem;
            color: var(--text-muted);
            font-weight: 1000;
            margin-bottom: 4px;
        }

        .execution-cell strong {
            display: block;
            color: white;
            font-size: 0.68rem;
            font-variant-numeric: tabular-nums;
            overflow-wrap: anywhere;
        }

        .pivots-panel { padding: 0; }
        
        .pivots-list { padding: 12px; }
        
        .pivot-row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 0.7rem; border-bottom: 1px solid oklch(0.2 0 0); }
        
        .pivot-row:last-child { border-bottom: none; }
        
        .pivot-row.pos { color: var(--accent-emerald); }
        
        .pivot-row.neg { color: var(--accent-rose); }
        
        .pivot-row.base { background: oklch(0.2 0 0); color: var(--accent-cyan); font-weight: 1000; }

        @media (max-width: 1024px) {
            .search-grid { grid-template-columns: minmax(0, 1fr); }
            .chart-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .chart-controls-panel { grid-template-columns: 1fr; }
            .chart-guide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .chart-wrapper.main-viz { height: 500px; }
            .command-row.main { flex-direction: column; align-items: stretch; }
            .timeframe-block { align-items: stretch; flex-direction: column; }
            .timeframe-selector,
            .chart-type-toggle,
            .indicator-matrix {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }
        }

        @media (max-width: 640px) {
            .search-container { padding: 10px 0 0; gap: 12px; }
            .command-center { padding: 12px; gap: 12px; }
            .command-row { gap: 10px; }
            .command-copy h1 { font-size: 1.5rem; }
            .command-copy p { font-size: 0.75rem; }
            .timeframe-selector { width: 100%; justify-content: flex-start; }
            .tf-pill { flex: 1 0 auto; padding: 9px 14px; }
            .chart-overview { padding: 14px; }
            .chart-overview-main { flex-direction: column; gap: 12px; }
            .chart-sync-badge { align-self: flex-start; }
            .chart-stat-grid { grid-template-columns: 1fr; }
            .chart-stat-card strong { font-size: 1rem; }
            .chart-type-toggle { width: 100%; }
            .chart-type-toggle button { flex: 1; justify-content: center; }
            .chart-controls-panel { padding: 12px; }
            .indicator-matrix { margin-inline: -12px; padding-inline: 12px; }
            .chart-guide { grid-template-columns: 1fr; }
            .chart-guide div { padding: 12px; }
            .v-value { font-size: 1.1rem; }
            .v-meta { flex-direction: column; gap: 6px; }
            .report-header { align-items: flex-start; flex-direction: column; }
            .report-sync-pill { align-self: flex-start; }
            .sync-grid { grid-template-columns: 1fr; }
            .chart-wrapper.main-viz { height: 470px; }
            .legend-grid, .insight-grid { grid-template-columns: 1fr; }
            .pivots-panel, .historical-signals-section { padding: 14px; }
            .sig-item, .pivot-row, .flow-item { gap: 10px; }
            .execution-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 420px) {
            .chart-wrapper.main-viz { height: 430px; }
        }
      `}</style>
    </div>
  );
}
