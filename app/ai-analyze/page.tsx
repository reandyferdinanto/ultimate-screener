'use client';

import { useState, useEffect } from 'react';
import './ai-analyze.css';

export default function AIAnalyzePage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'breakout' | 'prediction'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/ai-analysis')
      .then(res => res.json())
      .then(data => {
        setData(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="loading">CONNECTING TO ANALYTICS ENGINE...</div>;
  }

  const filteredData = data.filter(row => {
    if (filter === 'all') return true;
    if (filter === 'breakout') return row.ai_verdict !== 'SECRET_SAUCE_CANDIDATE';
    if (filter === 'prediction') return row.ai_verdict === 'SECRET_SAUCE_CANDIDATE';
    return true;
  });

  return (
    <div className="ai-container">
      <div className="filter-bar">
        <button className={filter === 'all' ? 'btn-active' : ''} onClick={() => setFilter('all')}>ALL REPORTS</button>
        <button className={filter === 'breakout' ? 'btn-active' : ''} onClick={() => setFilter('breakout')}>RECENT BREAKOUTS</button>
        <button className={filter === 'prediction' ? 'btn-active' : ''} onClick={() => setFilter('prediction')}>SECRET SAUCE (PREDICTIONS)</button>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>Intelligence Analysis // Reports</span>
          <span className="live-indicator">LIVE DATA FEED</span>
        </div>
        
        <div className="table-container">
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Type</th>
                <th>Gain/Pos</th>
                <th>System Verdict</th>
                <th>Pattern Score</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    NO DATA MATCHING FILTER
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className={expandedId === row.id ? 'row-active' : ''} onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}>
                      <td className="ticker-cell">{row.ticker}</td>
                      <td>
                        <span className={`type-badge ${row.ai_verdict === 'SECRET_SAUCE_CANDIDATE' ? 'badge-prediction' : 'badge-breakout'}`}>
                          {row.ai_verdict === 'SECRET_SAUCE_CANDIDATE' ? 'PREDICT' : 'BREAKOUT'}
                        </span>
                      </td>
                      <td className={row.gain_percentage > 0 ? 'positive' : ''}>
                        {row.ai_verdict === 'SECRET_SAUCE_CANDIDATE' ? 'READY' : `+${row.gain_percentage}%`}
                      </td>
                      <td>
                        <span className={`verdict-tag ${row.ai_verdict === 'SECRET_SAUCE_CANDIDATE' ? 'tag-amber' : (row.ai_verdict?.toLowerCase().includes('bullish') ? 'tag-bullish' : 'tag-neutral')}`}>
                          {row.ai_verdict || 'PENDING'}
                        </span>
                      </td>
                      <td className="score-cell">{row.ai_analysis_full?.pattern_score || row.raw_technical_data?.rsi?.toFixed(0) || '-'}</td>
                      <td>
                        <button className="btn-small">{expandedId === row.id ? 'CLOSE' : 'DETAILS'}</button>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr className="detail-row">
                        <td colSpan={6}>
                          <div className="detail-content">
                            <div className="detail-grid">
                              <div className="detail-section">
                                <h3>Technical Snapshot</h3>
                                <div className="json-box">
                                  <div className="json-item"><span>Price:</span> <span>{row.raw_technical_data?.price || row.raw_technical_data?.tech_1d?.current_price}</span></div>
                                  <div className="json-item"><span>RSI:</span> <span className={(row.raw_technical_data?.rsi || row.raw_technical_data?.tech_1d?.RSI_14) > 70 ? 'positive' : ''}>{(row.raw_technical_data?.rsi || row.raw_technical_data?.tech_1d?.RSI_14)?.toFixed(2)}</span></div>
                                  <div className="json-item"><span>MFI:</span> <span className={(row.raw_technical_data?.mfi || row.raw_technical_data?.tech_1d?.MFI_14) > 80 ? 'positive' : ''}>{(row.raw_technical_data?.mfi || row.raw_technical_data?.tech_1d?.MFI_14)?.toFixed(2)}</span></div>
                                  <div className="json-item"><span>Relative Vol:</span> <span className="positive">{(row.raw_technical_data?.rVol || row.raw_technical_data?.tech_1d?.RVol)?.toFixed(2)}x</span></div>
                                  <div className="json-item"><span>Dist EMA20:</span> <span>{(row.raw_technical_data?.distEma20_pct || row.raw_technical_data?.tech_1d?.dist_to_MA20_pct)?.toFixed(2)}%</span></div>
                                </div>
                              </div>
                              <div className="detail-section">
                                <h3>Intelligence Insight</h3>
                                {row.ai_analysis_full ? (
                                  <>
                                    <p className="key-driver"><strong>Key Driver:</strong> {row.ai_analysis_full?.key_driver}</p>
                                    <p className="insight"><strong>Actionable:</strong> {row.ai_analysis_full?.actionable_insight}</p>
                                    <div className="sr-levels">
                                      <span>Support: {row.ai_analysis_full?.support}</span>
                                      <span>Resistance: {row.ai_analysis_full?.resistance}</span>
                                    </div>
                                  </>
                                ) : (
                                  <p className="insight">Secret Sauce pattern detected by system logic. High accumulation near EMA20. Ready for next breakout.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
