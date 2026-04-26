"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AdvancedChart from "@/components/AdvancedChart";
import { Search } from "lucide-react";

export default function SearchPage() {
  return (
    <Suspense fallback={
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="skeleton-shimmer" style={{ height: '40px', borderRadius: '8px', width: '200px' }}></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
                <div className="skeleton-shimmer" style={{ height: '500px', borderRadius: '12px' }}></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="skeleton-shimmer" style={{ height: '300px', borderRadius: '12px' }}></div>
                    <div className="skeleton-shimmer" style={{ height: '200px', borderRadius: '12px' }}></div>
                </div>
            </div>
        </div>
    }>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const querySymbol = searchParams.get("symbol");
  const queryInterval = searchParams.get("interval") || "1d";

  const [symbol, setSymbol] = useState(querySymbol || "BBCA.JK");
  const [input, setInput] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [interval, setInterval] = useState(queryInterval);
  
  const [showSuperTrend] = useState(false);
  const [showBB, setShowBB] = useState(true);
  const [showMFI, setShowMFI] = useState(true);
  const [showVWAP, setShowVWAP] = useState(false);
  const [showOBV, setShowOBV] = useState(false);
  const [showCMF, setShowCMF] = useState(false);
  
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA10, setShowEMA10] = useState(false);
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(false);
  const [showEMA60, setShowEMA60] = useState(true);
  const [showEMA200, setShowEMA200] = useState(false);
  const [showSqueezeDeluxe, setShowSqueezeDeluxe] = useState(false);

  const fetchTechnical = async (ticker: string, timeframe: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/technical?symbol=${ticker}&interval=${timeframe}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error || "Failed to fetch data");
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (querySymbol) {
        setSymbol(querySymbol);
    }
  }, [querySymbol]);

  useEffect(() => {
    console.log(`[SYSTEM] FETCHING_DATA symbol=${symbol} interval=${interval}`);
    fetchTechnical(symbol, interval);
  }, [symbol, interval]);

  useEffect(() => {
    if (data) console.log("[SYSTEM] DATA_LOADED success:", data.success);
    if (error) console.log("[SYSTEM] FETCH_ERROR:", error);
  }, [data, error]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      let ticker = input.trim().toUpperCase();
      if (!ticker.includes(".") && !ticker.startsWith("^")) {
        ticker += ".JK";
      }
      setSymbol(ticker);
    }
  };

  return (
    <div style={{ padding: '16px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* IMPROVED HEADER: COMMAND CENTER */}
      <div className="command-center">
        <div className="command-group main-controls">
            <form onSubmit={handleSearch} className="search-form-premium">
                <Search className="search-icon" size={16} />
                <input 
                    className="input-premium" 
                    placeholder="TICKER_ID..." 
                    value={input}
                    onChange={e => setInput(e.target.value)}
                />
                <button className="button-run" type="submit" disabled={loading}>
                    {loading ? "SYNC..." : "ANALYZE"}
                </button>
            </form>

            <div className="timeframe-pill">
                {['15m', '1h', '4h', '1d'].map(tf => (
                    <button 
                        key={tf} 
                        className={`pill-item ${interval === tf ? 'active' : ''}`}
                        onClick={() => setInterval(tf)}
                    >
                        {tf.toUpperCase()}
                    </button>
                ))}
            </div>
        </div>

        <div className="command-group chart-controls">
            <div className="toggle-group">
                <button className={`toggle-item ${chartType === 'candle' ? 'active' : ''}`} onClick={() => setChartType('candle')}>CANDLE</button>
                <button className={`toggle-item ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>LINE</button>
            </div>

            <div className="indicator-matrix">
                <button className={`matrix-item trend ${showEMA9 ? 'active' : ''}`} onClick={() => setShowEMA9(!showEMA9)}>E9</button>
                <button className={`matrix-item trend ${showEMA10 ? 'active' : ''}`} onClick={() => setShowEMA10(!showEMA10)}>E10</button>
                <button className={`matrix-item trend ${showEMA20 ? 'active' : ''}`} onClick={() => setShowEMA20(!showEMA20)}>E20</button>
                <button className={`matrix-item trend ${showEMA60 ? 'active' : ''}`} onClick={() => setShowEMA60(!showEMA60)}>E60</button>
                <button className={`matrix-item trend ${showEMA50 ? 'active' : ''}`} onClick={() => setShowEMA50(!showEMA50)}>E50</button>
                <button className={`matrix-item trend ${showEMA200 ? 'active' : ''}`} onClick={() => setShowEMA200(!showEMA200)}>E200</button>
                <button 
                  className={`matrix-item vol ${showSqueezeDeluxe ? 'active' : ''}`} 
                  style={{ borderColor: showSqueezeDeluxe ? 'oklch(0.85 0.25 200)' : '' }}
                  onClick={() => setShowSqueezeDeluxe(!showSqueezeDeluxe)}
                >
                  SQZ_DELUXE
                </button>
                <button className={`matrix-item vol ${showBB ? 'active' : ''}`} onClick={() => setShowBB(!showBB)}>BB</button>
                <button className={`matrix-item vol ${showMFI ? 'active' : ''}`} onClick={() => setShowMFI(!showMFI)}>MFI</button>
                <button className={`matrix-item vol ${showVWAP ? 'active' : ''}`} onClick={() => setShowVWAP(!showVWAP)}>VWAP</button>
                <button className={`matrix-item vol ${showOBV ? 'active' : ''}`} onClick={() => setShowOBV(!showOBV)}>OBV</button>
                <button className={`matrix-item vol ${showCMF ? 'active' : ''}`} onClick={() => setShowCMF(!showCMF)}>CMF</button>
            </div>
        </div>
      </div>

      <style jsx>{`
        .command-center {
            margin-bottom: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 12px;
            background: oklch(0.15 0 0);
            border: 1px solid var(--border-color);
        }
        .command-group {
            display: flex;
            gap: 12px;
            align-items: center;
            flex-wrap: wrap;
        }
        .search-form-premium {
            display: flex;
            background: oklch(0.1 0 0);
            border: 1px solid var(--border-color);
            padding: 2px;
            width: 100%;
            max-width: 320px;
            align-items: center;
        }
        .search-icon {
            margin: 0 12px;
            color: var(--text-secondary);
        }
        .input-premium {
            background: transparent;
            border: none;
            color: var(--text-primary);
            font-family: var(--font-mono);
            font-size: 0.8rem;
            flex: 1;
            outline: none;
            padding: 8px 0;
        }
        .button-run {
            background: var(--accent-green);
            color: black;
            border: none;
            padding: 0 16px;
            font-family: var(--font-mono);
            font-size: 0.7rem;
            font-weight: 900;
            cursor: pointer;
            height: 32px;
        }
        .timeframe-pill {
            display: flex;
            background: oklch(0.2 0 0);
            padding: 4px;
            border-radius: 20px;
            gap: 4px;
        }
        .pill-item {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            font-size: 0.65rem;
            font-weight: 800;
            padding: 4px 12px;
            border-radius: 16px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .pill-item.active {
            background: oklch(0.3 0 0);
            color: var(--text-primary);
        }
        .toggle-group {
            display: flex;
            border: 1px solid var(--border-color);
        }
        .toggle-item {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            font-size: 0.65rem;
            font-weight: 700;
            padding: 6px 12px;
            cursor: pointer;
        }
        .toggle-item.active {
            background: var(--accent-green);
            color: black;
        }
        .indicator-matrix {
            display: flex;
            gap: 6px;
            align-items: center;
            flex-wrap: wrap;
        }
        .matrix-item {
            background: oklch(0.2 0 0);
            border: 1px solid oklch(0.3 0 0);
            color: var(--text-secondary);
            font-size: 0.6rem;
            font-weight: 800;
            padding: 6px 10px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }
        .matrix-item:hover {
            border-color: oklch(0.5 0 0);
        }
        .matrix-item.active.trend {
            border-color: #2962FF;
            color: #2962FF;
            background: rgba(41, 98, 255, 0.1);
        }
        .matrix-item.active.vol {
            border-color: var(--accent-amber);
            color: var(--accent-amber);
            background: rgba(255, 193, 7, 0.05);
        }
        .matrix-divider {
            width: 1px;
            height: 16px;
            background: oklch(0.3 0 0);
            margin: 0 4px;
        }
        .search-grid-layout {
            display: grid;
            grid-template-columns: 1fr 320px;
            gap: 20px;
        }
        .verdict-badge {
            padding: 16px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        .verdict-title {
            font-size: 0.6rem;
            letter-spacing: 0.2em;
            opacity: 0.7;
            margin-bottom: 4px;
        }
        .verdict-value {
            font-size: 1.1rem;
            font-weight: 900;
            letter-spacing: 0.05em;
        }
        .suggestion-box {
            font-size: 0.75rem;
            line-height: 1.6;
            padding: 12px;
            background: oklch(1 0 0 / 0.02);
            border-left: 2px solid var(--accent-green);
        }
        .metric-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .metric-label {
            font-size: 0.65rem;
            font-weight: 700;
            color: var(--text-secondary);
        }
        .metric-bar-bg {
            height: 8px;
            background: oklch(0.2 0 0);
            margin-top: 8px;
            position: relative;
            border: 1px solid oklch(0.3 0 0);
        }
        .metric-bar-fill {
            height: 100%;
            transition: width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .metric-label-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }
        .metric-value {
            font-family: var(--font-mono);
            font-size: 0.75rem;
            font-weight: 800;
            font-variant-numeric: tabular-nums;
        }

        /* IMPECCABLE LEGEND SYSTEM */
        .legend-panel {
            background: oklch(0.18 0 0);
            border: 1px solid oklch(0.28 0 0);
            margin-bottom: 20px;
            padding: 16px;
            font-family: var(--font-mono);
            position: relative;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .legend-panel::after {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
            background-size: 100% 2px, 3px 100%;
            pointer-events: none;
            opacity: 0.1;
        }
        .terminal-prompt {
            color: var(--accent-green);
            margin-right: 4px;
        }
        
        .legend-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            border-bottom: 1px solid oklch(0.28 0 0);
            padding-bottom: 8px;
        }
        .legend-title { font-size: 0.7rem; font-weight: 800; color: var(--text-primary); }
        .legend-sub { font-size: 0.55rem; color: var(--text-secondary); opacity: 0.5; }
        
        .legend-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }
        .legend-item { display: flex; flex-direction: column; gap: 4px; }
        .legend-label {
            font-size: 0.6rem;
            font-weight: 900;
            padding: 2px 6px;
            width: fit-content;
        }
        .label-flux { background: oklch(0.82 0.18 145 / 0.1); color: var(--accent-green); border: 1px solid var(--accent-green); }
        .label-squeeze { background: oklch(0.85 0.15 80 / 0.1); color: var(--accent-amber); border: 1px solid var(--accent-amber); }
        .label-momentum { background: rgba(41, 98, 255, 0.1); color: #2962FF; border: 1px solid #2962FF; }
        .label-divergence { background: rgba(255, 109, 0, 0.1); color: #ff6d00; border: 1px solid #ff6d00; }
        
        .legend-desc { font-size: 0.6rem; color: var(--text-secondary); line-height: 1.3; }
        
        .squeeze-dots { display: flex; gap: 4px; margin-top: 2px; }
        .dot { width: 6px; height: 6px; }
        .dot-high { background: oklch(0.62 0.22 25); box-shadow: 0 0 6px oklch(0.62 0.22 25 / 0.5); }
        .dot-mid { background: #ff5e00; box-shadow: 0 0 6px rgba(255, 94, 0, 0.5); }
        .dot-low { background: oklch(0.85 0.15 80); box-shadow: 0 0 6px oklch(0.85 0.15 80 / 0.5); }

        @media (max-width: 1200px) {
            .search-grid-layout {
                grid-template-columns: 1fr;
            }
        }
      `}</style>

      {error && (
        <div style={{ padding: '12px', background: 'oklch(0.2 0.1 20)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', marginBottom: '24px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          ERROR_TRAP: {error}
        </div>
      )}

      {data && (
        <div className="search-grid-layout">
          <div className="charts-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {showSqueezeDeluxe && (
                <div className="legend-panel">
                    <div className="legend-header">
                        <span className="legend-title"><span className="terminal-prompt">CMD&gt;</span> INDICATOR_GUIDE // SQZ_DELUXE</span>
                        <span className="legend-sub">Terminal Engine Reference v1.4.2</span>
                    </div>
                    <div className="legend-grid">
                        <div className="legend-item">
                            <span className="legend-label label-flux">FLUX</span>
                            <span className="legend-desc"><strong>Directional Flow:</strong> Mengukur tekanan aliran dana. 
                                <br/>• 🟢 <strong>Bullish:</strong> Positif & Menguat.
                                <br/>• 🟡 <strong>Caution:</strong> Positif tapi Melemah.
                                <br/>• 🔵 <strong>Recovering:</strong> Negatif tapi Menguat (Absorption).
                                <br/>• 🔴 <strong>Bearish:</strong> Negatif & Melemah.
                            </span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-label label-squeeze">SQUEEZE</span>
                            <div className="squeeze-dots">
                                <span className="dot dot-high"></span>
                                <span className="dot dot-low"></span>
                                <span className="dot dot-mid"></span>
                            </div>
                            <span className="legend-desc"><strong>Volatility Squeeze:</strong> Menunjukkan fase konsolidasi ketat sesuai rumus EliCobra (Red=High, Orange=Mid, Yellow=Low). Saat tidak ada titik, volatilitas sedang ekspansi atau netral.</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-label label-momentum">MOMENTUM</span>
                            <span className="legend-desc"><strong>Momentum Histogram:</strong> Turunan Linear Regression dari harga terhadap volatilitas. Area biru/terang menunjukkan penguatan tren, area gelap menunjukkan pelemahan.</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-label label-divergence">D +/- [DIV]</span>
                            <span className="legend-desc"><strong>Divergence:</strong> D+ menandai bullish divergence, D- menandai bearish divergence dari cross Momentum terhadap Signal.</span>
                        </div>
                    </div>
                </div>
            )}
            <div className="scanline-container panel" style={{ padding: 0 }}>
                <AdvancedChart 
                    key={`main-${symbol}-${interval}-${showEMA9}-${showEMA10}-${showEMA20}-${showEMA50}-${showEMA60}-${showEMA200}-${showSqueezeDeluxe}-${showBB}-${showMFI}-${showVWAP}-${showOBV}-${showCMF}`}
                    data={data.data} 
                    pivots={data.pivots} 
                    elliott={data.elliott}
                    wavePivots={data.wavePivots}
                    ticker={data.ticker} 
                    showSuperTrend={showSuperTrend}
                    showBB={showBB}
                    showMFI={showMFI}
                    showVWAP={showVWAP}
                    showOBV={showOBV}
                    showCMF={showCMF}
                    chartType={chartType}
                    showEMA9={showEMA9}
                    showEMA20={showEMA20}
                    showEMA50={showEMA50}
                    showEMA60={showEMA60}
                    showEMA200={showEMA200}
                    showEMA10={showEMA10}
                    showSqueezeDeluxe={showSqueezeDeluxe}
                />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* UNIFIED CONVICTION - PREMIUM VISUALS */}
            <div 
              className="panel" 
              style={{ 
                border: `1px solid ${data.unifiedAnalysis?.color || 'var(--border-color)'}`, 
                padding: 0,
                boxShadow: `0 0 40px -15px ${data.unifiedAnalysis?.color}44`,
                transition: 'all 0.5s ease-in-out'
              }}
            >
              <div className="panel-header" style={{ background: 'oklch(0.15 0 0)', borderBottom: `1px solid ${data.unifiedAnalysis?.color}44` }}>
                <span style={{ color: data.unifiedAnalysis?.color, fontWeight: '800' }}>CONVICTION_REPORT</span>
              </div>
              
              {data.unifiedAnalysis && (
                <div style={{ padding: '16px' }}>
                    <div className="verdict-badge animate-pulse-gentle" style={{ backgroundColor: `${data.unifiedAnalysis.color}08`, border: `1px solid ${data.unifiedAnalysis.color}33` }}>
                        <div className="verdict-title">CONVICTION_VERDICT</div>
                        <div className={`verdict-value ${data.unifiedAnalysis.color.includes('green') || data.unifiedAnalysis.color.includes('200') || data.unifiedAnalysis.color.includes('150') ? 'positive' : (data.unifiedAnalysis.color.includes('red') || data.unifiedAnalysis.color.includes('20') ? 'negative' : '')}`} style={{ color: data.unifiedAnalysis.color }}>
                            {data.unifiedAnalysis.verdict}
                        </div>
                        <div style={{ fontSize: '0.6rem', marginTop: '8px', color: 'var(--text-secondary)' }}>RISK_LEVEL: <span style={{ color: 'var(--text-primary)', fontWeight: '800' }}>{data.unifiedAnalysis.riskLevel}</span></div>
                    </div>

                    {data.unifiedAnalysis.tradePlan && (() => {
                        const plan = data.unifiedAnalysis.tradePlan;
                        const actionColor = plan.action.includes('BUY')
                            ? 'var(--accent-green)'
                            : plan.action.includes('SELL')
                                ? 'var(--accent-red)'
                                : 'var(--accent-amber)';

                        return (
                            <div style={{ marginTop: '16px', padding: '12px', background: `${actionColor}08`, border: `1px solid ${actionColor}55`, borderLeft: `3px solid ${actionColor}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: '900', letterSpacing: '0.1em' }}>EXECUTION_TIMING</div>
                                    <div style={{ color: actionColor, fontSize: '0.72rem', fontWeight: '900', textAlign: 'right' }}>{plan.action}</div>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', lineHeight: '1.55', fontFamily: 'var(--font-mono)', marginBottom: '12px' }}>
                                    {plan.timing}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
                                    {[
                                        ['ENTRY_ZONE', plan.entryZone],
                                        ['IDEAL_BUY', plan.idealBuy ?? '-'],
                                        ['STOP_LOSS', plan.stopLoss],
                                        ['TAKE_PROFIT', plan.takeProfit],
                                    ].map(([label, value]) => (
                                        <div key={label} style={{ padding: '8px', background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.25 0 0)', minWidth: 0 }}>
                                            <div style={{ fontSize: '0.52rem', color: 'var(--text-secondary)', fontWeight: '900', marginBottom: '4px' }}>{label}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: '900', wordBreak: 'break-word' }}>{String(value)}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: '1.5', fontFamily: 'var(--font-mono)' }}>
                                    <div><span style={{ color: actionColor, fontWeight: '900' }}>REASON:</span> {plan.reason}</div>
                                    <div style={{ marginTop: '6px' }}><span style={{ color: 'var(--accent-red)', fontWeight: '900' }}>INVALID:</span> {plan.invalidation}</div>
                                    {plan.waitReasons?.length > 0 && (
                                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {plan.waitReasons.map((reason: string, idx: number) => (
                                                <div key={`${idx}-${reason}`} style={{ paddingLeft: '8px', borderLeft: `1px solid ${actionColor}66` }}>{idx + 1}. {reason}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {showSqueezeDeluxe && data.unifiedAnalysis.squeezeInsight && (
                        <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(255, 235, 59, 0.03)', border: '1px dashed oklch(0.85 0.25 200 / 0.3)', borderLeft: '3px solid oklch(0.85 0.25 200)' }}>
                            <div style={{ fontSize: '0.6rem', color: 'oklch(0.85 0.25 200)', fontWeight: '900', marginBottom: '6px', letterSpacing: '0.1em' }}>COMPRESSION_INSIGHT</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', lineHeight: '1.5', fontFamily: 'var(--font-mono)' }}>
                                {data.unifiedAnalysis.squeezeInsight}
                            </div>
                        </div>
                    )}

                    <div className="suggestion-box" style={{ marginTop: '16px', borderLeftColor: data.unifiedAnalysis.color }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: '900', marginBottom: '6px', letterSpacing: '0.1em' }}>STRATEGIC_CONCLUSION</div>
                        {data.unifiedAnalysis.suggestion}
                    </div>

                    {data.elliott && data.elliott.interpretation && (
                        <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(38, 166, 154, 0.03)', border: '1px dashed oklch(0.5 0.2 180 / 0.3)', borderLeft: '3px solid oklch(0.5 0.2 180)' }}>
                            <div style={{ fontSize: '0.6rem', color: 'oklch(0.5 0.2 180)', fontWeight: '900', marginBottom: '6px', letterSpacing: '0.1em' }}>ELLIOTT_WAVE_PROJECTION</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', lineHeight: '1.5', fontFamily: 'var(--font-mono)' }}>
                                {data.elliott.interpretation}
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: '20px' }}>
                        <div className="metric-row-container">
                            <div className="metric-label-container">
                                <div className="metric-label">SETUP_QUALITY</div>
                                <div className="metric-value" style={{ color: data.unifiedAnalysis.color }}>{data.unifiedAnalysis.score.setup}%</div>
                            </div>
                            <div className="metric-bar-bg">
                                <div className="metric-bar-fill" style={{ width: `${data.unifiedAnalysis.score.setup}%`, backgroundColor: data.unifiedAnalysis.color, boxShadow: `0 0 12px ${data.unifiedAnalysis.color}66`, transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)' }}></div>
                            </div>
                        </div>
                        <div className="metric-row-container" style={{ marginTop: '16px' }}>
                            <div className="metric-label-container">
                                <div className="metric-label">VOLUME_CONVICTION</div>
                                <div className="metric-value" style={{ color: data.unifiedAnalysis.color }}>{data.unifiedAnalysis.score.volume.toFixed(0)}%</div>
                            </div>
                            <div className="metric-bar-bg">
                                <div className="metric-bar-fill" style={{ width: `${data.unifiedAnalysis.score.volume}%`, backgroundColor: data.unifiedAnalysis.color, boxShadow: `0 0 12px ${data.unifiedAnalysis.color}66`, transition: 'width 1s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)' }}></div>
                            </div>
                            
                            {/* Detailed Volume Checklist */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '12px' }}>
                                {data.unifiedAnalysis.volDetails && Object.entries(data.unifiedAnalysis.volDetails).map(([key, ok]: any) => (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.55rem', opacity: ok ? 1 : 0.4 }}>
                                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: ok ? 'var(--accent-green)' : 'var(--text-secondary)' }}></div>
                                        <span style={{ color: ok ? 'var(--text-primary)' : 'var(--text-secondary)', textTransform: 'uppercase' }}>{key}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panel-header">PIVOT_TARGETS [WIB]</div>
              <div className="table-container" style={{ border: 'none' }}>
                <table style={{ width: '100%', fontSize: '0.7rem' }}>
                  <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <tr><td>T2_RESISTANCE</td><td className="positive" style={{ textAlign: 'right', fontWeight: '800' }}>{data.pivots.r3.toFixed(0)}</td></tr>
                    <tr><td>T1_RESISTANCE</td><td className="positive" style={{ textAlign: 'right', fontWeight: '800' }}>{data.pivots.r2.toFixed(0)}</td></tr>
                    <tr style={{ background: 'oklch(0.25 0 0)' }}><td style={{ color: 'var(--accent-green)' }}>BASE_PIVOT</td><td style={{ textAlign: 'right', color: 'var(--accent-green)', fontWeight: '800' }}>{data.pivots.p.toFixed(0)}</td></tr>
                    <tr><td>S1_SUPPORT</td><td className="negative" style={{ textAlign: 'right' }}>{data.pivots.s1.toFixed(0)}</td></tr>
                    <tr><td>S2_SUPPORT</td><td className="negative" style={{ textAlign: 'right' }}>{data.pivots.s2.toFixed(0)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
                <div className="panel-header">INTERNAL_FLOW_METRICS</div>
                <div className="json-box" style={{ fontSize: '0.65rem', border: 'none', background: 'transparent' }}>
                    {data.unifiedAnalysis && Object.entries(data.unifiedAnalysis.details).map(([key, val]: any) => {
                        const sVal = String(val);
                        let color = 'var(--text-primary)';
                        
                        if (sVal.includes('BULLISH') || sVal.includes('Rising') || sVal.includes('Above') || sVal.includes('Healthy') || sVal.includes('Strong')) {
                            color = 'var(--accent-green)';
                        } else if (sVal.includes('BEARISH') || sVal.includes('Falling') || sVal.includes('Below')) {
                            color = 'var(--accent-red)';
                        } else if (sVal.includes('CAUTION') || sVal.includes('Neutral')) {
                            color = 'var(--accent-amber)';
                        } else if (sVal.includes('RECOVERING')) {
                            color = 'oklch(0.85 0.2 200)'; // Light Blue/Cyan for absorption
                        }

                        return (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid oklch(0.25 0 0)' }}>
                                <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{key}</span>
                                <span style={{ fontWeight: '800', color }}>{sVal}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
