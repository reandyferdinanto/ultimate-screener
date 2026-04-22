"use client";
import React, { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import AdvancedChart from "@/components/AdvancedChart";
import { Search, Eye, EyeOff, BarChart2, TrendingUp, Activity, AlertCircle, ChevronDown, Check, Info } from "lucide-react";
import Navigation from "@/components/Navigation";
import { 
  createChart, 
  ColorType, 
  IChartApi, 
  LineSeries, 
  HistogramSeries,
  BaselineSeries,
  LogicalRange,
  UTCTimestamp,
  createSeriesMarkers
} from "lightweight-charts";

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
  const [showEMA10, setShowEMA10] = useState(false);
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);
  const [showSqueezeDeluxe, setShowSqueezeDeluxe] = useState(false);

  const [logicalRange, setLogicalRange] = useState<LogicalRange | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);

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

  const syncCharts = useCallback((range: any) => {
    setLogicalRange(range);
    if (macdChartRef.current && range) {
        macdChartRef.current.timeScale().setVisibleLogicalRange(range);
    }
  }, []);

  const handleChartInit = useCallback((chart: IChartApi) => {
    macdChartRef.current = chart;
  }, []);

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

          <div className="command-row secondary">
            <div className="chart-type-toggle">
              <button className={chartType === 'candle' ? 'active' : ''} onClick={() => setChartType('candle')}>CANDLE</button>
              <button className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')}>LINE</button>
            </div>

            <div className="indicator-matrix custom-scrollbar">
              <button className={`matrix-btn trend ${showEMA10 ? 'active' : ''}`} onClick={() => setShowEMA10(!showEMA10)}>EMA10</button>
              <button className={`matrix-btn trend ${showEMA20 ? 'active' : ''}`} onClick={() => setShowEMA20(!showEMA20)}>EMA20</button>
              <button className={`matrix-btn vol ${showSqueezeDeluxe ? 'active' : ''}`} onClick={() => setShowSqueezeDeluxe(!showSqueezeDeluxe)}>SQZ_DLX</button>
              <button className={`matrix-btn vol ${showBB ? 'active' : ''}`} onClick={() => setShowBB(!showBB)}>BB</button>
              <button className={`matrix-btn vol ${showMFI ? 'active' : ''}`} onClick={() => setShowMFI(!showMFI)}>MFI</button>
              <button className={`matrix-btn vol ${showVWAP ? 'active' : ''}`} onClick={() => setShowVWAP(!showVWAP)}>VWAP</button>
              <button className={`matrix-btn vol ${showOBV ? 'active' : ''}`} onClick={() => setShowOBV(!showOBV)}>OBV</button>
              <button className={`matrix-btn vol ${showCMF ? 'active' : ''}`} onClick={() => setShowCMF(!showCMF)}>CMF</button>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-alert">
            <AlertCircle size={16} />
            <span>ERROR_TRAP: {error}</span>
          </div>
        )}

        {data && (
          <div className="search-grid">
            {/* LEFT COLUMN: CHARTS */}
            <div className="charts-column">
              {showSqueezeDeluxe && (
                <div className="legend-panel animate-slide-down">
                  <div className="legend-header">
                    <span className="legend-title"><Info size={12} /> INDICATOR_GUIDE // SQZ_DELUXE</span>
                  </div>
                  <div className="legend-grid">
                    <div className="legend-item">
                      <span className="l-tag tag-flux">FLUX</span>
                      <p>Institutional flow pressure. Green=Bullish, Blue=Recovering.</p>
                    </div>
                    <div className="legend-item">
                      <span className="l-tag tag-sqz">SQUEEZE</span>
                      <p>Volatility compression dots. Red=Max coil, Black=Release.</p>
                    </div>
                    <div className="legend-item">
                      <span className="l-tag tag-mom">MOMENTUM</span>
                      <p>Linear regression histogram of price relative to volatility.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="chart-wrapper main-viz panel">
                <AdvancedChart 
                  key={`main-${symbol}-${interval}-${showEMA10}-${showEMA20}-${showEMA50}-${showEMA200}-${showSqueezeDeluxe}-${showBB}-${showMFI}-${showVWAP}-${showOBV}-${showCMF}`}
                  data={data.data} 
                  pivots={data.pivots} 
                  elliott={data.elliott}
                  wavePivots={data.wavePivots}
                  ticker={data.ticker} 
                  onLogicalRangeChange={syncCharts}
                  syncLogicalRange={logicalRange}
                  showSuperTrend={showSuperTrend}
                  showBB={showBB}
                  showMFI={showMFI}
                  showVWAP={showVWAP}
                  showOBV={showOBV}
                  showCMF={showCMF}
                  chartType={chartType}
                  showEMA20={showEMA20}
                  showEMA50={showEMA50}
                  showEMA200={showEMA200}
                  showEMA10={showEMA10}
                  showSqueezeDeluxe={showSqueezeDeluxe}
                />
              </div>

              <div className="chart-wrapper secondary-viz panel">
                <MacdChartComponent 
                  key={`macd-${symbol}-${interval}`}
                  data={data.data} 
                  onLogicalRangeChange={syncCharts}
                  syncLogicalRange={logicalRange}
                  onChartInit={handleChartInit}
                />
              </div>

              {showSqueezeDeluxe && (
                <div className="chart-wrapper secondary-viz panel">
                  <SqueezeChartComponent 
                    key={`squeeze-${symbol}-${interval}`}
                    data={data.data} 
                    onLogicalRangeChange={syncCharts}
                    syncLogicalRange={logicalRange}
                  />
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: ANALYSIS */}
            <div className="analysis-column">
              {data.unifiedAnalysis && (
                <div className="conviction-panel panel" style={{ '--accent-color': data.unifiedAnalysis.color } as any}>
                  <div className="panel-header">CONVICTION_REPORT</div>
                  
                  <div className="verdict-hero">
                    <div className="v-label">CONVICTION_VERDICT</div>
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

                  {data.historicalSignals && data.historicalSignals.length > 0 && (
                    <div className="historical-signals-section">
                        <div className="section-title">HISTORICAL_ALERTS</div>
                        <div className="signals-mini-list">
                            {data.historicalSignals.slice(0, 3).map((sig: any, idx: number) => (
                                <div key={idx} className="sig-item">
                                    <span className="sig-date">{new Date(sig.createdAt).toLocaleDateString('id-ID')}</span>
                                    <span className="sig-range">{sig.entryPrice.toFixed(0)} → {sig.targetPrice.toFixed(0)}</span>
                                    <span className={`sig-status ${sig.status}`}>{sig.status.toUpperCase()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                  )}

                  <div className="analysis-section">
                    <div className="section-title">STRATEGIC_CONCLUSION</div>
                    <p className="suggestion-text">{data.unifiedAnalysis.suggestion}</p>
                    
                    {showSqueezeDeluxe && data.unifiedAnalysis.squeezeInsight && (
                        <div className="insight-box squeeze">
                            <div className="box-label">COMPRESSION_INSIGHT</div>
                            <p>{data.unifiedAnalysis.squeezeInsight}</p>
                        </div>
                    )}

                    {data.elliott && data.elliott.interpretation && (
                        <div className="insight-box elliott">
                            <div className="box-label">ELLIOTT_WAVE_PROJECTION</div>
                            <p>{data.elliott.interpretation}</p>
                        </div>
                    )}
                  </div>

                  <div className="analysis-section metrics">
                    <div className="metric-row">
                      <div className="m-info">
                        <span>SETUP_QUALITY</span>
                        <span className="m-val">{data.unifiedAnalysis.score.setup}%</span>
                      </div>
                      <div className="m-bar"><div className="m-fill" style={{ width: `${data.unifiedAnalysis.score.setup}%` }}></div></div>
                    </div>
                    <div className="metric-row">
                      <div className="m-info">
                        <span>VOLUME_CONVICTION</span>
                        <span className="m-val">{data.unifiedAnalysis.score.volume.toFixed(0)}%</span>
                      </div>
                      <div className="m-bar"><div className="m-fill" style={{ width: `${data.unifiedAnalysis.score.volume}%` }}></div></div>
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
        }

        .matrix-btn.active.trend { border-color: var(--accent-cyan); color: var(--accent-cyan); background: oklch(0.75 0.2 200 / 0.1); }
        .matrix-btn.active.vol { border-color: oklch(0.85 0.25 200); color: oklch(0.85 0.25 200); background: oklch(0.85 0.25 200 / 0.1); }

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

        .v-label { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.2em; margin-bottom: 4px; }
        .v-value { font-size: 1.25rem; font-weight: 1000; letter-spacing: 0.02em; }
        .v-meta { display: flex; justify-content: center; gap: 12px; margin-top: 12px; font-size: 0.6rem; align-items: center; }
        .flyer-badge { background: oklch(0.85 0.25 200); color: black; padding: 2px 6px; border-radius: 3px; font-weight: 1000; }

        .analysis-section { padding: 20px; border-bottom: 1px solid var(--border-tactical); }
        .section-title { font-size: 0.65rem; font-weight: 1000; color: var(--text-muted); margin-bottom: 12px; letter-spacing: 0.1em; }
        .suggestion-text { font-size: 0.75rem; line-height: 1.6; color: white; font-style: italic; border-left: 2px solid var(--accent-cyan); padding-left: 12px; }

        .metric-row { margin-bottom: 12px; }
        .m-info { display: flex; justify-content: space-between; font-size: 0.6rem; font-weight: 900; margin-bottom: 4px; }
        .m-bar { height: 4px; background: oklch(0.2 0 0); border-radius: 2px; overflow: hidden; }
        .m-fill { height: 100%; background: var(--accent-emerald); box-shadow: 0 0 10px var(--accent-emerald); transition: width 1s ease-out; }

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

        .insight-box { margin-top: 16px; padding: 12px; border-radius: 8px; background: oklch(1 0 0 / 0.02); border-left: 3px solid var(--accent-cyan); }
        .insight-box.squeeze { border-left-color: oklch(0.85 0.25 200); background: oklch(0.85 0.25 200 / 0.03); }
        .insight-box.elliott { border-left-color: oklch(0.5 0.2 180); background: oklch(0.5 0.2 180 / 0.03); }
        .box-label { font-size: 0.55rem; font-weight: 1000; letter-spacing: 0.1em; margin-bottom: 6px; color: var(--text-muted); }
        .insight-box p { font-size: 0.7rem; line-height: 1.5; color: white; margin: 0; }

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
            .chart-wrapper.main-viz { height: 400px; }
        }
      `}</style>
    </div>
  );
}

// ... MacdChartComponent and SqueezeChartComponent remain largely the same, 
// but height adapted in their own useEffect as before.
function MacdChartComponent({ 
    data, 
    onLogicalRangeChange, 
    syncLogicalRange,
    onChartInit
}: { 
    data: any[], 
    onLogicalRangeChange: (range: LogicalRange | null) => void, 
    syncLogicalRange: LogicalRange | null,
    onChartInit: (chart: IChartApi) => void
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (!chartContainerRef.current || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0a0a0a" }, textColor: "#d1d4dc" },
      grid: { vertLines: { color: "transparent" }, horzLines: { color: "rgba(42, 46, 57, 0.1)" } },
      timeScale: { 
        visible: true, 
        borderColor: "rgba(197, 203, 206, 0.2)",
        rightOffset: 12,
        barSpacing: 10,
      },
      width: chartContainerRef.current.clientWidth,
      height: 240,
    });

    chartRef.current = chart;
    onChartInit(chart);

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isMounted.current) onLogicalRangeChange(range);
    });

    const macdSeries = chart.addSeries(LineSeries, { color: "#2962FF", lineWidth: 2, title: "MACD" });
    const signalSeries = chart.addSeries(LineSeries, { color: "#FF6D00", lineWidth: 2, title: "Signal" });
    const histSeries = chart.addSeries(HistogramSeries, { color: "#26a69a" });

    macdSeries.setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.macd.macd })));
    signalSeries.setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.macd.signal })));
    histSeries.setData(data.map(d => ({ 
      time: d.time as UTCTimestamp, 
      value: d.macd.histogram,
      color: d.macd.histogram >= 0 ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)"
    })));

    return () => {
        isMounted.current = false;
        if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
        }
    };
  }, [data, onChartInit, onLogicalRangeChange]);

  useEffect(() => {
    if (isMounted.current && chartRef.current && syncLogicalRange) {
        chartRef.current.timeScale().setVisibleLogicalRange(syncLogicalRange);
    }
  }, [syncLogicalRange]);

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="panel-header">MACD (12, 26, 9)</div>
      <div ref={chartContainerRef} style={{ width: '100%', height: '240px' }} />
    </div>
  );
}

function SqueezeChartComponent({ 
    data, 
    onLogicalRangeChange, 
    syncLogicalRange 
}: { 
    data: any[], 
    onLogicalRangeChange: (range: LogicalRange | null) => void, 
    syncLogicalRange: LogicalRange | null 
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (!chartContainerRef.current || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0a0a0a" }, textColor: "#d1d4dc" },
      grid: { vertLines: { color: "transparent" }, horzLines: { color: "rgba(42, 46, 57, 0.05)" } },
      timeScale: { 
        visible: true, 
        borderColor: "rgba(197, 203, 206, 0.2)",
        rightOffset: 12,
        barSpacing: 10,
      },
      width: chartContainerRef.current.clientWidth,
      height: 240,
    });

    chartRef.current = chart;

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isMounted.current) onLogicalRangeChange(range);
    });

    const sqzSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'sqz',
        title: "Squeeze",
    });
    chart.priceScale('sqz').applyOptions({ 
        scaleMargins: { top: 0.49, bottom: 0.49 },
        visible: false 
    });
    sqzSeries.setData(data.map(d => ({
        time: d.time as UTCTimestamp,
        value: 1,
        color: d.squeezeDeluxe?.squeeze.high ? '#ff1100' : 
               d.squeezeDeluxe?.squeeze.mid ? '#ff5e00' : 
               d.squeezeDeluxe?.squeeze.low ? '#ffa600' : '#2a2e39'
    })));

    const fluxSeries = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(38, 166, 154, 0.5)', 
        topFillColor2: 'rgba(38, 166, 154, 0.0)', 
        topLineColor: 'rgba(38, 166, 154, 0.4)',
        bottomFillColor1: 'rgba(239, 83, 80, 0.0)', 
        bottomFillColor2: 'rgba(239, 83, 80, 0.5)', 
        bottomLineColor: 'rgba(239, 83, 80, 0.4)',
        lineWidth: 1,
        title: "Flux",
    });
    fluxSeries.setData(data.map(d => ({
        time: d.time as UTCTimestamp,
        value: d.squeezeDeluxe?.flux || 0,
    })));

    const overFluxSeries = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(38, 166, 154, 0.8)', 
        topFillColor2: 'rgba(38, 166, 154, 0.1)', 
        topLineColor: 'rgba(38, 166, 154, 0.9)',
        bottomFillColor1: 'rgba(239, 83, 80, 0.1)', 
        bottomFillColor2: 'rgba(239, 83, 80, 0.8)', 
        bottomLineColor: 'rgba(239, 83, 80, 0.9)',
        lineWidth: 1,
        title: "OverFlux",
    });
    overFluxSeries.setData(data.map(d => ({
        time: d.time as UTCTimestamp,
        value: d.squeezeDeluxe?.overflux || 0,
    })));

    const momSeries = chart.addSeries(LineSeries, {
        title: "Momentum",
        lineWidth: 3,
    });

    momSeries.setData(data.map((d, i) => {
        const val = d.squeezeDeluxe?.momentum || 0;
        const prevVal = i > 0 ? (data[i-1].squeezeDeluxe?.momentum || 0) : val;
        let color = '#787b86'; 
        if (val >= 0) { color = val >= prevVal ? '#00bcd4' : '#006064'; } else { color = val <= prevVal ? '#ff5252' : '#880e4f'; }
        return { time: d.time as UTCTimestamp, value: val, color: color };
    }));

    const markers = data
        .filter(d => d.squeezeDeluxe?.isBullDiv)
        .map(d => ({
            time: d.time as UTCTimestamp,
            position: 'belowBar' as const,
            color: '#ffa600',
            shape: 'arrowUp' as const,
            text: 'D▴',
        }));
    createSeriesMarkers(momSeries, markers);

    chart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.1 }
    });

    return () => {
        isMounted.current = false;
        if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
        }
    };
  }, [data, onLogicalRangeChange]);

  useEffect(() => {
    if (isMounted.current && chartRef.current && syncLogicalRange) {
        chartRef.current.timeScale().setVisibleLogicalRange(syncLogicalRange);
    }
  }, [syncLogicalRange]);

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="panel-header">SQUEEZE MOMENTUM DELUXE [ELI]</div>
      <div ref={chartContainerRef} style={{ width: '100%', height: '240px' }} />
    </div>
  );
}
