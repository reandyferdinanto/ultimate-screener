"use client";
import React, { useEffect, useState } from "react";
import ChartWidget from "@/components/ChartWidget";
import { TrendingUp, TrendingDown, ExternalLink, RefreshCw } from "lucide-react";

export default function Dashboard() {
  const [movers, setMovers] = useState<{ gainers: any[], losers: any[] }>({ gainers: [], losers: [] });
  const [news, setNews] = useState<any[]>([]);
  const [loadingMovers, setLoadingMovers] = useState(true);
  const [loadingNews, setLoadingNews] = useState(true);

  const fetchMovers = async () => {
    setLoadingMovers(true);
    try {
      const res = await fetch("/api/market/movers");
      const json = await res.json();
      if (json.success) setMovers({ gainers: json.gainers, losers: json.losers });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMovers(false);
    }
  };

  const fetchNews = async () => {
    setLoadingNews(true);
    try {
      const res = await fetch("/api/market/news");
      const json = await res.json();
      if (json.success) setNews(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingNews(false);
    }
  };

  useEffect(() => {
    fetchMovers();
    fetchNews();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Section: Charts */}
      <div className="dashboard-grid">
        <ChartWidget title="IHSG INTRADAY" symbol="^JKSE" />
        <ChartWidget title="ASIAN MARKET (NIKKEI)" symbol="^N225" />
        <ChartWidget title="US FEAR INDICATOR (VIX)" symbol="^VIX" isNegativeMode={true} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '16px' }}>
        {/* Middle Section: Top Gainers & Losers */}
        <div className="panel scanline-container" style={{ minHeight: '400px' }}>
          <div className="panel-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={12} className={loadingMovers ? 'spin' : ''} style={{ color: 'var(--accent-green)' }} />
              Market Movers [IDX]
            </span>
            <button 
              onClick={fetchMovers} 
              disabled={loadingMovers}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              [ SYNC ]
            </button>
          </div>
          
          <div className="movers-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Gainers */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-green)', marginBottom: '12px', fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.05em' }}>
                <TrendingUp size={14} /> TOP GAINERS
              </div>
              <div className="table-container" style={{ border: 'none' }}>
                <table style={{ fontSize: '0.75rem' }}>
                  <tbody>
                    {loadingMovers ? (
                      [...Array(10)].map((_, i) => <tr key={i}><td style={{ border: 'none', padding: '6px 0', opacity: 0.2 }}>----------</td><td style={{ textAlign: 'right', border: 'none', padding: '6px 0', opacity: 0.2 }}>--.--%</td></tr>)
                    ) : movers.gainers.map((stock, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 'bold', border: 'none', padding: '6px 0' }}>{stock.ticker}</td>
                        <td className="positive" style={{ textAlign: 'right', border: 'none', padding: '6px 0', fontWeight: '800' }}>+{stock.changePercent.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Losers */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-red)', marginBottom: '12px', fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.05em' }}>
                <TrendingDown size={14} /> TOP LOSERS
              </div>
              <div className="table-container" style={{ border: 'none' }}>
                <table style={{ fontSize: '0.75rem' }}>
                  <tbody>
                    {loadingMovers ? (
                      [...Array(10)].map((_, i) => <tr key={i}><td style={{ border: 'none', padding: '6px 0', opacity: 0.2 }}>----------</td><td style={{ textAlign: 'right', border: 'none', padding: '6px 0', opacity: 0.2 }}>--.--%</td></tr>)
                    ) : movers.losers.map((stock, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 'bold', border: 'none', padding: '6px 0' }}>{stock.ticker}</td>
                        <td className="negative" style={{ textAlign: 'right', border: 'none', padding: '6px 0', fontWeight: '800' }}>{stock.changePercent.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Market News */}
        <div className="panel scanline-container" style={{ minHeight: '400px' }}>
          <div className="panel-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-red)', animation: 'pulse 2s infinite' }}></div>
              Terminal News Feed [INDONESIA]
            </span>
            <button 
              onClick={fetchNews} 
              disabled={loadingNews}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              [ REFRESH ]
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {loadingNews ? (
              [...Array(6)].map((_, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border-color)', padding: '12px 0', opacity: 0.3 }}>
                  <div style={{ height: '14px', background: 'var(--border-color)', width: '90%', marginBottom: '8px' }}></div>
                  <div style={{ height: '10px', background: 'var(--border-color)', width: '40%' }}></div>
                </div>
              ))
            ) : news.map((item, i) => (
              <a 
                key={i} 
                href={item.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="news-item"
                style={{ display: 'block', borderBottom: '1px solid var(--border-color)', padding: '12px 8px', margin: '0 -8px', transition: 'all 0.2s' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '0.8rem', lineHeight: '1.5', color: 'var(--text-primary)', fontWeight: '500' }}>
                    {item.title}
                  </span>
                  <ExternalLink size={12} style={{ flexShrink: 0, marginTop: '4px', color: 'var(--text-secondary)', opacity: 0.5 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--accent-green)', fontWeight: '800' }}>IDX_INTEL</span>
                  <span style={{ color: 'var(--border-color)' }}>|</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(item.date).toLocaleDateString()}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        .news-item:hover {
          background: var(--bg-hover);
          padding-left: 12px !important;
          border-left: 2px solid var(--accent-green);
        }
        @media (max-width: 768px) {
          .movers-container {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
