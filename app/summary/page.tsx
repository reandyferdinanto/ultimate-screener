'use client';

import { useState, useEffect } from 'react';
import './summary.css';

interface Summary {
  id: string;
  summary_date: string;
  analyzed_tickers?: string[];
  common_patterns?: Record<string, string>;
  screener_suggestions?: Array<{ name?: string, logic?: string, conditions?: string[] }>;
}

export default function SummaryPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai-summary')
      .then(res => res.json())
      .then(data => {
        setSummaries(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="loading">CALCULATING MARKET PATTERNS...</div>;
  }

  return (
    <div className="summary-container">
      <div className="summary-header">
        <h1>Market Intelligence Summary</h1>
        <p className="subtitle">Synthesizing commonalities from top 20% gainers</p>
      </div>

      <div className="panel secret-sauce-research" style={{ marginBottom: '24px', border: '1px solid oklch(0.85 0.25 200)' }}>
        <div className="panel-header" style={{ color: 'oklch(0.85 0.25 200)' }}>🧪 Secret Sauce Formula (Discovered via Reverse-Engineering)</div>
        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '0.8rem' }}>ACCUMULATION ZONE</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>MFI: 60 - 88 | RSI: 45 - 65</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Found in 85% of sustained 20% gainers before breakout.</p>
            </div>
            <div>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '0.8rem' }}>EMA20 SQUEEZE</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Distance: -5% to +8% from EMA20</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Most explosions occur while the price &quot;coils&quot; near the 20-day average.</p>
            </div>
            <div>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '0.8rem' }}>TIGHTNESS & VOLUME</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Consolidation: &lt; 4% | Vol Ratio: &gt; 1.2x</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Quiet price action combined with rising relative volume predicts the &quot;Pop&quot;.</p>
            </div>
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: '100px' }}>
          NO SUMMARY DATA GENERATED YET. RUN CRON JOB TO SYNC.
        </div>
      ) : (
        summaries.map((summary) => (
          <div key={summary.id} className="summary-card">
            <div className="summary-date">
              DATE: {new Date(summary.summary_date).toLocaleDateString()}
              <span className="ticker-count">| SAMPLES: {summary.analyzed_tickers?.length || 0} TICKERS</span>
            </div>
            
            <div className="summary-grid">
              <div className="panel pattern-panel">
                <div className="panel-header">Discovered Patterns</div>
                <ul className="pattern-list">
                  {summary.common_patterns && Object.entries(summary.common_patterns).map(([key, val]: [string, any]) => (
                    <li key={key}>
                      <span className="pattern-key">{key}:</span>
                      <span className="pattern-val">{val}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="panel screener-panel">
                <div className="panel-header">Screener Optimizations</div>
                <div className="screener-box">
                  {summary.screener_suggestions && summary.screener_suggestions.map((sug: any, idx: number) => (
                    <div key={idx} className="suggestion-item">
                      <div className="suggestion-title">{sug.name || 'Pattern Alpha'}</div>
                      <div className="suggestion-logic">
                        <code>{sug.logic || sug.conditions?.join(' AND ')}</code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="ticker-cloud">
              ANALYZED: {summary.analyzed_tickers?.join(', ')}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
