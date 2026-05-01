"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AdvancedChart from "@/components/AdvancedChart";
import { Search, TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react";

const formatPrice = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("id-ID", { maximumFractionDigits: 0 }) : "-";
};

const formatPct = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "-";
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatSignalLabel = (value?: string) => String(value || "TECHNICAL").replace(/_/g, " ");

export default function SearchPage() {
  return (
    <Suspense fallback={
        <div className="loading-fallback">
            <div className="skeleton shimmer-panel h-40 w-200"></div>
            <div className="skeleton-grid">
                <div className="skeleton shimmer-panel h-600"></div>
                <div className="skeleton-sidebar">
                    <div className="skeleton shimmer-panel h-300"></div>
                    <div className="skeleton shimmer-panel h-200"></div>
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
  const [showSqueezeDeluxe, setShowSqueezeDeluxe] = useState(true);
  const screenerContext = data?.screenerContext || data?.unifiedAnalysis?.screenerContext;
  const activeScreenerSignals = data?.activeScreenerSignals || data?.unifiedAnalysis?.activeScreenerSignals || [];
  const executionPlan = data?.unifiedAnalysis?.screenerTradePlan || data?.unifiedAnalysis?.tradePlan;

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
    fetchTechnical(symbol, interval);
  }, [symbol, interval]);

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
    <div className="search-root min-h-screen bg-[#050505] text-silver-300 font-mono">
      
      <main className="search-container">
        {/* COMMAND CENTER */}
        <div className="command-center panel">
          <div className="command-row main">
            <form onSubmit={handleSearch} className="search-box-premium">
              <Search className="search-icon" size={16} />
              <input 
                className="input-premium" 
                placeholder="TICKER_ID..." 
                value={input}
                onChange={e => setInput(e.target.value)}
              />
              <button className="analyze-btn" type="submit" disabled={loading}>
                {loading ? "SYNC..." : "ANALYZE"}
              </button>
            </form>

            <div className="timeframe-selector">
                {['15m', '1h', '4h', '1d'].map(tf => (
                    <button 
                        key={tf} 
                        className={`tf-pill ${interval === tf ? 'active' : ''}`}
                        onClick={() => setInterval(tf)}
                    >
                        {tf.toUpperCase()}
                    </button>
                ))}
            </div>
        </div>

        </div>

        {data && data.data && (
            <div className="search-grid">
                <div className="charts-column">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="chart-type-toggle">
                            <button className={`${chartType === 'candle' ? 'active' : ''}`} onClick={() => setChartType('candle')}>
                                <span className="toggle-icon">🕯️</span>
                                CANDLE
                            </button>
                            <button className={`${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>
                                <span className="toggle-icon">📈</span>
                                LINE
                            </button>
                        </div>

                        <div className="indicator-matrix">
                            <button className={`matrix-btn trend ${showEMA9 ? 'active' : ''}`} onClick={() => setShowEMA9(!showEMA9)}>
                                <span className="indicator-color" style={{ backgroundColor: '#3b82f6' }}></span>
                                EMA 9
                            </button>
                            <button className={`matrix-btn trend ${showEMA20 ? 'active' : ''}`} onClick={() => setShowEMA20(!showEMA20)}>
                                <span className="indicator-color" style={{ backgroundColor: '#f59e0b' }}></span>
                                EMA 20
                            </button>
                            <button className={`matrix-btn trend ${showEMA60 ? 'active' : ''}`} onClick={() => setShowEMA60(!showEMA60)}>
                                <span className="indicator-color" style={{ backgroundColor: '#8b5cf6' }}></span>
                                EMA 60
                            </button>
                            <button className={`matrix-btn trend ${showEMA200 ? 'active' : ''}`} onClick={() => setShowEMA200(!showEMA200)}>
                                <span className="indicator-color" style={{ backgroundColor: '#ec4899' }}></span>
                                EMA 200
                            </button>
                            <button className={`matrix-btn vol ${showSqueezeDeluxe ? 'active' : ''}`} onClick={() => setShowSqueezeDeluxe(!showSqueezeDeluxe)}>
                                <span className="indicator-color" style={{ backgroundColor: '#fbbf24' }}></span>
                                SQZ DLX
                            </button>
                        </div>
                    </div>

                    <div className="chart-wrapper main-viz panel" style={{ padding: 0, height: "auto", overflow: "visible" }}>
                        <AdvancedChart 
                            key={`main-${symbol}-${interval}-${showEMA9}-${showEMA10}-${showEMA20}-${showEMA50}-${showEMA60}-${showEMA200}-${showSqueezeDeluxe}-${showBB}-${showMFI}-${showVWAP}-${showOBV}-${showCMF}`}
                            data={data.data} 
                            pivots={data.pivots} 
                            riskPlan={executionPlan}
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

                    {showSqueezeDeluxe && data.unifiedAnalysis?.squeezeInsight && (
                        <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(255, 235, 59, 0.03)', border: '1px dashed oklch(0.85 0.25 200 / 0.3)', borderLeft: '3px solid oklch(0.85 0.25 200)' }}>
                            <div style={{ fontSize: '0.6rem', color: 'oklch(0.85 0.25 200)', fontWeight: '900', marginBottom: '6px', letterSpacing: '0.1em' }}>COMPRESSION_INSIGHT</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', lineHeight: '1.5', fontFamily: 'var(--font-mono)' }}>
                                {data.unifiedAnalysis.squeezeInsight}
                            </div>
                        </div>
                    )}
                </div>

            {/* RIGHT COLUMN: ANALYSIS */}
            <div className="analysis-column">
              {data.unifiedAnalysis && (
                <div className="conviction-panel panel" style={{ '--accent-color': data.unifiedAnalysis.color } as any}>
                  <div className="panel-header">CONVICTION_REPORT</div>
                  
                  <div className="verdict-hero">
                    <div className="v-header">
  <div className="v-label">CONVICTION_VERDICT</div>
  <div className="verdict-icon">
    {data.unifiedAnalysis.verdict.includes('BUY') || data.unifiedAnalysis.verdict.includes('BULLISH') ? (
      <TrendingUp size={20} />
    ) : data.unifiedAnalysis.verdict.includes('SELL') || data.unifiedAnalysis.verdict.includes('BEARISH') ? (
      <TrendingDown size={20} />
    ) : (
      <AlertTriangle size={20} />
    )}
  </div>
</div>
                    <div className="v-value" style={{ color: data.unifiedAnalysis.color }}>
                      {data.unifiedAnalysis.verdict}
                    </div>
                    <div className="v-meta">
                        <span>RISK_LEVEL: <strong>{data.unifiedAnalysis.riskLevel}</strong></span>
                        {data.unifiedAnalysis.isSilentFlyer && (
                          <span className="flyer-badge">SILENT_FLYER</span>
                        )}
                    </div>
                  </div>

                  {screenerContext && (
                    <div className="screener-sync-panel">
                      <div className="sync-title-row">
                        <div className="sync-title"><Info size={14} /> SCREENER_SYNC</div>
                        <div className="sync-badge">{formatSignalLabel(screenerContext.category)}</div>
                      </div>
                      <div className="sync-vector">{screenerContext.vector || screenerContext.signalSource}</div>
                      <div className="sync-grid">
                        <div><span>APPEARED</span><strong>{formatDateTime(screenerContext.appearedAt || screenerContext.entryDate)}</strong></div>
                        <div><span>LAST_SCAN</span><strong>{formatDateTime(screenerContext.lastScannedAt || screenerContext.updatedAt)}</strong></div>
                        <div><span>ENTRY</span><strong>{formatPrice(screenerContext.entryPrice)}</strong></div>
                        <div><span>STOP</span><strong>{formatPrice(screenerContext.stopLossPrice)}</strong></div>
                        <div><span>TARGET</span><strong>{formatPrice(screenerContext.targetPrice)}</strong></div>
                        <div><span>RR / DELTA</span><strong>{screenerContext.rewardRisk ?? "-"}R / {formatPct(screenerContext.deltaPct)}</strong></div>
                      </div>
                      {screenerContext.thesis && <p className="sync-thesis">{screenerContext.thesis}</p>}
                      {activeScreenerSignals.length > 1 && (
                        <div className="sync-stack">
                          {activeScreenerSignals.slice(1, 4).map((signal: any) => (
                            <span key={`${signal.category}-${signal.vector}-${signal.lastScannedAt}`}>{formatSignalLabel(signal.category)}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {executionPlan && (() => {
                    const plan = executionPlan;
                    const planRows = [
                      ["ENTRY_ZONE", plan.entryZone],
                      ["IDEAL_BUY", plan.idealBuy ?? "-"],
                      ["EARLY_EXIT", plan.earlyExit ?? "-"],
                      ["HARD_STOP", plan.hardStop ?? plan.stopLoss ?? "-"],
                      ["TARGET_1", plan.target1 ?? plan.takeProfit ?? "-"],
                      ["TARGET_2", plan.target2 ?? "-"],
                    ];

                    return (
                      <div className="execution-plan" style={{ '--plan-color': plan.stateColor || data.unifiedAnalysis.color } as any}>
                        <div className="execution-header">
                          <div>
                            <div className="execution-kicker">EXECUTION_STATE</div>
                            <div className="execution-state">{plan.stateLabel || plan.action}</div>
                          </div>
                          <div className="execution-rr">
                            <span>{plan.rewardRisk ?? "-"}R</span>
                            <small>MAX LOSS {plan.maxLossPct ?? "-"}%</small>
                          </div>
                        </div>

                        <div className="execution-grid">
                          {planRows.map(([label, value]) => (
                            <div className="execution-cell" key={label}>
                              <span>{label}</span>
                              <strong>{String(value)}</strong>
                            </div>
                          ))}
                        </div>

                        <div className="execution-rule">
                          <strong>TIME_STOP</strong>
                          <span>{plan.timeStopRule}</span>
                        </div>

                        <div className="execution-rule">
                          <strong>POSITION_SIZE</strong>
                          <span>{plan.positionSizing}</span>
                        </div>

                      </div>
                    );
                  })()}

                  {data.historicalSignals && data.historicalSignals.length > 0 && (
                    <div className="historical-signals-section">
                        <div className="section-title">HISTORICAL_ALERTS</div>
                        <div className="signals-mini-list">
                            {data.historicalSignals.slice(0, 3).map((sig: any, idx: number) => (
                                <div key={idx} className="sig-item">
                                    <span className="sig-date">{new Date(sig.createdAt).toLocaleDateString('id-ID')}</span>
                                    <span className="sig-range">{Number(sig.entryPrice || 0).toFixed(0)} to {Number(sig.targetPrice || 0).toFixed(0)}</span>
                                    <span className={`sig-status ${String(sig.status).toLowerCase()}`}>{String(sig.status).toUpperCase()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                  )}

                  <div className="analysis-section">
                    <div className="section-title">DECISION_SUMMARY</div>
                    <p className="suggestion-text">{data.unifiedAnalysis.suggestion}</p>

                    {data.unifiedAnalysis.tradePlan?.reason && (
                        <div className="insight-box decision">
                            <div className="box-label">WHY_THIS_DECISION</div>
                            <p>{data.unifiedAnalysis.tradePlan.reason}</p>
                        </div>
                    )}

                    {data.unifiedAnalysis.tradePlan?.timing && (
                        <div className="insight-box action">
                            <div className="box-label">NEXT_ACTION</div>
                            <p>{data.unifiedAnalysis.tradePlan.timing}</p>
                        </div>
                    )}
                    
                    {showSqueezeDeluxe && data.unifiedAnalysis.squeezeInsight && (
                        <div className="insight-box squeeze">
                            <div className="box-label">COMPRESSION_INSIGHT</div>
                            <p>{data.unifiedAnalysis.squeezeInsight}</p>
                        </div>
                    )}

                  </div>

                  <div className="analysis-section metrics">
                    <div className="metrics-header">
                      <div className="metrics-title">QUALITY_METRICS</div>
                      <div className="metrics-subtitle">TECHNICAL_VALIDATION_SCORE</div>
                    </div>
                    <div className="metric-row">
                      <div className="m-info">
                        <span>SETUP_QUALITY</span>
                        <div className="m-value-wrapper">
                          <span className="m-val">{data.unifiedAnalysis.score.setup}%</span>
                          <div className="m-grade">
                            {data.unifiedAnalysis.score.setup >= 80 ? 'A' :
                             data.unifiedAnalysis.score.setup >= 60 ? 'B' :
                             data.unifiedAnalysis.score.setup >= 40 ? 'C' : 'D'}
                          </div>
                        </div>
                      </div>
                      <div className="m-bar">
                        <div className="m-fill" style={{
                          width: `${data.unifiedAnalysis.score.setup}%`,
                          background: data.unifiedAnalysis.score.setup >= 80 ?
                            'linear-gradient(90deg, #22c55e, #16a34a)' :
                            data.unifiedAnalysis.score.setup >= 60 ?
                            'linear-gradient(90deg, #f59e0b, #d97706)' :
                            'linear-gradient(90deg, #ef4444, #dc2626)'
                        }}></div>
                      </div>
                    </div>
                    <div className="metric-row">
                      <div className="m-info">
                        <span>VOLUME_CONVICTION</span>
                        <div className="m-value-wrapper">
                          <span className="m-val">{data.unifiedAnalysis.score.volume.toFixed(0)}%</span>
                          <div className="m-grade">
                            {data.unifiedAnalysis.score.volume >= 80 ? 'HIGH' :
                             data.unifiedAnalysis.score.volume >= 60 ? 'MED' : 'LOW'}
                          </div>
                        </div>
                      </div>
                      <div className="m-bar">
                        <div className="m-fill" style={{
                          width: `${data.unifiedAnalysis.score.volume}%`,
                          background: data.unifiedAnalysis.score.volume >= 80 ?
                            'linear-gradient(90deg, #3b82f6, #2563eb)' :
                            data.unifiedAnalysis.score.volume >= 60 ?
                            'linear-gradient(90deg, #8b5cf6, #7c3aed)' :
                            'linear-gradient(90deg, #64748b, #475569)'
                        }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="analysis-section flow">
                    <div className="section-title">FLOW_METRICS</div>
                    <div className="flow-grid">
                      {Object.entries(data.unifiedAnalysis.details).map(([key, val]: any) => (
                        <div key={key} className="flow-item">
                          <span className="f-label">{key}</span>
                          <span className="f-value">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="pivots-panel panel">
                <div className="panel-header">PIVOT_TARGETS</div>
                <div className="pivots-list">
                  <div className="pivot-row pos"><span>T2_RESISTANCE</span><strong>{data.pivots.r3.toFixed(0)}</strong></div>
                  <div className="pivot-row pos"><span>T1_RESISTANCE</span><strong>{data.pivots.r2.toFixed(0)}</strong></div>
                  <div className="pivot-row base"><span>BASE_PIVOT</span><strong>{data.pivots.p.toFixed(0)}</strong></div>
                  <div className="pivot-row neg"><span>S1_SUPPORT</span><strong>{data.pivots.s1.toFixed(0)}</strong></div>
                  <div className="pivot-row neg"><span>S2_SUPPORT</span><strong>{data.pivots.s2.toFixed(0)}</strong></div>
                </div>
              </div>
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
            --text-muted: oklch(0.6 0.02 240);
        }

        .search-container {
            max-width: 1600px;
            margin: 0 auto;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .command-center {
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .command-row {
            display: flex;
            gap: 20px;
            align-items: center;
            flex-wrap: wrap;
        }

        .search-box-premium {
            display: flex;
            background: oklch(0.1 0 0);
            border: 1px solid var(--border-tactical);
            border-radius: 8px;
            padding: 2px;
            flex: 1;
            min-width: 280px;
            max-width: 400px;
            align-items: center;
        }

        .search-icon { margin: 0 12px; color: var(--text-muted); }

        .input-premium {
            background: transparent;
            border: none;
            color: white;
            font-size: 0.85rem;
            flex: 1;
            outline: none;
            padding: 10px 0;
            font-family: inherit;
        }

        .analyze-btn {
            background: var(--accent-emerald);
            color: black;
            border: none;
            padding: 0 20px;
            font-weight: 1000;
            font-size: 0.7rem;
            height: 36px;
            border-radius: 6px;
            cursor: pointer;
            letter-spacing: 0.05em;
        }

        .timeframe-selector {
            display: flex;
            background: oklch(0.2 0 0);
            padding: 4px;
            border-radius: 10px;
            gap: 4px;
        }

        .tf-pill {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-size: 0.65rem;
            font-weight: 900;
            padding: 6px 14px;
            border-radius: 7px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .tf-pill.active { background: oklch(0.3 0 0); color: white; }

        .chart-type-toggle {
            display: flex;
            border: 1px solid var(--border-tactical);
            border-radius: 6px;
            overflow: hidden;
        }

        .chart-type-toggle button {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-size: 0.65rem;
            font-weight: 900;
            padding: 8px 16px;
            cursor: pointer;
        }

        .chart-type-toggle button {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .chart-type-toggle button.active { background: var(--accent-emerald); color: black; }

        .toggle-icon {
            font-size: 0.9rem;
        }

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

        .search-grid {
            display: grid;
            grid-template-columns: 1fr 340px;
            gap: 24px;
            align-items: start;
        }

        .charts-column { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
        .chart-wrapper.main-viz { height: 600px; padding: 0; overflow: hidden; }
        .chart-wrapper.secondary-viz { height: 240px; padding: 0; overflow: hidden; }

        .legend-panel {
            background: oklch(0.12 0.01 240);
            border: 1px solid var(--border-tactical);
            border-radius: 12px;
            padding: 16px;
        }

        .legend-header { font-size: 0.65rem; font-weight: 1000; color: white; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; opacity: 0.8; }
        .legend-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; }
        .legend-item p { font-size: 0.6rem; color: var(--text-muted); margin-top: 4px; line-height: 1.4; }
        .l-tag { font-size: 0.5rem; font-weight: 1000; padding: 1px 4px; border-radius: 2px; }
        .tag-flux { background: var(--accent-emerald); color: black; }
        .tag-sqz { background: oklch(0.85 0.25 200); color: black; }
        .tag-mom { background: var(--accent-cyan); color: black; }

        .conviction-panel { border-color: oklch(from var(--accent-color) l c h / 0.5) !important; box-shadow: 0 0 30px -10px oklch(from var(--accent-color) l c h / 0.2); }
        
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
        .flyer-badge { background: oklch(0.85 0.25 200); color: black; padding: 2px 6px; border-radius: 3px; font-weight: 1000; }

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
            letter-spacing: 0.13em;
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

        .sync-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }

        .sync-grid div {
            border: 1px solid oklch(from var(--accent-color) l c h / 0.18);
            background: oklch(0.05 0 0 / 0.62);
            border-radius: 8px;
            padding: 8px;
            min-width: 0;
        }

        .sync-grid span {
            display: block;
            color: var(--text-muted);
            font-size: 0.48rem;
            font-weight: 1000;
            letter-spacing: 0.1em;
            margin-bottom: 3px;
        }

        .sync-grid strong {
            color: white;
            font-size: 0.64rem;
            font-variant-numeric: tabular-nums;
            overflow-wrap: anywhere;
        }

        .sync-thesis {
            color: white;
            font-size: 0.67rem;
            line-height: 1.5;
            margin-top: 12px;
        }

        .sync-stack {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 10px;
        }

        .sync-stack span {
            border: 1px solid oklch(from var(--accent-color) l c h / 0.25);
            color: var(--accent-color);
            border-radius: 999px;
            padding: 3px 7px;
            font-size: 0.5rem;
            font-weight: 900;
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

        .execution-rule,
        .execution-warnings {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 0.62rem;
            line-height: 1.45;
            color: white;
            border-left: 2px solid oklch(from var(--plan-color) l c h / 0.55);
            padding-left: 10px;
            margin-top: 10px;
        }

        .execution-rule strong,
        .execution-warnings strong {
            color: var(--plan-color);
            font-size: 0.52rem;
            letter-spacing: 0.12em;
        }

        .execution-warnings span {
            color: oklch(0.78 0.12 70);
        }

        .analysis-section { padding: 20px; border-bottom: 1px solid var(--border-tactical); }
        .section-title { font-size: 0.65rem; font-weight: 1000; color: var(--text-muted); margin-bottom: 12px; letter-spacing: 0.1em; }
        .suggestion-text { font-size: 0.75rem; line-height: 1.6; color: white; font-style: italic; border-left: 2px solid var(--accent-cyan); padding-left: 12px; }

        .metric-row { margin-bottom: 12px; }
        .m-info { display: flex; justify-content: space-between; font-size: 0.6rem; font-weight: 900; margin-bottom: 4px; }
        .m-bar { height: 6px; background: oklch(0.2 0 0); border-radius: 3px; overflow: hidden; }
        .m-fill { height: 100%; background: var(--accent-emerald); box-shadow: 0 0 10px var(--accent-emerald); transition: width 1s ease-out; }

        .metrics-header {
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border-tactical);
        }

        .metrics-title {
            font-size: 0.65rem;
            font-weight: 1000;
            color: white;
            letter-spacing: 0.1em;
        }

        .metrics-subtitle {
            font-size: 0.55rem;
            color: var(--text-muted);
            margin-top: 2px;
        }

        .m-value-wrapper {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .m-grade {
            font-size: 0.5rem;
            font-weight: 1000;
            padding: 2px 4px;
            border-radius: 2px;
            background: oklch(0.15 0 0);
            color: white;
        }

        .flow-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
        .flow-item { display: flex; justify-content: space-between; font-size: 0.65rem; border-bottom: 1px solid oklch(0.2 0 0); padding: 4px 0; }
        .f-label { color: var(--text-muted); }
        .f-value { font-weight: 900; color: white; }

        .historical-signals-section { padding: 16px 20px; border-bottom: 1px solid var(--border-tactical); background: oklch(0.7 0.2 150 / 0.03); }
        .signals-mini-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .sig-item { display: flex; justify-content: space-between; font-size: 0.65rem; align-items: center; }
        .sig-date { color: var(--text-muted); }
        .sig-range { font-weight: 800; color: var(--accent-emerald); }
        .sig-status { font-weight: 900; font-size: 0.55rem; padding: 1px 4px; border-radius: 2px; }
        .sig-status.success { color: var(--accent-emerald); background: oklch(0.7 0.2 150 / 0.1); }
        .sig-status.failed { color: var(--accent-rose); background: oklch(0.6 0.2 25 / 0.1); }
        .sig-status.pending { color: var(--accent-cyan); background: oklch(0.75 0.2 200 / 0.1); }
        .sig-status.triggered { color: var(--accent-emerald); background: oklch(0.7 0.2 150 / 0.1); }
        .sig-status.armed { color: var(--accent-cyan); background: oklch(0.75 0.2 200 / 0.1); }
        .sig-status.setup { color: oklch(0.75 0.2 200); background: oklch(0.75 0.2 200 / 0.1); }
        .sig-status.chase,
        .sig-status.expired { color: oklch(0.8 0.18 70); background: oklch(0.8 0.18 70 / 0.1); }
        .sig-status.invalid { color: var(--accent-rose); background: oklch(0.6 0.2 25 / 0.1); }
        .sig-status.target { color: var(--accent-emerald); background: oklch(0.7 0.2 150 / 0.1); }
        .sig-status.stop { color: var(--accent-rose); background: oklch(0.6 0.2 25 / 0.1); }
        .sig-status.time_stop { color: oklch(0.8 0.18 70); background: oklch(0.8 0.18 70 / 0.1); }

        .insight-box { margin-top: 16px; padding: 12px; border-radius: 8px; background: oklch(1 0 0 / 0.02); border-left: 3px solid var(--accent-cyan); }
        .insight-box.decision { border-left-color: var(--accent-emerald); background: oklch(0.7 0.2 150 / 0.035); }
        .insight-box.action { border-left-color: var(--accent-cyan); background: oklch(0.75 0.2 200 / 0.035); }
        .insight-box.squeeze { border-left-color: oklch(0.85 0.25 200); background: oklch(0.85 0.25 200 / 0.03); }
        .insight-box.fusion { border-left-color: oklch(0.85 0.2 150); background: oklch(0.85 0.2 150 / 0.035); }
        .box-label { font-size: 0.55rem; font-weight: 1000; letter-spacing: 0.1em; margin-bottom: 6px; color: var(--text-muted); }
        .insight-box p { font-size: 0.7rem; line-height: 1.5; color: white; margin: 0; }

        .insight-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-top: 16px;
        }

        .insight-card { 
            background: oklch(0.12 0.01 240);
            border: 1px solid var(--border-tactical);
            border-radius: 8px;
            padding: 0;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .insight-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px oklch(0 0 0 / 0.2);
        }

        .insight-card.squeeze { border-color: oklch(0.85 0.25 200); }
        .insight-card.fusion { border-color: oklch(0.85 0.2 150); }

        .card-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            background: oklch(0.08 0 0);
            border-bottom: 1px solid var(--border-tactical);
        }

        .card-icon {
            font-size: 1.2rem;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: oklch(0.15 0 0);
            border-radius: 4px;
        }

        .card-content {
            padding: 12px;
        }

        .card-content p {
            font-size: 0.65rem;
            line-height: 1.5;
            color: white;
            margin: 0;
        }

        .card-footer {
            padding: 8px 12px;
            background: oklch(0.08 0 0);
            border-top: 1px solid var(--border-tactical);
        }

        .indicator-label {
            font-size: 0.55rem;
            font-weight: 900;
            color: var(--text-muted);
            letter-spacing: 0.1em;
        }

        .pivots-panel { padding: 0; }
        .pivots-list { padding: 12px; }
        .pivot-row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 0.7rem; border-bottom: 1px solid oklch(0.2 0 0); }
        .pivot-row:last-child { border-bottom: none; }
        .pivot-row.pos { color: var(--accent-emerald); }
        .pivot-row.neg { color: var(--accent-rose); }
        .pivot-row.base { background: oklch(0.2 0 0); color: var(--accent-cyan); font-weight: 1000; }

        @media (max-width: 1024px) {
            .search-grid { grid-template-columns: 1fr; }
            .chart-wrapper.main-viz { height: 500px; }
            .command-row.main { flex-direction: column; align-items: stretch; }
            .search-box-premium { max-width: none; }
        }

        @media (max-width: 640px) {
            .search-container { padding: 16px; }
            .command-center { padding: 16px; }
            .v-value { font-size: 1.1rem; }
            .sync-grid { grid-template-columns: 1fr; }
            .chart-wrapper.main-viz { height: 400px; }
        }
      `}</style>
    </div>
  );
}
