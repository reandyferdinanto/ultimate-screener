"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type BreakoutSignal = {
  ticker: string;
  strategy: string;
  buyArea: number;
  tp: number;
  sl: number | null;
  currentPrice: number;
  deltaPct: number | null;
  relevanceScore: number;
  vector: string;
  lastScannedAt?: string;
  metadata?: Record<string, unknown>;
};

function formatNumber(value: unknown, digits = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "-";
}

function formatPct(value: unknown, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(digits)}%` : "-";
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SilentFlyerReplacementPage() {
  const [signals, setSignals] = useState<BreakoutSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadBreakouts() {
    setLoading(true);
    try {
      const res = await fetch("/api/screener?category=TECHNICAL_BREAKOUT&livePrices=false", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Load failed ${res.status}`);
      setSignals(json.data || []);
      setMessage(json.scanMeta?.latestSignalAt ? `Latest scan: ${formatDate(json.scanMeta.latestSignalAt)}` : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load breakout screener");
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setScanning(true);
    setMessage("Running full screener scan, including Technical Breakout Pattern...");
    try {
      const res = await fetch("/api/screener/scan", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Scan failed ${res.status}`);
      setMessage("Scan complete. Refreshing breakout candidates...");
      await loadBreakouts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    loadBreakouts();
  }, []);

  return (
    <div className="breakout-shell">
      <section className="breakout-hero scanline-container">
        <div>
          <div className="eyebrow">SILENT FLYER REPLACEMENT</div>
            <h1>Technical Breakout Pattern</h1>
          <p>
            Screener berbasis research TECHNICAL-BREAKOUT-PATTERNS: tight-flat accumulation base,
            higher lows, volume expansion, RSI kuat, dan breakout yang belum terlalu extended.
          </p>
        </div>
        <div className="hero-actions">
          <button className="button button-active" onClick={runScan} disabled={scanning || loading}>
            {scanning ? "SCANNING..." : "RUN BREAKOUT SCAN"}
          </button>
          <Link href="/screener" className="ghost-link">OPEN FULL SCREENER</Link>
        </div>
      </section>

      {message && <div className="status-line">{message}</div>}

      <section className="metric-grid">
        <div><span>{signals.length}</span><small>CANDIDATES</small></div>
        <div><span>{signals[0]?.relevanceScore || 0}</span><small>TOP SCORE</small></div>
        <div><span>{signals.filter(item => item.vector === "TIGHT_FLAT_ACCUMULATION").length}</span><small>TIGHT BASE</small></div>
        <div><span>{signals.filter(item => item.vector === "NEAR_BREAKOUT_WATCHLIST").length}</span><small>NEAR BO</small></div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span>BREAKOUT_100_CANDIDATES</span>
          <button className="mini-button" onClick={loadBreakouts} disabled={loading}>REFRESH</button>
        </div>
        {loading ? (
          <div className="empty-state">Loading breakout candidates...</div>
        ) : signals.length === 0 ? (
          <div className="empty-state">No active Technical Breakout candidates. Run scan untuk update data terbaru.</div>
        ) : (
          <div className="table-container custom-scrollbar">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Ticker</th>
                  <th>Pattern</th>
                  <th className="text-right">Score</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Target</th>
                  <th className="text-right">Stop</th>
                  <th className="text-right">Base</th>
                  <th className="text-right">Dist BO</th>
                  <th className="text-right">Vol</th>
                  <th className="text-right">RSI</th>
                  <th>Last Scan</th>
                  <th>Intel</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((item, index) => (
                  <tr key={`${item.ticker}-${item.vector}`}>
                    <td>{index + 1}</td>
                    <td><b className="positive">{item.ticker.replace(".JK", "")}</b></td>
                    <td><span className="pattern-pill">{String(item.vector).replace(/_/g, " ")}</span></td>
                    <td className="text-right glow-text-amber"><b>{item.relevanceScore}</b></td>
                    <td className="text-right">{formatNumber(item.buyArea)}</td>
                    <td className="text-right positive">{formatNumber(item.tp)}</td>
                    <td className="text-right negative">{formatNumber(item.sl)}</td>
                    <td className="text-right">{formatPct(item.metadata?.baseRangePct)} / {formatPct(item.metadata?.baseSlopePct)}</td>
                    <td className="text-right">{formatPct(item.metadata?.distanceToBaseHighPct)}</td>
                    <td className="text-right">{formatNumber(item.metadata?.breakoutVolumeRatio20, 2)}x</td>
                    <td className="text-right">{formatNumber(item.metadata?.breakoutRsi14, 1)}</td>
                    <td>{formatDate(item.lastScannedAt)}</td>
                    <td><Link className="intel-link" href={`/search?symbol=${item.ticker}`}>ANALYZE</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style jsx>{`
        .breakout-shell { display: flex; flex-direction: column; gap: 14px; }
        .breakout-hero { border: 1px solid var(--border-color); min-height: 230px; padding: 28px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; background: radial-gradient(circle at 80% 20%, oklch(0.84 0.18 75 / 0.18), transparent 34%), linear-gradient(135deg, oklch(0.16 0 0), oklch(0.08 0 0)); }
        .eyebrow { color: var(--accent-amber); font-weight: 900; letter-spacing: 0.18em; font-size: 0.68rem; margin-bottom: 12px; }
        h1 { font-size: clamp(2.3rem, 7vw, 5rem); line-height: 0.9; letter-spacing: -0.08em; text-transform: uppercase; margin-bottom: 16px; }
        p { color: var(--text-secondary); max-width: 760px; line-height: 1.6; }
        .hero-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
        .ghost-link, .mini-button { border: 1px solid var(--border-color); color: var(--text-secondary); background: transparent; min-height: 40px; padding: 10px 12px; font-family: var(--font-mono); font-size: 0.68rem; font-weight: 900; letter-spacing: 0.08em; cursor: pointer; display: inline-flex; align-items: center; }
        .ghost-link:hover, .mini-button:hover { border-color: var(--accent-green); color: var(--accent-green); }
        .status-line { color: var(--accent-amber); font-size: 0.75rem; border: 1px solid var(--border-color); padding: 10px 12px; background: var(--bg-panel); }
        .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 12px; }
        .metric-grid div { border: 1px solid var(--border-color); background: var(--bg-panel); padding: 16px; }
        .metric-grid span { display: block; color: var(--accent-green); font-size: 1.8rem; font-weight: 900; }
        .metric-grid small { color: var(--text-secondary); }
        .empty-state { padding: 32px 12px; color: var(--text-secondary); text-align: center; }
        .table-container table { min-width: 1120px; }
        .pattern-pill { border: 1px solid var(--border-color); padding: 4px 6px; font-size: 0.62rem; font-weight: 900; color: var(--accent-amber); }
        .intel-link { color: var(--accent-green); font-size: 0.68rem; font-weight: 900; }
        @media (max-width: 900px) {
          .breakout-hero { display: grid; padding: 18px; min-height: auto; }
          .hero-actions { justify-content: stretch; }
          .hero-actions > * { flex: 1; justify-content: center; }
          .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 520px) {
          .breakout-hero { padding: 16px; }
          h1 { font-size: clamp(2rem, 15vw, 3.2rem); }
          p { font-size: 0.78rem; }
          .hero-actions > * { flex-basis: 100%; }
          .metric-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
