"use client";
import React, { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import AdvancedChart from "@/components/AdvancedChart";
import { Search, TrendingUp, AlertCircle, Clock, CheckCircle2, XCircle, ChevronRight, Activity, Menu, X, Filter } from "lucide-react";

export default function SilentFlyerTracker() {
    const [signals, setSignals] = useState<any[]>([]);
    const [selectedSignal, setSelectedSignal] = useState<any>(null);
    const [chartData, setChartData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        fetchSignals();
    }, []);

    const fetchSignals = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/screener?all=false');
            const json = await res.json();
            if (json.success) {
                const silentFlyers = json.data.filter((s: any) => {
                    const isSilentFlyer = s.strategy.includes("SILENT FLYER");
                    const isEliteBounce = s.strategy.includes("ELITE BOUNCE") && (s.metadata?.squeezeDuration > 5 || s.relevanceScore > 200);
                    const isEmaBounce = s.strategy.includes("EMA Bounce") && (s.metadata?.atrCompression < 0.8 || s.relevanceScore > 100);
                    return isSilentFlyer || isEliteBounce || isEmaBounce;
                });
                setSignals(silentFlyers);
                if (silentFlyers.length > 0) {
                    handleSelectSignal(silentFlyers[0]);
                }
            }
        } catch (error) {
            console.error("Failed to fetch signals", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSignal = async (signal: any) => {
        setSelectedSignal(signal);
        setChartLoading(true);
        if (window.innerWidth < 1024) {
            setIsSidebarOpen(false);
        }
        try {
            const res = await fetch(`/api/technical?symbol=${signal.ticker}&interval=1d`);
            const json = await res.json();
            if (json.success) {
                setChartData(json);
            }
        } catch (error) {
            console.error("Failed to fetch chart data", error);
        } finally {
            setChartLoading(false);
        }
    };

    const getStatusInfo = (s: any) => {
        const current = s.currentPrice || s.buyArea;
        const entry = s.buyArea;
        const target = s.tp;
        const stop = s.sl;

        if (current >= target) return { label: 'FLYING', color: 'oklch(0.7 0.25 150)', bg: 'oklch(0.7 0.25 150 / 0.1)', icon: <TrendingUp size={12} /> };
        if (current <= stop) return { label: 'FAILED', color: 'oklch(0.6 0.2 25)', bg: 'oklch(0.6 0.2 25 / 0.1)', icon: <XCircle size={12} /> };
        
        const movePct = ((current - entry) / entry) * 100;
        if (movePct > 5) return { label: 'TAKING_OFF', color: 'oklch(0.75 0.2 200)', bg: 'oklch(0.75 0.2 200 / 0.1)', icon: <Activity size={12} /> };
        
        return { label: 'SILENT', color: 'oklch(0.8 0.15 80)', bg: 'oklch(0.8 0.15 80 / 0.1)', icon: <Clock size={12} /> };
    };

    return (
        <div className="flyer-tracker-root min-h-screen bg-[#050505] text-silver-300 font-mono">
            
            <div className="mobile-header">
                <button onClick={() => setIsSidebarOpen(true)} className="menu-trigger">
                    <Menu size={20} />
                    <span>TACTICAL_REGISTRY</span>
                </button>
                <div className="active-ticker-display">
                    {selectedSignal ? selectedSignal.ticker.replace('.JK', '') : 'AWAITING_RADAR'}
                </div>
            </div>

            <div className="main-layout">
                {/* SIDEBAR: TACTICAL REGISTRY */}
                <div className={`registry-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                    <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)}></div>
                    <div className="sidebar-content">
                        <div className="registry-header">
                            <div className="header-top">
                                <div className="title-group">
                                    <span className="title">TACTICAL_REGISTRY</span>
                                    <div className="count-badge">{signals.length}</div>
                                </div>
                                <button onClick={() => setIsSidebarOpen(false)} className="close-sidebar mobile-only">
                                    <X size={18} />
                                </button>
                            </div>
                            <button onClick={fetchSignals} className="refresh-btn">
                                SYNC_SYSTEM_RADAR
                            </button>
                        </div>

                        <div className="registry-list custom-scrollbar">
                            {loading ? (
                                <div className="loading-state">
                                    <div className="scanner-line"></div>
                                    <span>INITIALIZING_RADAR...</span>
                                </div>
                            ) : signals.length === 0 ? (
                                <div className="empty-state">NO_ACTIVE_FLYERS_DETECTED</div>
                            ) : (
                                signals.map((s, idx) => {
                                    const status = getStatusInfo(s);
                                    const isActive = selectedSignal?.ticker === s.ticker;
                                    const change = ((s.currentPrice - s.buyArea) / s.buyArea) * 100;
                                    
                                    return (
                                        <button 
                                            key={idx} 
                                            onClick={() => handleSelectSignal(s)}
                                            className={`registry-card ${isActive ? 'active' : ''}`}
                                        >
                                            <div className="card-glitch-bg"></div>
                                            <div className="card-content">
                                                <div className="card-top">
                                                    <div className="ticker-group">
                                                        <span className="ticker">{s.ticker.replace('.JK', '')}</span>
                                                        {(s.metadata?.verdict?.includes("BOUNCE") || s.strategy?.includes("BOUNCE")) && (
                                                            <span className="bounce-tag">BOUNCE</span>
                                                        )}
                                                    </div>
                                                    <div className="status-pill" style={{ color: status.color, backgroundColor: status.bg }}>
                                                        {status.icon}
                                                        <span>{status.label}</span>
                                                    </div>
                                                </div>
                                                <div className="card-bottom">
                                                    <div className="price-info">
                                                        <span className="label">NOW</span>
                                                        <span className="value">{s.currentPrice}</span>
                                                    </div>
                                                    <div className={`change-info ${change >= 0 ? 'pos' : 'neg'}`}>
                                                        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                                                    </div>
                                                </div>
                                            </div>
                                            <ChevronRight className="arrow-icon" size={14} />
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* MAIN CONTENT: MISSION CONTROL */}
                <div className="mission-control">
                    {selectedSignal ? (
                        <div className="mission-wrapper">
                            {/* TARGET HUD */}
                            <div className="tactical-hud">
                                <div className="hud-unit main">
                                    <div className="unit-label">ACTIVE_MISSION</div>
                                    <div className="unit-value">{selectedSignal.ticker.replace('.JK', '')}</div>
                                    <div className="unit-sub">SECTOR: {selectedSignal.sector || 'N/A'}</div>
                                </div>

                                <div className="hud-grid-metrics">
                                    <div className="hud-unit">
                                        <div className="unit-label">ENTRY</div>
                                        <div className="unit-value small">{selectedSignal.buyArea}</div>
                                    </div>
                                    <div className="hud-unit highlight">
                                        <div className="unit-label">TARGET</div>
                                        <div className="unit-value small">{selectedSignal.tp}</div>
                                    </div>
                                    <div className="hud-unit danger">
                                        <div className="unit-label">ABORT</div>
                                        <div className="unit-value small">{selectedSignal.sl}</div>
                                    </div>
                                    <div className="hud-unit score-mobile">
                                        <div className="unit-label">SCORE</div>
                                        <div className="unit-value small text-emerald">{selectedSignal.relevanceScore}</div>
                                    </div>
                                </div>

                                <div className="hud-unit score desktop-only">
                                    <div className="unit-label">FLYER_SCORE</div>
                                    <div className="unit-value">{selectedSignal.relevanceScore}</div>
                                    <div className="score-bar">
                                        <div className="fill" style={{ width: `${Math.min(100, (selectedSignal.relevanceScore/400)*100)}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            {/* CHART VIZ */}
                            <div className="chart-container">
                                {chartLoading && (
                                    <div className="chart-overlay">
                                        <div className="spinner"></div>
                                        <span>RECONSTRUCTING_CYCLES...</span>
                                    </div>
                                )}
                                {chartData ? (
                                    <AdvancedChart 
                                        data={chartData.data}
                                        pivots={chartData.pivots}
                                        elliott={chartData.elliott}
                                        wavePivots={chartData.wavePivots}
                                        ticker={selectedSignal.ticker}
                                        showSqueezeDeluxe={true}
                                    />
                                ) : (
                                    <div className="chart-empty">SELECT_UNIT_TO_STREAM_DATA</div>
                                )}
                            </div>

                            {/* INTEL FEED */}
                            <div className="intel-grid">
                                <div className="intel-panel dna">
                                    <div className="panel-tag"><TrendingUp size={12}/> FLYER_DNA</div>
                                    <div className="intel-rows">
                                        <div className="row">
                                            <span className="label">COMPRESSION_LIFE</span>
                                            <span className="value">{selectedSignal.metadata.squeezeDuration} BARS</span>
                                        </div>
                                        <div className="row">
                                            <span className="label">ELLIOTT_CYCLE</span>
                                            <span className="value">{selectedSignal.metadata.elliottTrend}</span>
                                        </div>
                                        <div className="row">
                                            <span className="label">INSTITUTIONAL_FLUX</span>
                                            <span className="value positive">{selectedSignal.metadata.flux}</span>
                                        </div>
                                    </div>
                                    <div className="intel-quote">
                                        {selectedSignal.metadata.squeezeInsight}
                                    </div>
                                </div>

                                <div className="intel-panel performance">
                                    <div className="panel-tag"><Activity size={12}/> PERFORMANCE_METRICS</div>
                                    <div className="metrics-box">
                                        <div className="metric">
                                            <div className="m-label">MOVE_FROM_ENTRY</div>
                                            <div className={`m-value ${selectedSignal.currentPrice >= selectedSignal.buyArea ? 'pos' : 'neg'}`}>
                                                {selectedSignal.currentPrice >= selectedSignal.buyArea ? '+' : ''}{(((selectedSignal.currentPrice - selectedSignal.buyArea)/selectedSignal.buyArea)*100).toFixed(2)}%
                                            </div>
                                        </div>
                                        <div className="metric">
                                            <div className="m-label">RR_PROBABILITY</div>
                                            <div className="m-value">1 : {((selectedSignal.tp - selectedSignal.buyArea) / (selectedSignal.buyArea - selectedSignal.sl)).toFixed(1)}</div>
                                        </div>
                                    </div>
                                    <div className="status-banner">
                                        {selectedSignal.currentPrice >= selectedSignal.tp ? (
                                            <div className="banner success">MISSION_COMPLETE // TGT_REACHED</div>
                                        ) : selectedSignal.currentPrice <= selectedSignal.sl ? (
                                            <div className="banner failure">MISSION_ABORTED // SL_TRIGGERED</div>
                                        ) : (
                                            <div className="banner pending">RADAR_LOCKED // TRACKING_TARGET</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mission-empty">
                            <div className="radar-circle"></div>
                            <span>AWAITING_COMMAND... SELECT_REGISTRY_UNIT</span>
                        </div>
                    )}
                </div>
            </div>

            <style jsx global>{`
                :root {
                    --bg-dark: #050505;
                    --panel-bg: oklch(0.15 0.02 240);
                    --panel-glass: oklch(0.15 0.02 240 / 0.8);
                    --border-tactical: oklch(0.25 0.02 240);
                    --accent-emerald: oklch(0.7 0.2 150);
                    --accent-cyan: oklch(0.75 0.2 200);
                    --accent-rose: oklch(0.6 0.2 25);
                    --text-muted: oklch(0.6 0.02 240);
                }

                .flyer-tracker-root {
                    display: flex;
                    flex-direction: column;
                }

                .main-layout {
                    display: flex;
                    min-height: calc(100vh - 56px);
                    max-width: 1800px;
                    margin: 0 auto;
                    padding: 20px;
                    gap: 20px;
                    width: 100%;
                }

                /* MOBILE HEADER */
                .mobile-header {
                    display: none;
                    height: 50px;
                    background: var(--panel-bg);
                    border-bottom: 1px solid var(--border-tactical);
                    padding: 0 16px;
                    align-items: center;
                    justify-content: space-between;
                    position: sticky;
                    top: 56px;
                    z-index: 90;
                }

                .menu-trigger {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: transparent;
                    border: none;
                    color: var(--accent-cyan);
                    font-size: 0.65rem;
                    font-weight: 900;
                    letter-spacing: 0.1em;
                }

                .active-ticker-display {
                    font-size: 0.8rem;
                    font-weight: 1000;
                    color: white;
                    letter-spacing: 0.05em;
                }

                /* REGISTRY SIDEBAR */
                .registry-sidebar {
                    width: 380px;
                    min-width: 380px;
                    display: flex;
                    flex-direction: column;
                    background: var(--panel-bg);
                    border: 1px solid var(--border-tactical);
                    border-radius: 12px;
                    overflow: hidden;
                    max-height: calc(100vh - 96px);
                    position: sticky;
                    top: 20px;
                }

                .registry-header {
                    padding: 16px;
                    background: oklch(0.18 0.02 240);
                    border-bottom: 1px solid var(--border-tactical);
                    flex-shrink: 0;
                }

                .header-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }

                .title-group {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .registry-header .title {
                    font-size: 0.7rem;
                    font-weight: 900;
                    letter-spacing: 0.15em;
                    color: white;
                }

                .count-badge {
                    background: var(--accent-cyan);
                    color: black;
                    font-size: 0.6rem;
                    font-weight: 900;
                    padding: 1px 6px;
                    border-radius: 3px;
                }

                .refresh-btn {
                    width: 100%;
                    padding: 10px;
                    background: transparent;
                    border: 1px solid var(--border-tactical);
                    color: var(--text-muted);
                    font-size: 0.65rem;
                    font-weight: 900;
                    cursor: pointer;
                    transition: all 0.2s;
                    letter-spacing: 0.05em;
                }

                .refresh-btn:hover {
                    border-color: var(--accent-cyan);
                    color: var(--accent-cyan);
                    background: oklch(0.75 0.2 200 / 0.05);
                }

                .registry-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .registry-card {
                    position: relative;
                    width: 100%;
                    padding: 14px;
                    background: oklch(0.12 0.01 240);
                    border: 1px solid var(--border-tactical);
                    border-radius: 10px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    overflow: hidden;
                    flex-shrink: 0;
                }

                .registry-card:hover {
                    background: oklch(0.18 0.02 240);
                    border-color: var(--accent-cyan);
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px -8px oklch(0.75 0.2 200 / 0.3);
                }

                .registry-card.active {
                    background: oklch(0.2 0.04 240);
                    border-color: var(--accent-cyan);
                    border-left: 4px solid var(--accent-cyan);
                }

                .ticker-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 0;
                    flex: 1;
                }

                .ticker {
                    font-size: 1rem;
                    font-weight: 1000;
                    color: white;
                    letter-spacing: -0.01em;
                }

                .bounce-tag {
                    font-size: 0.5rem;
                    font-weight: 1000;
                    color: black;
                    background: var(--accent-cyan);
                    padding: 1px 4px;
                    border-radius: 2px;
                    flex-shrink: 0;
                }

                .status-pill {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-size: 0.6rem;
                    font-weight: 1000;
                    letter-spacing: 0.02em;
                }

                .card-bottom {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    margin-top: 10px;
                }

                .price-info .value {
                    font-size: 0.95rem;
                    font-weight: 1000;
                    color: white;
                }

                .change-info {
                    font-size: 0.8rem;
                    font-weight: 1000;
                }

                .change-info.pos { color: var(--accent-emerald); }
                .change-info.neg { color: var(--accent-rose); }

                /* MISSION CONTROL */
                .mission-control {
                    flex: 1;
                    min-width: 0;
                }

                .mission-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }

                .tactical-hud {
                    display: flex;
                    background: var(--panel-bg);
                    border: 1px solid var(--border-tactical);
                    border-radius: 16px;
                    padding: 24px;
                    gap: 32px;
                    align-items: center;
                    flex-wrap: wrap;
                }

                .hud-unit.main {
                    flex-shrink: 0;
                    min-width: 140px;
                }

                .hud-unit.main .unit-value {
                    font-size: 2.25rem;
                    font-weight: 1000;
                    color: white;
                    letter-spacing: -0.04em;
                    line-height: 1;
                }

                .hud-grid-metrics {
                    display: flex;
                    gap: 32px;
                    padding: 0 32px;
                    border-left: 1px solid var(--border-tactical);
                    border-right: 1px solid var(--border-tactical);
                    flex: 1;
                    justify-content: space-around;
                }

                .hud-unit.score {
                    width: 180px;
                    flex-shrink: 0;
                }

                .hud-unit.score .unit-value {
                    font-size: 1.75rem;
                    font-weight: 1000;
                    color: var(--accent-emerald);
                    text-align: right;
                    margin-bottom: 4px;
                }

                .score-mobile { display: none; }
                .text-emerald { color: var(--accent-emerald); }

                /* CHART */
                .chart-container {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-tactical);
                    border-radius: 16px;
                    position: relative;
                    overflow: hidden;
                    height: 600px;
                }

                /* INTEL GRID */
                .intel-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 24px;
                }

                .intel-panel {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-tactical);
                    border-radius: 16px;
                    padding: 28px;
                    display: flex;
                    flex-direction: column;
                }

                .intel-rows .row {
                    display: flex;
                    justify-content: space-between;
                    padding: 14px 0;
                    border-bottom: 1px solid oklch(0.2 0 0);
                }

                .intel-rows .row:last-child { border-bottom: none; }

                .intel-quote {
                    margin-top: 20px;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    font-style: italic;
                    line-height: 1.7;
                    border-left: 3px solid var(--accent-cyan);
                    padding-left: 16px;
                    background: oklch(0.75 0.2 200 / 0.03);
                    padding-top: 12px;
                    padding-bottom: 12px;
                    border-radius: 0 8px 8px 0;
                }

                .metrics-box {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 24px;
                }

                .metric .m-value { font-size: 1.5rem; font-weight: 1000; margin-top: 4px; }

                /* RESPONSIVE BREAKPOINTS */
                @media (max-width: 1200px) {
                    .registry-sidebar { width: 320px; min-width: 320px; }
                    .hud-grid-metrics { gap: 20px; padding: 0 20px; }
                }

                @media (max-width: 1024px) {
                    .mobile-header { display: flex; }
                    .main-layout { flex-direction: column; padding: 16px; }
                    
                    .registry-sidebar {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        z-index: 2000;
                        background: transparent;
                        border: none;
                        pointer-events: none;
                        transform: none;
                        visibility: hidden;
                        transition: visibility 0.3s;
                    }

                    .registry-sidebar.open {
                        visibility: visible;
                        pointer-events: auto;
                    }

                    .sidebar-backdrop {
                        position: absolute;
                        inset: 0;
                        background: oklch(0.05 0 0 / 0.85);
                        backdrop-filter: blur(8px);
                        opacity: 0;
                        transition: opacity 0.3s;
                    }

                    .registry-sidebar.open .sidebar-backdrop { opacity: 1; }

                    .sidebar-content {
                        position: absolute;
                        right: 0;
                        top: 0;
                        bottom: 0;
                        width: 85%;
                        max-width: 360px;
                        background: var(--bg-dark);
                        border-left: 1px solid var(--border-tactical);
                        transform: translateX(100%);
                        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        display: flex;
                        flex-direction: column;
                    }

                    .registry-sidebar.open .sidebar-content { transform: translateX(0); }

                    .mobile-only { display: flex; }
                    .desktop-only { display: none; }
                    
                    .tactical-hud { padding: 20px; gap: 24px; justify-content: space-between; }
                    .hud-unit.main { width: 100%; border-bottom: 1px solid var(--border-tactical); padding-bottom: 16px; margin-bottom: 4px; }
                    .hud-grid-metrics { width: 100%; border: none; padding: 0; justify-content: space-between; }
                    .score-mobile { display: block; }
                    
                    .chart-container { height: 500px; }
                    .intel-grid { grid-template-columns: 1fr; }
                }

                @media (max-width: 640px) {
                    .main-layout { padding: 12px; gap: 16px; }
                    .tactical-hud { padding: 16px; }
                    .hud-unit.main .unit-value { font-size: 1.75rem; }
                    .hud-grid-metrics { gap: 12px; }
                    .unit-value.small { font-size: 0.9rem; }
                    .metric .m-value { font-size: 1.25rem; }
                }

                /* ANIMATIONS */
                @keyframes scanner-glow {
                    0% { top: -100%; }
                    100% { top: 200%; }
                }

                .scanner-line {
                    position: absolute;
                    width: 100%;
                    height: 100px;
                    background: linear-gradient(to bottom, transparent, var(--accent-cyan), transparent);
                    opacity: 0.1;
                    animation: scanner-glow 2s linear infinite;
                }
            `}</style>
        </div>
    );
}
