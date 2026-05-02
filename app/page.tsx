"use client";
import React, { useEffect, useState } from "react";
import ChartWidget from "@/components/ChartWidget";
import { Activity, ArrowDownRight, ArrowUpRight, ExternalLink, Newspaper, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

type MarketMover = {
  ticker: string;
  price?: number;
  changePercent: number;
};

type MarketNewsItem = {
  title: string;
  link: string;
  date: string;
  source?: string;
};

type MoversResponse = {
  success: boolean;
  gainers: MarketMover[];
  losers: MarketMover[];
};

type NewsResponse = {
  success: boolean;
  data: MarketNewsItem[];
};

export default function Dashboard() {
  const [movers, setMovers] = useState<{ gainers: MarketMover[], losers: MarketMover[] }>({ gainers: [], losers: [] });
  const [news, setNews] = useState<MarketNewsItem[]>([]);
  const [loadingMovers, setLoadingMovers] = useState(true);
  const [loadingNews, setLoadingNews] = useState(true);
  const bestGainer = movers.gainers[0];
  const worstLoser = movers.losers[0];

  const fetchJson = async <T,>(url: string): Promise<T> => {
    const res = await fetch(url, { cache: "no-store" });
    const contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
      throw new Error(`${url} failed with ${res.status}`);
    }

    if (!contentType.includes("application/json")) {
      throw new Error(`${url} returned ${contentType || "non-JSON response"}`);
    }

    return res.json() as Promise<T>;
  };

  const fetchMovers = async () => {
    setLoadingMovers(true);
    try {
      const json = await fetchJson<MoversResponse>("/api/market/movers");
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
      const json = await fetchJson<NewsResponse>("/api/market/news");
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
    <div className="dashboard-shell">
      <section className="dashboard-hero panel">
        <div className="hero-copy">
          <div className="hero-kicker"><Activity size={14} /> Market Command Center</div>
          <h1>Dashboard Pasar Hari Ini</h1>
          <p>Pantau arah IHSG, sentimen regional, saham paling aktif bergerak, dan berita ekonomi terbaru dari CNN Indonesia serta CNBC Indonesia.</p>
        </div>
        <div className="hero-actions">
          <button onClick={() => { fetchMovers(); fetchNews(); }} disabled={loadingMovers || loadingNews}>
            <RefreshCw size={14} className={loadingMovers || loadingNews ? 'spin' : ''} /> Refresh semua
          </button>
          <span>{new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </section>

      <section className="market-glance">
        <div className="glance-card positive-card">
          <span>Top gainer</span>
          <strong>{bestGainer?.ticker || '-'}</strong>
          <small>{bestGainer ? `+${bestGainer.changePercent.toFixed(2)}%` : 'Memuat data'}</small>
        </div>
        <div className="glance-card negative-card">
          <span>Top loser</span>
          <strong>{worstLoser?.ticker || '-'}</strong>
          <small>{worstLoser ? `${worstLoser.changePercent.toFixed(2)}%` : 'Memuat data'}</small>
        </div>
        <div className="glance-card news-card">
          <span>News source</span>
          <strong>CNN + CNBC</strong>
          <small>{news.length ? `${news.length} headline terbaru` : 'Menunggu RSS'}</small>
        </div>
      </section>

      <section className="dashboard-grid chart-grid-premium">
        <ChartWidget title="IHSG Intraday" symbol="^JKSE" />
        <ChartWidget title="Asia Pulse: Nikkei" symbol="^N225" />
        <ChartWidget title="Risk Gauge: VIX" symbol="^VIX" isNegativeMode={true} />
      </section>

      <section className="dashboard-secondary-grid">
        <div className="panel dashboard-card movers-panel">
          <div className="card-heading">
            <div>
              <span className="section-eyebrow"><RefreshCw size={12} className={loadingMovers ? 'spin' : ''} /> IDX Movers</span>
              <h2>Saham Bergerak Ekstrem</h2>
            </div>
            <button
              onClick={fetchMovers}
              disabled={loadingMovers}
            >
              Sync
            </button>
          </div>

          <div className="movers-container">
            <div className="mover-column">
              <div className="mover-title positive-title">
                <TrendingUp size={14} /> Top gainers
              </div>
              <div className="mover-table">
                <table>
                  <tbody>
                    {loadingMovers ? (
                      [...Array(10)].map((_, i) => <tr key={i}><td className="skeleton-line">----------</td><td className="skeleton-line align-right">--.--%</td></tr>)
                    ) : movers.gainers.map((stock, i) => (
                      <tr key={i}>
                        <td><span className="rank">{String(i + 1).padStart(2, '0')}</span>{stock.ticker}</td>
                        <td className="positive align-right"><ArrowUpRight size={12} /> +{stock.changePercent.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mover-column">
              <div className="mover-title negative-title">
                <TrendingDown size={14} /> Top losers
              </div>
              <div className="mover-table">
                <table>
                  <tbody>
                    {loadingMovers ? (
                      [...Array(10)].map((_, i) => <tr key={i}><td className="skeleton-line">----------</td><td className="skeleton-line align-right">--.--%</td></tr>)
                    ) : movers.losers.map((stock, i) => (
                      <tr key={i}>
                        <td><span className="rank">{String(i + 1).padStart(2, '0')}</span>{stock.ticker}</td>
                        <td className="negative align-right"><ArrowDownRight size={12} /> {stock.changePercent.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="panel dashboard-card news-panel">
          <div className="card-heading">
            <div>
              <span className="section-eyebrow"><Newspaper size={12} /> RSS Indonesia</span>
              <h2>Market News Feed</h2>
            </div>
            <button
              onClick={fetchNews}
              disabled={loadingNews}
            >
              Refresh
            </button>
          </div>

          <div className="news-list">
            {loadingNews ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="news-skeleton">
                  <div></div>
                  <span></span>
                </div>
              ))
            ) : news.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="news-item"
              >
                <div className="news-main-row">
                  <span>{item.title}</span>
                  <ExternalLink size={13} />
                </div>
                <div className="news-meta">
                  <span>{item.source || 'RSS'}</span>
                  <span>
                    {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(item.date).toLocaleDateString()}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <style jsx>{`
        .dashboard-shell {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .dashboard-hero {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          padding: 24px;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 12% 0%, oklch(0.75 0.2 200 / 0.16), transparent 34%),
            radial-gradient(circle at 94% 18%, oklch(0.7 0.2 150 / 0.12), transparent 32%),
            linear-gradient(135deg, oklch(0.16 0.026 240), oklch(0.08 0.012 240));
          border-color: oklch(0.34 0.035 240);
        }

        .dashboard-hero::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: linear-gradient(90deg, oklch(1 0 0 / 0.04) 1px, transparent 1px), linear-gradient(0deg, oklch(1 0 0 / 0.03) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: linear-gradient(135deg, black, transparent 70%);
        }

        .hero-copy,
        .hero-actions {
          position: relative;
          z-index: 1;
        }

        .hero-kicker,
        .section-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--accent-cyan);
          font-size: 0.66rem;
          font-weight: 1000;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .hero-copy h1 {
          color: white;
          font-size: clamp(1.7rem, 3.4vw, 3rem);
          line-height: 1;
          letter-spacing: -0.055em;
          margin: 10px 0;
        }

        .hero-copy p {
          color: oklch(0.73 0.025 240);
          margin: 0;
          max-width: 780px;
          line-height: 1.6;
          font-size: 0.9rem;
        }

        .hero-actions {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          flex-direction: column;
        }

        .hero-actions button,
        .card-heading button {
          border: 1px solid oklch(0.75 0.2 200 / 0.28);
          background: oklch(0.75 0.2 200 / 0.1);
          color: var(--accent-cyan);
          border-radius: 999px;
          padding: 9px 12px;
          font-size: 0.68rem;
          font-weight: 1000;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .hero-actions span {
          color: var(--text-secondary);
          font-size: 0.66rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .market-glance {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .glance-card {
          background: oklch(0.12 0.018 240);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 16px;
          overflow: hidden;
          position: relative;
        }

        .glance-card::after {
          content: '';
          position: absolute;
          inset: auto -20% -60% 30%;
          height: 110px;
          border-radius: 999px;
          filter: blur(30px);
          opacity: 0.35;
        }

        .positive-card::after { background: var(--accent-green); }
        .negative-card::after { background: var(--accent-red); }
        .news-card::after { background: var(--accent-cyan); }

        .glance-card span,
        .glance-card small {
          display: block;
          color: var(--text-secondary);
          font-size: 0.62rem;
          font-weight: 1000;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .glance-card strong {
          display: block;
          color: white;
          font-size: 1.35rem;
          margin: 8px 0 4px;
          letter-spacing: -0.03em;
        }

        .chart-grid-premium {
          gap: 14px;
        }

        .dashboard-secondary-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(380px, 0.9fr);
          gap: 16px;
        }

        .dashboard-card {
          min-height: 420px;
          padding: 0;
          overflow: hidden;
          border-radius: 18px;
          background:
            linear-gradient(180deg, oklch(0.15 0.018 240), oklch(0.1 0.012 240));
          border-color: oklch(0.32 0.03 240);
        }

        .card-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding: 18px;
          border-bottom: 1px solid var(--border-color);
          background: oklch(0.08 0.012 240 / 0.55);
        }

        .card-heading h2 {
          color: white;
          font-size: 1.1rem;
          margin: 6px 0 0;
          letter-spacing: -0.03em;
        }

        .movers-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: var(--border-color);
        }

        .mover-column {
          background: oklch(0.11 0.014 240);
          padding: 16px;
        }

        .mover-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-size: 0.68rem;
          font-weight: 1000;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .positive-title { color: var(--accent-green); }
        .negative-title { color: var(--accent-red); }

        .mover-table table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.78rem;
        }

        .mover-table td {
          border: none;
          padding: 8px 0;
          font-weight: 900;
          color: white;
        }

        .rank {
          color: var(--text-secondary);
          display: inline-block;
          width: 26px;
          font-size: 0.62rem;
        }

        .align-right {
          text-align: right;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 4px;
        }

        .skeleton-line {
          opacity: 0.22;
        }

        .news-list {
          display: flex;
          flex-direction: column;
          padding: 4px 10px 10px;
        }

        .news-item {
          display: block;
          border-bottom: 1px solid var(--border-color);
          padding: 13px 8px;
          text-decoration: none;
          transition: background 0.2s, transform 0.2s, border-color 0.2s;
        }

        .news-main-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .news-main-row span {
          color: white;
          font-size: 0.82rem;
          line-height: 1.5;
          font-weight: 650;
        }

        .news-main-row svg {
          color: var(--text-secondary);
          opacity: 0.58;
          flex-shrink: 0;
          margin-top: 4px;
        }

        .news-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          margin-top: 8px;
        }

        .news-meta span:first-child {
          color: var(--accent-green);
          border: 1px solid oklch(0.82 0.18 145 / 0.22);
          background: oklch(0.82 0.18 145 / 0.08);
          border-radius: 999px;
          padding: 2px 7px;
        }

        .news-meta span {
          color: var(--text-secondary);
          font-size: 0.58rem;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .news-skeleton {
          border-bottom: 1px solid var(--border-color);
          padding: 14px 8px;
          opacity: 0.32;
        }

        .news-skeleton div,
        .news-skeleton span {
          display: block;
          background: var(--border-color);
          border-radius: 999px;
        }

        .news-skeleton div {
          width: 90%;
          height: 14px;
          margin-bottom: 9px;
        }

        .news-skeleton span {
          width: 42%;
          height: 10px;
        }

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
          background: oklch(0.82 0.18 145 / 0.045);
          transform: translateX(3px);
        }
        @media (max-width: 768px) {
          .dashboard-hero,
          .card-heading {
            flex-direction: column;
            align-items: flex-start;
          }
          .hero-actions {
            align-items: flex-start;
          }
          .market-glance,
          .dashboard-secondary-grid,
          .movers-container {
            grid-template-columns: 1fr;
          }
          .dashboard-secondary-grid {
            gap: 12px !important;
          }
          .movers-container {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .panel {
            min-height: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
