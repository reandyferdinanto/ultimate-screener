"use client";

import React, { startTransition, useState } from "react";
import Link from "next/link";
import { BrainCircuit, Check, Copy, Loader2, Radar, SlidersHorizontal, Target } from "lucide-react";

type Candidate = {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  setupState: "BREAKOUT" | "NEAR_BREAKOUT" | "BASE_FORMING" | "EXTENDED";
  score: number;
  lastDate: string;
  currentClose: number;
  baseLow: number;
  baseHigh: number;
  distanceToBaseHighPct: number;
  upsideTo50FromBaseLowPct: number;
  upsideTo100FromBaseLowPct: number;
  features: Record<string, number | boolean | string | null>;
  scoreBreakdown: Record<string, number>;
  featureScores: Record<string, number>;
};

type ScanResult = {
  scannedAt: string;
  universeCount: number;
  scanned: number;
  failed: number;
  patternEventCount: number;
  pattern: Record<string, number>;
  candidates: Candidate[];
  aiDigest: string;
};

function formatNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export default function SimilarWinnersPage() {
  const [limit, setLimit] = useState(120);
  const [periodYears, setPeriodYears] = useState(2);
  const [concurrency, setConcurrency] = useState(6);
  const [scanAll, setScanAll] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const aiPayload = result ? JSON.stringify({
    purpose: "Ranking saham IDX yang paling mirip dengan historical winners sebelum naik 50-100%.",
    scannedAt: result.scannedAt,
    patternEventCount: result.patternEventCount,
    pattern: result.pattern,
    candidates: result.candidates.slice(0, 50),
    instruction: "Analisa kandidat teratas. Pisahkan yang paling layak, yang sudah terlalu extended, dan yang butuh konfirmasi breakout/volume.",
  }, null, 2) : "";

  async function runScan() {
    setLoading(true);
    setMessage(scanAll ? "Scanning semua saham IDX. Ini bisa lama dan tergantung rate-limit Yahoo..." : `Scanning ${limit} saham pertama...`);
    try {
      const params = new URLSearchParams({
        periodYears: String(periodYears),
        concurrency: String(concurrency),
      });
      if (scanAll) params.set("all", "true");
      else params.set("limit", String(limit));

      const res = await fetch(`/api/research/similar?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Scan failed ${res.status}`);

      startTransition(() => setResult(json.data));
      setMessage(`Scan selesai: ${json.data.scanned} saham, ${json.data.failed} gagal, ${json.data.candidates.length} kandidat.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scan gagal");
    } finally {
      setLoading(false);
    }
  }

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(aiPayload);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  return (
    <div className="similar-shell">
      <section className="similar-hero scanline-container">
        <div>
          <div className="eyebrow"><Radar size={14} /> FIND SIMILAR WINNERS</div>
          <h1>Similarity Scanner</h1>
          <p>Bangun pola dari corpus winner di `/research`, scan saham IDX, lalu ranking kandidat yang setup teknikalnya paling mirip sebelum potensi gain 50-100%.</p>
        </div>
        <Link href="/research" className="back-link">BACK TO CORPUS</Link>
      </section>

      <section className="panel control-panel">
        <div className="panel-header">
          <span><SlidersHorizontal size={13} /> SCAN CONTROL</span>
          <span>{loading ? "RUNNING" : "READY"}</span>
        </div>
        <div className="control-grid">
          <label>
            <span>LIMIT</span>
            <input disabled={scanAll} value={limit} onChange={(event) => setLimit(Number(event.target.value))} type="number" min={1} max={957} />
          </label>
          <label>
            <span>PERIODE</span>
            <select value={periodYears} onChange={(event) => setPeriodYears(Number(event.target.value))}>
              <option value={1}>1 tahun</option>
              <option value={2}>2 tahun</option>
              <option value={3}>3 tahun</option>
            </select>
          </label>
          <label>
            <span>CONCURRENCY</span>
            <input value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} type="number" min={1} max={16} />
          </label>
          <label className="check-line">
            <input checked={scanAll} onChange={(event) => setScanAll(event.target.checked)} type="checkbox" />
            <span>SCAN ALL IDX</span>
          </label>
          <button className="button button-active" onClick={runScan} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <Radar size={14} />}
            FIND SIMILAR WINNERS
          </button>
        </div>
        {message && <div className="status-line">{message}</div>}
      </section>

      {result && (
        <>
          <section className="metric-grid">
            <div><span>{result.scanned}</span><small>SCANNED</small></div>
            <div><span>{result.patternEventCount}</span><small>WINNER EVENTS</small></div>
            <div><span>{result.candidates[0]?.score || 0}</span><small>TOP SCORE</small></div>
            <div><span>{result.failed}</span><small>FAILED</small></div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <span><Target size={13} /> RANKED CANDIDATES</span>
              <span>{result.candidates.length} RECORDS</span>
            </div>
            <div className="table-container candidate-table">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Ticker</th>
                    <th>State</th>
                    <th>Score</th>
                    <th>Breakdown</th>
                    <th>Close</th>
                    <th>Base</th>
                    <th>Dist BO</th>
                    <th>Upside 50</th>
                    <th>Upside 100</th>
                    <th>Vol BO</th>
                    <th>RSI</th>
                    <th>ATR%</th>
                    <th>Liquidity</th>
                    <th>Sector</th>
                  </tr>
                </thead>
                <tbody>
                  {result.candidates.map((item, index) => (
                    <tr key={item.ticker}>
                      <td>{index + 1}</td>
                      <td><b className="positive">{item.symbol}</b><br /><small>{item.name}</small></td>
                      <td><span className={`state-pill ${item.setupState.toLowerCase()}`}>{item.setupState}</span></td>
                      <td className="glow-text-amber"><b>{item.score}</b></td>
                      <td className="breakdown-cell">
                        <span>S {formatNumber(item.scoreBreakdown.similarityScore, 0)}</span>
                        <span>Rdy {formatNumber(item.scoreBreakdown.breakoutReadiness, 0)}</span>
                        <span>Risk {formatNumber(item.scoreBreakdown.riskScore, 0)}</span>
                        <span>Liq {formatNumber(item.scoreBreakdown.liquidityScore, 0)}</span>
                        <span>Late {formatNumber(item.scoreBreakdown.notTooLateScore, 0)}</span>
                      </td>
                      <td>{formatNumber(item.currentClose, 0)}</td>
                      <td>{formatNumber(item.baseLow, 0)} - {formatNumber(item.baseHigh, 0)}</td>
                      <td>{formatNumber(item.distanceToBaseHighPct, 1)}%</td>
                      <td>{formatNumber(item.upsideTo50FromBaseLowPct, 1)}%</td>
                      <td>{formatNumber(item.upsideTo100FromBaseLowPct, 1)}%</td>
                      <td>{formatNumber(Number(item.features.breakoutVolumeRatio20), 2)}</td>
                      <td>{formatNumber(Number(item.features.breakoutRsi14), 1)}</td>
                      <td>{formatNumber(Number(item.features.breakoutAtrPct), 1)}%</td>
                      <td>{formatNumber(Number(item.features.baseAvgTradedValueB), 1)}B / {formatNumber(Number(item.features.breakoutTradedValueB), 1)}B</td>
                      <td>{item.sector}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel ai-panel">
            <div className="panel-header">
              <span><BrainCircuit size={13} /> AI REVIEW PAYLOAD</span>
              <button className={`copy-button ${copyState === "copied" ? "copied" : ""}`} onClick={copyPayload} type="button">
                {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
                {copyState === "copied" ? "COPIED" : copyState === "error" ? "COPY FAILED" : "COPY TOP 50"}
              </button>
            </div>
            <pre>{aiPayload}</pre>
          </section>
        </>
      )}

      <style jsx>{`
        .similar-shell { display: flex; flex-direction: column; gap: 14px; }
        .similar-hero { border: 1px solid var(--border-color); min-height: 210px; padding: 28px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; background: radial-gradient(circle at 80% 20%, oklch(0.85 0.15 80 / 0.16), transparent 34%), linear-gradient(135deg, oklch(0.17 0 0), oklch(0.09 0 0)); }
        .eyebrow { display: flex; align-items: center; gap: 8px; color: var(--accent-amber); font-weight: 900; letter-spacing: 0.18em; font-size: 0.68rem; margin-bottom: 12px; }
        h1 { font-size: clamp(2.4rem, 7vw, 5.4rem); line-height: 0.9; letter-spacing: -0.08em; text-transform: uppercase; margin-bottom: 16px; }
        p { color: var(--text-secondary); max-width: 740px; }
        .back-link { border: 1px solid var(--border-color); color: var(--accent-green); padding: 10px 12px; font-size: 0.7rem; font-weight: 800; white-space: nowrap; }
        .control-panel .panel-header span { display: inline-flex; align-items: center; gap: 8px; }
        .control-grid { display: grid; grid-template-columns: 130px 150px 150px 150px minmax(220px, 1fr); gap: 12px; align-items: end; }
        label { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; }
        input, select { background: oklch(0.1 0 0); border: 1px solid var(--border-color); color: var(--text-primary); font-family: var(--font-mono); padding: 10px 11px; outline: none; min-height: 42px; }
        .check-line { flex-direction: row; align-items: center; padding-bottom: 10px; }
        .check-line input { width: auto; }
        .status-line { margin-top: 12px; color: var(--accent-amber); font-size: 0.75rem; }
        .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 12px; }
        .metric-grid div { border: 1px solid var(--border-color); background: var(--bg-panel); padding: 16px; }
        .metric-grid span { display: block; color: var(--accent-green); font-size: 1.8rem; font-weight: 900; }
        small { color: var(--text-secondary); white-space: normal; }
        .candidate-table { max-height: 620px; }
        .candidate-table table { min-width: 1280px; }
        .state-pill { border: 1px solid var(--border-color); padding: 4px 6px; font-size: 0.62rem; font-weight: 900; }
        .state-pill.breakout, .state-pill.near_breakout { color: var(--accent-green); border-color: var(--accent-green); }
        .state-pill.extended { color: var(--accent-red); border-color: var(--accent-red); }
        .breakdown-cell { display: flex; gap: 4px; flex-wrap: wrap; min-width: 210px; }
        .breakdown-cell span { border: 1px solid var(--border-color); padding: 2px 4px; color: var(--text-secondary); font-size: 0.58rem; }
        .copy-button { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary); font-family: var(--font-mono); font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; padding: 6px 9px; cursor: pointer; min-height: 40px; }
        .copy-button:hover, .copy-button.copied { border-color: var(--accent-green); color: var(--accent-green); background: oklch(0.82 0.18 145 / 0.08); }
        .ai-panel pre { white-space: pre-wrap; overflow: auto; background: oklch(0.09 0 0); border: 1px solid var(--border-color); padding: 14px; color: var(--text-secondary); font-size: 0.72rem; max-height: 480px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1000px) {
          .similar-hero, .control-grid { display: grid; grid-template-columns: 1fr; }
          .similar-hero { padding: 18px; min-height: auto; }
          .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .back-link { width: max-content; min-height: 40px; display: inline-flex; align-items: center; }
          h1 { font-size: clamp(2.1rem, 13vw, 3.6rem); }
          .control-grid .button { width: 100%; }
          .candidate-table { max-height: 560px; }
        }
        @media (max-width: 480px) {
          .similar-hero { padding: 16px; }
          .back-link { width: 100%; justify-content: center; }
          .metric-grid { grid-template-columns: 1fr; }
          .control-grid input,
          .control-grid select,
          .control-grid button { width: 100%; }
          .check-line { padding-bottom: 0; }
          .ai-panel pre { font-size: 0.68rem; }
        }
      `}</style>
    </div>
  );
}
