"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AdvancedChart from "@/components/AdvancedChart";
import { Activity, AlertTriangle, BarChart3, Clock3, Info, Layers3, Search, Shield, Target, TrendingDown, TrendingUp } from "lucide-react";

const formatPrice = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("id-ID", { maximumFractionDigits: 0 }) : "-";
};

const formatPct = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "-";
};

const formatSignedPct = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number >= 0 ? "+" : ""}${number.toFixed(2)}%` : "-";
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

const formatSignalLabel = (value?: string) => {
  const normalized = String(value || "TECHNICAL").toUpperCase();
  const labels: Record<string, string> = {
    ARAHUNTER: "Arahunter",
    COOLDOWN: "Cooldown reset",
    CVD_DIVERGENCE: "CVD divergence",
    EMA_BOUNCE: "EMA bounce",
    ELITE_BOUNCE: "Elite bounce",
    BUY_ON_DIP: "Buy on dip",
    TECHNICAL_BREAKOUT: "Breakout teknikal",
    TURNAROUND: "Turnaround",
    SQUEEZE: "Squeeze",
    SQUEEZE_DIVERGENCE: "Squeeze divergence",
    SILENT_FLYER: "Silent flyer",
  };

  return labels[normalized] || normalized.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
};

const formatVerdictText = (value?: string) => {
  const text = String(value || "Belum ada verdict");
  if (text.startsWith("SCREENER SYNC:")) {
    return `Screener aktif: ${formatSignalLabel(text.replace("SCREENER SYNC:", "").trim())}`;
  }

  return text.replace(/_/g, " ");
};

const formatPlanValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  return typeof value === "number" ? formatPrice(value) : String(value);
};

const getReportDetailRows = (details?: Record<string, unknown>) => {
  if (!details) return [];
  const rows = [
    ["Arah EMA cepat", details.emaFast],
    ["Arah EMA swing", details.emaSwing],
    ["RSI", details.rsi],
    ["MFI", details.mfi],
    ["OBV", details.obv],
    ["VWAP", details.vwap],
    ["Squeeze", details.squeeze],
    ["Eksekusi chart", details.execution],
    ["Reward/risk", details.rewardRisk],
    ["Maks. rugi", details.maxLoss],
    ["Time stop", details.timeStop],
  ];

  return rows.filter(([, value]) => value !== undefined && value !== null && value !== "");
};

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

  const [symbol, setSymbol] = useState(querySymbol || "^JKSE");
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
  const activeScreenerSignals = Array.isArray(data?.activeScreenerSignals)
    ? data.activeScreenerSignals
    : (Array.isArray(data?.unifiedAnalysis?.activeScreenerSignals) ? data.unifiedAnalysis.activeScreenerSignals : []);
  const executionPlan = data?.unifiedAnalysis?.screenerTradePlan || data?.unifiedAnalysis?.tradePlan;
  const analysisDetails = data?.unifiedAnalysis?.details || {};
  const screenerSyncStatus = analysisDetails.screenerSyncStatus;
  const screenerStatusText = analysisDetails.screenerStatusText;
  const reportDetailRows = getReportDetailRows(analysisDetails);
  const isScreenerBlocked = screenerSyncStatus === "BLOCKED_BY_LIVE_RISK";

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

  const candles = Array.isArray(data?.data) ? data.data : [];
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const lastClose = Number(lastCandle?.close);
  const prevClose = Number(prevCandle?.close);
  const candleChangePct = Number.isFinite(lastClose) && Number.isFinite(prevClose) && prevClose > 0
    ? ((lastClose - prevClose) / prevClose) * 100
    : null;
  const chartSyncLabel = screenerSyncStatus === "BLOCKED_BY_LIVE_RISK"
    ? "Chart risk-off"
    : (screenerSyncStatus === "SYNCED_TO_CHART" ? "Sinkron screener" : "Analisis teknikal");
  const chartSyncTone = screenerSyncStatus === "BLOCKED_BY_LIVE_RISK" ? "warn" : "ok";
  const candleChangeTone = typeof candleChangePct === "number"
    ? (candleChangePct >= 0 ? "stat-up" : "stat-down")
    : "";
  const displaySymbol = symbol === "^JKSE" ? "IHSG" : symbol.replace(".JK", "");
  const displayTicker = data?.ticker === "^JKSE" ? "IHSG" : (data?.ticker || symbol);

  return (
    <div className="search-root min-h-screen bg-[#050505] text-silver-300 font-mono">
      
      <main className="search-container">
        <div className="command-center panel chart-command">
          <div className="command-copy">
            <div className="command-kicker"><BarChart3 size={14} /> Chart analysis</div>
            <h1>{displaySymbol} price map</h1>
            <p>Gunakan chart ini untuk menyamakan bias conviction report, garis entry/stop/target, dan konteks screener sebelum ambil keputusan.</p>
          </div>

          <div className="command-row main">
            <form onSubmit={handleSearch} className="search-box-premium">
              <Search className="search-icon" size={16} />
              <input
                className="input-premium"
                placeholder="Cari kode saham, contoh: BBCA"
                value={input}
                onChange={e => setInput(e.target.value)}
              />
              <button className="analyze-btn" type="submit" disabled={loading}>
                {loading ? "Memuat" : "Analisis"}
              </button>
            </form>

            <div className="timeframe-block">
              <span>Timeframe chart</span>
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
        </div>

        {error && <div className="chart-error panel">{error}</div>}

        {data && data.data && (
            <div className="search-grid">
                <div className="charts-column">
                    <div className="chart-wrapper main-viz panel" style={{ padding: 0, height: "auto", overflow: "visible" }}>
                        <AdvancedChart 
                            key={`main-${symbol}-${interval}-${showEMA9}-${showEMA10}-${showEMA20}-${showEMA50}-${showEMA60}-${showEMA200}-${showSqueezeDeluxe}-${showBB}-${showMFI}-${showVWAP}-${showOBV}-${showCMF}`}
                            data={data.data} 
                            pivots={data.pivots} 
                            riskPlan={executionPlan}
                            ticker={displayTicker}
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

                    <section className="chart-overview panel" style={{ '--chart-accent': data.unifiedAnalysis?.color || 'var(--accent-emerald)' } as any}>
                      <div className="chart-overview-main">
                        <div>
                          <div className="chart-kicker"><Activity size={14} /> Live chart context</div>
                          <h2>{displayTicker} <span>{interval.toUpperCase()}</span></h2>
                          <p>Fokus baca chart: harga sekarang, area entry, stop invalidasi, lalu target. Jika status sync aktif, garis di chart mengikuti screener.</p>
                        </div>
                        <div className={`chart-sync-badge ${chartSyncTone}`}>{chartSyncLabel}</div>
                      </div>

                      <div className="chart-stat-grid">
                        <div className="chart-stat-card price">
                          <span>Harga terakhir</span>
                          <strong>{formatPrice(lastClose)}</strong>
                          <small className={candleChangeTone}>{formatSignedPct(candleChangePct)} dari candle sebelumnya</small>
                        </div>
                        <div className="chart-stat-card entry">
                          <span>Entry utama</span>
                          <strong>{formatPrice(executionPlan?.idealBuy ?? executionPlan?.entryHigh ?? screenerContext?.entryPrice)}</strong>
                          <small>Area biru di chart</small>
                        </div>
                        <div className="chart-stat-card stop">
                          <span>Stop / invalidasi</span>
                          <strong>{formatPrice(executionPlan?.hardStop ?? executionPlan?.stopLoss ?? screenerContext?.stopLossPrice)}</strong>
                          <small>Jika ditembus, skenario batal</small>
                        </div>
                        <div className="chart-stat-card target">
                          <span>Target dekat</span>
                          <strong>{formatPrice(executionPlan?.target1 ?? executionPlan?.takeProfit ?? screenerContext?.targetPrice)}</strong>
                          <small>Area hijau/resistance</small>
                        </div>
                      </div>
                    </section>

                    <section className="chart-controls-panel panel">
                      <div className="control-group view-mode">
                        <div className="control-label"><Layers3 size={13} /> Tampilan</div>
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
                        <div className="control-label">Garis trend</div>
                        <div className="indicator-matrix">
                            <button className={`matrix-btn trend ${showEMA9 ? 'active' : ''}`} onClick={() => setShowEMA9(!showEMA9)}><span className="indicator-color" style={{ backgroundColor: '#3b82f6' }}></span>EMA 9</button>
                            <button className={`matrix-btn trend ${showEMA10 ? 'active' : ''}`} onClick={() => setShowEMA10(!showEMA10)}><span className="indicator-color" style={{ backgroundColor: '#06b6d4' }}></span>EMA 10</button>
                            <button className={`matrix-btn trend ${showEMA20 ? 'active' : ''}`} onClick={() => setShowEMA20(!showEMA20)}><span className="indicator-color" style={{ backgroundColor: '#f59e0b' }}></span>EMA 20</button>
                            <button className={`matrix-btn trend ${showEMA50 ? 'active' : ''}`} onClick={() => setShowEMA50(!showEMA50)}><span className="indicator-color" style={{ backgroundColor: '#ef4444' }}></span>EMA 50</button>
                            <button className={`matrix-btn trend ${showEMA60 ? 'active' : ''}`} onClick={() => setShowEMA60(!showEMA60)}><span className="indicator-color" style={{ backgroundColor: '#8b5cf6' }}></span>EMA 60</button>
                            <button className={`matrix-btn trend ${showEMA200 ? 'active' : ''}`} onClick={() => setShowEMA200(!showEMA200)}><span className="indicator-color" style={{ backgroundColor: '#ec4899' }}></span>EMA 200</button>
                        </div>
                      </div>

                      <div className="control-group">
                        <div className="control-label">Momentum & volume</div>
                        <div className="indicator-matrix">
                            <button className={`matrix-btn vol ${showSqueezeDeluxe ? 'active' : ''}`} onClick={() => setShowSqueezeDeluxe(!showSqueezeDeluxe)}><span className="indicator-color" style={{ backgroundColor: '#fbbf24' }}></span>Squeeze</button>
                            <button className={`matrix-btn vol ${showBB ? 'active' : ''}`} onClick={() => setShowBB(!showBB)}><span className="indicator-color" style={{ backgroundColor: '#94a3b8' }}></span>Bollinger</button>
                            <button className={`matrix-btn vol ${showMFI ? 'active' : ''}`} onClick={() => setShowMFI(!showMFI)}><span className="indicator-color" style={{ backgroundColor: '#22c55e' }}></span>MFI</button>
                            <button className={`matrix-btn vol ${showVWAP ? 'active' : ''}`} onClick={() => setShowVWAP(!showVWAP)}><span className="indicator-color" style={{ backgroundColor: '#38bdf8' }}></span>VWAP</button>
                            <button className={`matrix-btn vol ${showOBV ? 'active' : ''}`} onClick={() => setShowOBV(!showOBV)}><span className="indicator-color" style={{ backgroundColor: '#a78bfa' }}></span>OBV</button>
                            <button className={`matrix-btn vol ${showCMF ? 'active' : ''}`} onClick={() => setShowCMF(!showCMF)}><span className="indicator-color" style={{ backgroundColor: '#fb7185' }}></span>CMF</button>
                        </div>
                      </div>
                    </section>

                    <section className="chart-guide panel">
                      <div><Target size={15} /><strong>Entry</strong><span>Garis biru adalah area beli yang boleh dipakai jika candle belum invalidasi.</span></div>
                      <div><Shield size={15} /><strong>Stop</strong><span>Garis merah adalah batas batal. Jangan paksa hold jika ditembus.</span></div>
                      <div><TrendingUp size={15} /><strong>Target</strong><span>Garis hijau adalah target terdekat untuk take profit atau evaluasi.</span></div>
                      <div><Clock3 size={15} /><strong>Time stop</strong><span>Jika harga tidak bergerak sesuai rencana dalam batas waktu, skenario melemah.</span></div>
                    </section>

                    {showSqueezeDeluxe && data.unifiedAnalysis?.squeezeInsight && (
                        <div className="compression-callout">
                            <div>Insight kompresi</div>
                            <p>
                                {data.unifiedAnalysis.squeezeInsight}
                            </p>
                        </div>
                    )}
                </div>

            {/* RIGHT COLUMN: ANALYSIS */}
            <div className="analysis-column">
              {data.unifiedAnalysis && (
                <div className="conviction-panel panel" style={{ '--accent-color': data.unifiedAnalysis.color } as any}>
                  <div className="panel-header report-header">
                    <div>
                      <span>Conviction Report</span>
                      <small>Verdict, rencana aksi, dan konteks screener dalam satu alur.</small>
                    </div>
                    <div className={`report-sync-pill ${isScreenerBlocked ? "warn" : "ok"}`}>
                      {isScreenerBlocked ? "Tunggu chart pulih" : (screenerContext ? "Sinkron" : "Chart only")}
                    </div>
                  </div>
                  
                  <div className="verdict-hero">
                    <div className="v-header">
  <div className="v-label">Kesimpulan sekarang</div>
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
                      {formatVerdictText(data.unifiedAnalysis.verdict)}
                    </div>
                    <div className="v-meta">
                        <span>Risiko: <strong>{data.unifiedAnalysis.riskLevel}</strong></span>
                    </div>
                  </div>

                  {screenerContext && (
                    <div className={`screener-sync-panel ${isScreenerBlocked ? "blocked" : "synced"}`}>
                      <div className="sync-title-row">
                        <div className="sync-title"><Info size={14} /> Sinkronisasi screener</div>
                        <div className="sync-badge">{formatSignalLabel(screenerContext.category)}</div>
                      </div>
                      {screenerSyncStatus === "BLOCKED_BY_LIVE_RISK" ? (
                        <div className="sync-warning">{screenerStatusText || "Screener aktif, tetapi chart live sedang risk-off. Pakai sebagai watchlist sampai invalidasi pulih."}</div>
                      ) : screenerSyncStatus === "SYNCED_TO_CHART" ? (
                        <div className="sync-ok">{screenerStatusText || "Chart dan report memakai entry, stop, dan target yang sama dari screener."}</div>
                      ) : null}
                      <div className="sync-vector">Alasan screener: {screenerContext.vector || screenerContext.signalSource || "-"}</div>
                      <div className="sync-grid">
                        <div><span>Masuk radar</span><strong>{formatDateTime(screenerContext.appearedAt || screenerContext.entryDate)}</strong></div>
                        <div><span>Update terakhir</span><strong>{formatDateTime(screenerContext.lastScannedAt || screenerContext.updatedAt)}</strong></div>
                        <div><span>Entry screener</span><strong>{formatPrice(screenerContext.entryPrice)}</strong></div>
                        <div><span>Stop batal</span><strong>{formatPrice(screenerContext.stopLossPrice)}</strong></div>
                        <div><span>Target awal</span><strong>{formatPrice(screenerContext.targetPrice)}</strong></div>
                        <div><span>RR / Delta</span><strong>{screenerContext.rewardRisk ?? "-"}R / {formatPct(screenerContext.deltaPct)}</strong></div>
                      </div>
                      {screenerContext.thesis && <p className="sync-thesis">{screenerContext.thesis}</p>}
                      {activeScreenerSignals.length > 0 && (
                        <div className="sync-stack-list">
                          <div className="mini-section-title">Semua sinyal aktif</div>
                          {activeScreenerSignals.slice(0, 5).map((signal: any) => (
                            <div className="sync-signal-card" key={`${signal.category}-${signal.vector}-${signal.lastScannedAt || signal.appearedAt}`}>
                              <div>
                                <strong>{formatSignalLabel(signal.category)}</strong>
                                <span>{signal.vector || signal.signalSource || "-"}</span>
                              </div>
                              <div>
                                <small>Entry {formatPrice(signal.entryPrice)}</small>
                                <small>Delta {formatPct(signal.deltaPct)}</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {executionPlan && (() => {
                    const plan = executionPlan;
                      const planRows = [
                        ["Area entry", plan.entryZone],
                        ["Beli ideal", plan.idealBuy ?? "-"],
                        ["Batas waspada", plan.earlyExit ?? "-"],
                        ["Stop batal", plan.hardStop ?? plan.stopLoss ?? "-"],
                        ["Target 1", plan.target1 ?? plan.takeProfit ?? "-"],
                        ["Target 2", plan.target2 ?? "-"],
                      ];

                      return (
                        <div className="execution-plan" style={{ '--plan-color': plan.stateColor || data.unifiedAnalysis.color } as any}>
                          <div className="execution-header">
                            <div>
                              <div className="execution-kicker">Rencana aksi</div>
                              <div className="execution-state">{plan.stateLabel || plan.action}</div>
                            </div>
                            <div className="execution-rr">
                              <span>{plan.rewardRisk ?? "-"}R</span>
                              <small>Maks. rugi {plan.maxLossPct ?? "-"}%</small>
                            </div>
                          </div>

                          {isScreenerBlocked && (
                            <div className="execution-block-note">Screener tidak dipakai untuk entry karena chart live risk-off. Rencana di bawah mengikuti kondisi chart sekarang.</div>
                          )}

                          <div className="execution-grid">
                            {planRows.map(([label, value]) => (
                              <div className="execution-cell" key={label}>
                                <span>{label}</span>
                                <strong>{formatPlanValue(value)}</strong>
                              </div>
                            ))}
                          </div>

                          <div className="execution-rule">
                            <strong>Batas waktu</strong>
                            <span>{plan.timeStopRule}</span>
                          </div>

                          <div className="execution-rule">
                            <strong>Ukuran posisi</strong>
                            <span>{plan.positionSizing}</span>
                          </div>

                      </div>
                    );
                  })()}

                  {data.historicalSignals && data.historicalSignals.length > 0 && (
                    <div className="historical-signals-section">
                        <div className="section-title">Riwayat alert</div>
                        <div className="signals-mini-list">
                            {data.historicalSignals.slice(0, 3).map((sig: any, idx: number) => (
                                <div key={idx} className="sig-item">
                                    <span className="sig-date">{new Date(sig.createdAt).toLocaleDateString('id-ID')}</span>
                                    <span className="sig-range">{Number(sig.entryPrice || 0).toFixed(0)} sampai {Number(sig.targetPrice || 0).toFixed(0)}</span>
                                    <span className={`sig-status ${String(sig.status).toLowerCase()}`}>{String(sig.status).toUpperCase()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                  )}

                  <div className="analysis-section">
                    <div className="section-title">Ringkasan keputusan</div>
                    <p className="suggestion-text">{data.unifiedAnalysis.suggestion}</p>

                    {executionPlan?.reason && (
                        <div className="insight-box decision">
                            <div className="box-label">Kenapa verdict ini muncul</div>
                            <p>{executionPlan.reason}</p>
                        </div>
                    )}

                    {executionPlan?.timing && (
                        <div className="insight-box action">
                            <div className="box-label">Aksi berikutnya</div>
                            <p>{executionPlan.timing}</p>
                        </div>
                    )}
                    
                    {showSqueezeDeluxe && data.unifiedAnalysis.squeezeInsight && (
                        <div className="insight-box squeeze">
                            <div className="box-label">Insight kompresi</div>
                            <p>{data.unifiedAnalysis.squeezeInsight}</p>
                        </div>
                    )}

                  </div>

                  <div className="analysis-section metrics">
                    <div className="metrics-header">
                      <div className="metrics-title">Skor kualitas</div>
                      <div className="metrics-subtitle">Validasi setup dan volume</div>
                    </div>
                    <div className="metric-row">
                      <div className="m-info">
                        <span>Kualitas setup</span>
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
                        <span>Keyakinan volume</span>
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

                  {reportDetailRows.length > 0 && (
                  <div className="analysis-section flow">
                    <div className="section-title">Validasi cepat</div>
                    <div className="flow-grid">
                      {reportDetailRows.map(([label, value]) => (
                        <div key={String(label)} className="flow-item">
                          <span className="f-label">{String(label)}</span>
                          <span className="f-value">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}
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
                radial-gradient(circle at top left, oklch(0.75 0.2 200 / 0.12), transparent 34%),
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
            color: var(--accent-cyan);
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

        .search-box-premium {
            display: flex;
            background: oklch(0.08 0.01 240 / 0.92);
            border: 1px solid oklch(0.34 0.035 240);
            border-radius: 12px;
            padding: 2px;
            flex: 1;
            min-width: 280px;
            max-width: 520px;
            align-items: center;
            box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.05);
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
            min-height: 42px;
            border-radius: 6px;
            cursor: pointer;
            letter-spacing: 0.05em;
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

        .tf-pill.active { background: var(--accent-cyan); color: black; box-shadow: 0 0 18px oklch(0.75 0.2 200 / 0.25); }

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

        .chart-sync-badge.warn {
            color: oklch(0.88 0.18 75);
            background: oklch(0.88 0.18 75 / 0.12);
            border: 1px solid oklch(0.88 0.18 75 / 0.28);
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
        .chart-stat-card.target strong { color: var(--accent-emerald); }
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
            color: var(--accent-cyan);
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

        .screener-sync-panel.blocked {
            background:
                linear-gradient(135deg, oklch(0.84 0.18 70 / 0.11), transparent 46%),
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

        .sync-ok,
        .sync-warning {
            border-radius: 8px;
            padding: 8px 10px;
            margin-bottom: 10px;
            font-size: 0.62rem;
            font-weight: 900;
            line-height: 1.45;
        }

        .sync-ok {
            color: oklch(0.78 0.2 150);
            background: oklch(0.78 0.2 150 / 0.1);
            border: 1px solid oklch(0.78 0.2 150 / 0.22);
        }

        .sync-warning {
            color: oklch(0.84 0.18 70);
            background: oklch(0.84 0.18 70 / 0.1);
            border: 1px solid oklch(0.84 0.18 70 / 0.22);
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

        .sync-stack-list {
            margin-top: 12px;
            display: grid;
            gap: 7px;
        }

        .mini-section-title {
            color: var(--text-muted);
            font-size: 0.5rem;
            font-weight: 1000;
            letter-spacing: 0.12em;
            text-transform: uppercase;
        }

        .sync-signal-card {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
            border: 1px solid oklch(from var(--accent-color) l c h / 0.18);
            background: oklch(0.05 0 0 / 0.5);
            border-radius: 9px;
            padding: 8px;
        }

        .sync-signal-card strong,
        .sync-signal-card span,
        .sync-signal-card small {
            display: block;
            overflow-wrap: anywhere;
        }

        .sync-signal-card strong {
            color: white;
            font-size: 0.62rem;
            margin-bottom: 3px;
        }

        .sync-signal-card span,
        .sync-signal-card small {
            color: var(--text-muted);
            font-size: 0.52rem;
            line-height: 1.35;
        }

        .sync-signal-card > div:last-child {
            text-align: right;
            font-variant-numeric: tabular-nums;
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

        .execution-block-note {
            color: oklch(0.86 0.16 70);
            background: oklch(0.86 0.16 70 / 0.08);
            border: 1px solid oklch(0.86 0.16 70 / 0.22);
            border-radius: 9px;
            padding: 9px 10px;
            margin-bottom: 12px;
            font-size: 0.62rem;
            line-height: 1.45;
            font-weight: 900;
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
            letter-spacing: 0.08em;
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
        .flow-item { display: flex; justify-content: space-between; gap: 12px; font-size: 0.65rem; border-bottom: 1px solid oklch(0.2 0 0); padding: 4px 0; }
        .f-label { color: var(--text-muted); }
        .f-value { font-weight: 900; color: white; text-align: right; overflow-wrap: anywhere; }

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
            .chart-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .chart-controls-panel { grid-template-columns: 1fr; }
            .chart-guide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .chart-wrapper.main-viz { height: 500px; }
            .command-row.main { flex-direction: column; align-items: stretch; }
            .search-box-premium { max-width: none; }
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
            .search-box-premium { min-width: 0; width: 100%; }
            .input-premium { min-width: 0; }
            .analyze-btn { padding: 0 12px; }
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
            .sync-signal-card { grid-template-columns: 1fr; }
            .sync-signal-card > div:last-child { text-align: left; }
            .chart-wrapper.main-viz { height: 470px; }
            .chart-wrapper.secondary-viz { height: 220px; }
            .legend-grid, .insight-grid { grid-template-columns: 1fr; }
            .analysis-section, .screener-sync-panel, .historical-signals-section { padding: 14px; }
            .sig-item, .pivot-row, .flow-item { gap: 10px; }
        }

        @media (max-width: 420px) {
            .search-icon { margin: 0 8px; }
            .chart-wrapper.main-viz { height: 430px; }
        }
      `}</style>
    </div>
  );
}
