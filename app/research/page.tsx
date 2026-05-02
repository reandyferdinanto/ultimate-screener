"use client";

import React, { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { BrainCircuit, Check, Copy, Database, Download, FileJson, Loader2, Target, TrendingUp } from "lucide-react";

type BreakoutEvent = {
  id?: string;
  threshold: 50 | 100;
  ticker: string;
  symbol: string;
  sidewaysStart: string;
  sidewaysEnd: string;
  breakoutDate: string;
  targetDate: string | null;
  peakDate: string;
  daysToTarget: number | null;
  daysToPeak: number;
  returnFromBaseLowPct: number;
  returnFromBreakoutPct: number;
  features: Record<string, number | boolean | string | null>;
  riskMetrics?: Record<string, number | string | null>;
  label?: "unreviewed" | "winner" | "failed_breakout" | "false_breakout" | "too_late" | "watchlist";
  notes?: string;
};

type ResearchDataset = {
  ticker: string;
  symbol: string;
  requestedTicker: string;
  periodYears: number;
  downloadedAt: string;
  candles: number;
  firstDate: string | null;
  lastDate: string | null;
  latestClose: number | null;
  analysis: {
    events50: BreakoutEvent[];
    events100: BreakoutEvent[];
    eventSummary: {
      event50Count?: number;
      event100Count?: number;
      bestReturnPct?: number;
      fastestTargetDays?: number | null;
      featureAverages?: Record<string, number>;
    };
    aiDigest: string;
  };
};

function formatNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function eventLabel(event: BreakoutEvent) {
  return `${event.symbol} +${event.threshold}% ${event.sidewaysEnd} -> ${event.peakDate}`;
}

export default function ResearchPage() {
  const [ticker, setTicker] = useState("BUMI");
  const [periodYears, setPeriodYears] = useState(2);
  const [datasets, setDatasets] = useState<ResearchDataset[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const selected = datasets.find(item => item.symbol === selectedSymbol) || datasets[0] || null;
  const allEvents = datasets.flatMap(item => [
    ...item.analysis.events100.map(event => ({ ...event, sourceSymbol: item.symbol })),
    ...item.analysis.events50.map(event => ({ ...event, sourceSymbol: item.symbol })),
  ]).sort((a, b) => b.returnFromBaseLowPct - a.returnFromBaseLowPct);
  const aiCorpus = {
    purpose: "Cari ciri teknikal saham IDX sebelum naik minimal 50% sampai 100% dari fase sideways awal.",
    generatedAt: datasets[0]?.downloadedAt || null,
    datasetCount: datasets.length,
    eventCount: allEvents.length,
    records: datasets.map(item => ({
      ticker: item.ticker,
      period: `${item.firstDate} to ${item.lastDate}`,
      candles: item.candles,
      summary: item.analysis.eventSummary,
      aiDigest: item.analysis.aiDigest,
      events50: item.analysis.events50,
      events100: item.analysis.events100,
    })),
  };
  const aiCorpusJson = JSON.stringify(aiCorpus, null, 2);

  async function copyAiCorpus() {
    try {
      await navigator.clipboard.writeText(aiCorpusJson);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  async function loadDatasets() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/research/yfinance", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Load failed ${res.status}`);
      startTransition(() => {
        setDatasets(json.data || []);
        setSelectedSymbol((current) => current || json.data?.[0]?.symbol || null);
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal load dataset");
    } finally {
      setLoadingList(false);
    }
  }

  async function downloadTicker(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTicker = ticker.trim();
    if (!cleanTicker) return;

    setLoading(true);
    setMessage(`Downloading ${cleanTicker.toUpperCase()} dari Yahoo Finance...`);
    try {
      const res = await fetch("/api/research/yfinance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: cleanTicker, periodYears }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Download failed ${res.status}`);

      setMessage(`${json.data.ticker} tersimpan: ${json.data.candles} candle, ${json.data.analysis.eventSummary.event50Count || 0} event 50%, ${json.data.analysis.eventSummary.event100Count || 0} event 100%.`);
      setSelectedSymbol(json.data.symbol);
      await loadDatasets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download gagal");
    } finally {
      setLoading(false);
    }
  }

  function updateEventLocally(eventId: string, label: BreakoutEvent["label"], notes: string) {
    setDatasets(current => current.map(dataset => ({
      ...dataset,
      analysis: {
        ...dataset.analysis,
        events50: dataset.analysis.events50.map(event => event.id === eventId ? { ...event, label, notes } : event),
        events100: dataset.analysis.events100.map(event => event.id === eventId ? { ...event, label, notes } : event),
      },
    })));
  }

  async function saveEventLabel(eventId: string | undefined, label: BreakoutEvent["label"], notes: string) {
    if (!eventId) return;
    updateEventLocally(eventId, label || "unreviewed", notes);
    try {
      const res = await fetch("/api/research/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, label: label || "unreviewed", notes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Label save failed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal simpan label");
    }
  }

  useEffect(() => {
    loadDatasets();
  }, []);

  return (
    <div className="research-shell">
      <section className="research-hero scanline-container">
        <div>
          <div className="eyebrow"><BrainCircuit size={14} /> AI PATTERN LAB</div>
          <h1>YFinance Breakout Research</h1>
          <p>
            Kumpulkan candle harian IDX, simpan ke database file lokal, lalu cari pola teknikal sebelum harga naik 50% sampai 100% dari fase sideways.
          </p>
        </div>
        <div className="hero-stats">
          <div><span>{datasets.length}</span><small>DATASET</small></div>
          <div><span>{allEvents.length}</span><small>EVENT</small></div>
          <div><span>{formatNumber(Math.max(0, ...allEvents.map(item => item.returnFromBaseLowPct)), 0)}%</span><small>BEST</small></div>
        </div>
        <Link href="/research/similar" className="similar-link">FIND SIMILAR WINNERS</Link>
      </section>

      <form className="download-panel panel" onSubmit={downloadTicker}>
        <div className="panel-header">
          <span><Download size={13} /> DOWNLOAD DATASET</span>
          <span>{loading ? "RUNNING" : "READY"}</span>
        </div>
        <div className="download-grid">
          <label>
            <span>TICKER IDX</span>
            <input value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder="BUMI" autoComplete="off" />
          </label>
          <label>
            <span>PERIODE</span>
            <select value={periodYears} onChange={(event) => setPeriodYears(Number(event.target.value))}>
              <option value={1}>1 tahun</option>
              <option value={2}>2 tahun</option>
              <option value={3}>3 tahun</option>
              <option value={5}>5 tahun</option>
            </select>
          </label>
          <button className="button button-active" type="submit" disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            DOWNLOAD / ENTER
          </button>
        </div>
        {message && <div className="status-line">{message}</div>}
      </form>

      <section className="research-grid">
        <div className="panel dataset-panel">
          <div className="panel-header">
            <span><Database size={13} /> STORED CORPUS</span>
            <button className="mini-button" onClick={loadDatasets} disabled={loadingList}>REFRESH</button>
          </div>
          <div className="dataset-list">
            {datasets.length === 0 && <div className="empty-state">Belum ada dataset. Download BUMI atau ticker lain dulu.</div>}
            {datasets.map(item => (
              <button
                key={item.symbol}
                className={`dataset-card ${selected?.symbol === item.symbol ? "active" : ""}`}
                onClick={() => setSelectedSymbol(item.symbol)}
              >
                <strong>{item.ticker}</strong>
                <span>{item.candles} candle | close {formatNumber(item.latestClose, 0)}</span>
                <small>{item.firstDate} - {item.lastDate}</small>
                <em>{item.analysis.eventSummary.event50Count || 0}x 50% / {item.analysis.eventSummary.event100Count || 0}x 100%</em>
              </button>
            ))}
          </div>
        </div>

        <div className="panel insight-panel">
          <div className="panel-header">
            <span><Target size={13} /> SELECTED ANALYSIS</span>
            <span>{selected?.ticker || "NO DATA"}</span>
          </div>
          {selected ? (
            <>
              <div className="metric-grid">
                <div><span>{selected.candles}</span><small>CANDLES</small></div>
                <div><span>{selected.analysis.eventSummary.event50Count || 0}</span><small>50% EVENTS</small></div>
                <div><span>{selected.analysis.eventSummary.event100Count || 0}</span><small>100% EVENTS</small></div>
                <div><span>{formatNumber(selected.analysis.eventSummary.bestReturnPct, 0)}%</span><small>BEST RETURN</small></div>
              </div>
              <pre className="digest">{selected.analysis.aiDigest}</pre>
              <div className="feature-cloud">
                {Object.entries(selected.analysis.eventSummary.featureAverages || {}).map(([key, value]) => (
                  <span key={key}>{key}: <b>{formatNumber(value, 2)}</b></span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">Pilih atau download ticker untuk melihat analisis.</div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span><TrendingUp size={13} /> BREAKOUT EVENTS</span>
          <div className="header-actions">
            <a href="/api/research/export?format=csv">EXPORT CSV</a>
            <a href="/api/research/export?format=json" target="_blank" rel="noreferrer">EXPORT JSON</a>
            <span>{allEvents.length} RECORDS</span>
          </div>
        </div>
        <div className="table-container event-table">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Sideways</th>
                <th>Breakout</th>
                <th>Peak</th>
                <th>Return</th>
                <th>Risk</th>
                <th>Liquidity</th>
                <th>Base Range</th>
                <th>Vol Dry</th>
                <th>Vol BO</th>
                <th>RSI</th>
                <th>ATR%</th>
                <th>Label</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {allEvents.slice(0, 80).map((item) => (
                <tr key={item.id || eventLabel(item)}>
                  <td><b>{item.symbol}</b> <span className={item.threshold === 100 ? "glow-text-amber" : "positive"}>+{item.threshold}%</span></td>
                  <td>{item.sidewaysStart} - {item.sidewaysEnd}</td>
                  <td>{item.breakoutDate}</td>
                  <td>{item.peakDate}</td>
                  <td className="positive">{formatNumber(item.returnFromBaseLowPct, 1)}%</td>
                  <td className="negative">{formatNumber(Number(item.riskMetrics?.maxDrawdownBeforeTargetPct ?? item.features.maxDrawdownBeforeTargetPct), 1)}%</td>
                  <td>{formatNumber(Number(item.features.baseAvgTradedValueB), 1)}B / {formatNumber(Number(item.features.breakoutTradedValueB), 1)}B</td>
                  <td>{formatNumber(Number(item.features.baseRangePct), 1)}%</td>
                  <td>{formatNumber(Number(item.features.volumeDryUpRatio), 2)}</td>
                  <td>{formatNumber(Number(item.features.breakoutVolumeRatio20), 2)}</td>
                  <td>{formatNumber(Number(item.features.breakoutRsi14), 1)}</td>
                  <td>{formatNumber(Number(item.features.breakoutAtrPct), 1)}%</td>
                  <td>
                    <select
                      className="label-select"
                      value={item.label || "unreviewed"}
                      onChange={(event) => saveEventLabel(item.id, event.target.value as BreakoutEvent["label"], item.notes || "")}
                    >
                      <option value="unreviewed">unreviewed</option>
                      <option value="winner">winner</option>
                      <option value="failed_breakout">failed</option>
                      <option value="false_breakout">false BO</option>
                      <option value="too_late">too late</option>
                      <option value="watchlist">watchlist</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="notes-input"
                      defaultValue={item.notes || ""}
                      placeholder="catatan manual..."
                      onBlur={(event) => saveEventLabel(item.id, item.label || "unreviewed", event.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel ai-panel">
        <div className="panel-header">
          <span><FileJson size={13} /> AI-READY CORPUS</span>
          <button className={`copy-button ${copyState === "copied" ? "copied" : ""}`} onClick={copyAiCorpus} type="button">
            {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
            {copyState === "copied" ? "COPIED" : copyState === "error" ? "COPY FAILED" : "COPY ALL"}
          </button>
        </div>
        <pre>{aiCorpusJson}</pre>
      </section>

      <style jsx>{`
        .research-shell { display: flex; flex-direction: column; gap: 14px; }
        .research-hero {
          position: relative;
          min-height: 220px;
          border: 1px solid var(--border-color);
          background:
            radial-gradient(circle at 20% 20%, oklch(0.82 0.18 145 / 0.16), transparent 32%),
            linear-gradient(135deg, oklch(0.18 0 0), oklch(0.10 0 0));
          padding: 28px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 20px;
          align-items: end;
        }
        .eyebrow { display: flex; align-items: center; gap: 8px; color: var(--accent-green); font-weight: 800; letter-spacing: 0.18em; font-size: 0.68rem; margin-bottom: 12px; }
        h1 { font-size: clamp(2rem, 6vw, 4.8rem); line-height: 0.9; letter-spacing: -0.08em; text-transform: uppercase; margin-bottom: 16px; }
        p { color: var(--text-secondary); max-width: 760px; font-size: 0.92rem; }
        .hero-stats, .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(100px, 1fr)); gap: 10px; }
        .similar-link { position: absolute; right: 20px; top: 20px; border: 1px solid var(--accent-amber); color: var(--accent-amber); padding: 9px 11px; font-size: 0.68rem; font-weight: 900; letter-spacing: 0.08em; background: oklch(0.85 0.15 80 / 0.06); }
        .similar-link:hover { box-shadow: var(--glow-green); border-color: var(--accent-green); color: var(--accent-green); }
        .hero-stats div, .metric-grid div { border: 1px solid var(--border-color); background: oklch(0.1 0 0 / 0.65); padding: 14px; }
        .hero-stats span, .metric-grid span { display: block; color: var(--accent-green); font-size: 1.6rem; font-weight: 900; }
        small { color: var(--text-secondary); font-size: 0.62rem; letter-spacing: 0.08em; }
        .download-panel .panel-header span { display: inline-flex; align-items: center; gap: 8px; }
        .header-actions { display: inline-flex; align-items: center; gap: 10px; }
        .header-actions a { color: var(--accent-green); border: 1px solid var(--border-color); padding: 4px 7px; font-size: 0.62rem; }
        .header-actions a:hover { border-color: var(--accent-green); }
        .download-grid { display: grid; grid-template-columns: minmax(180px, 1fr) 160px 220px; gap: 12px; align-items: end; }
        label { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; }
        input, select { background: oklch(0.1 0 0); border: 1px solid var(--border-color); color: var(--text-primary); font-family: var(--font-mono); padding: 11px 12px; outline: none; }
        input:focus, select:focus { border-color: var(--accent-green); box-shadow: var(--glow-green); }
        .label-select { padding: 6px 8px; min-width: 125px; }
        .notes-input { padding: 6px 8px; min-width: 220px; }
        .status-line { margin-top: 12px; color: var(--accent-amber); font-size: 0.75rem; }
        .research-grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 14px; }
        .dataset-list { display: flex; flex-direction: column; gap: 8px; max-height: 520px; overflow: auto; }
        .dataset-card { text-align: left; background: oklch(0.12 0 0); color: var(--text-primary); border: 1px solid var(--border-color); padding: 12px; font-family: var(--font-mono); cursor: pointer; display: grid; gap: 3px; }
        .dataset-card:hover, .dataset-card.active { border-color: var(--accent-green); background: oklch(0.82 0.18 145 / 0.07); }
        .dataset-card strong { color: var(--accent-green); font-size: 1rem; }
        .dataset-card span, .dataset-card em { color: var(--text-secondary); font-size: 0.72rem; font-style: normal; }
        .mini-button { background: transparent; border: 0; color: var(--accent-green); font-family: var(--font-mono); cursor: pointer; font-size: 0.65rem; }
        .copy-button { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary); font-family: var(--font-mono); font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; padding: 6px 9px; cursor: pointer; min-height: 40px; }
        .copy-button:hover, .copy-button.copied { border-color: var(--accent-green); color: var(--accent-green); background: oklch(0.82 0.18 145 / 0.08); }
        .metric-grid { grid-template-columns: repeat(4, minmax(120px, 1fr)); margin-bottom: 12px; }
        .digest, .ai-panel pre { white-space: pre-wrap; overflow: auto; background: oklch(0.09 0 0); border: 1px solid var(--border-color); padding: 14px; color: var(--text-secondary); font-size: 0.72rem; }
        .feature-cloud { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .feature-cloud span { border: 1px solid var(--border-color); padding: 6px 8px; color: var(--text-secondary); font-size: 0.68rem; }
        .feature-cloud b { color: var(--text-primary); }
        .event-table { max-height: 460px; }
        .ai-panel pre { max-height: 520px; }
        .empty-state { color: var(--text-secondary); border: 1px dashed var(--border-color); padding: 18px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .research-shell { gap: 12px; }
          .research-hero { padding: 18px; min-height: auto; padding-top: 62px; }
          .research-hero, .research-grid, .download-grid { grid-template-columns: 1fr; }
          .hero-stats, .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .similar-link { left: 18px; right: auto; top: 16px; min-height: 40px; display: inline-flex; align-items: center; }
          h1 { font-size: clamp(2rem, 13vw, 3.3rem); }
          .download-grid button { width: 100%; }
          .dataset-list { max-height: 360px; }
          .header-actions { width: 100%; overflow-x: auto; padding-bottom: 2px; }
          .header-actions a { min-height: 36px; display: inline-flex; align-items: center; flex: 0 0 auto; }
          .event-table { max-height: 520px; }
          .label-select, .notes-input { min-height: 40px; }
        }
        @media (max-width: 480px) {
          .hero-stats, .metric-grid { grid-template-columns: 1fr; }
          .feature-cloud span { width: 100%; }
          .ai-panel pre, .digest { font-size: 0.68rem; }
        }
      `}</style>
    </div>
  );
}
