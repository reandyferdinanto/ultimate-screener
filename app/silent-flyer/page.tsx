"use client";
import React, { useState, useEffect, useCallback } from "react";
import Navigation from "@/components/Navigation";
import AdvancedChart from "@/components/AdvancedChart";
import { Search, TrendingUp, AlertCircle, Clock, CheckCircle2, XCircle, ChevronRight, Activity, Menu, X, Filter, Plus, Trash2, Archive, RefreshCw, Zap } from "lucide-react";

interface FlyerItem {
    ticker: string;
    sector?: string;
    signalSource: string;
    entryDate: Date;
    entryPrice: number;
    targetPrice: number;
    stopLossPrice?: number;
    status: 'silent' | 'taking_off' | 'flying' | 'failed' | 'archived';
    currentPrice?: number;
    relevanceScore?: number;
    priceHistory: { date: Date; price: number }[];
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
}

export default function SilentFlyerTracker() {
    const [radarItems, setRadarItems] = useState<FlyerItem[]>([]);
    const [availableSignals, setAvailableSignals] = useState<any[]>([]);
    const [selectedItem, setSelectedItem] = useState<FlyerItem | null>(null);
    const [chartData, setChartData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    useEffect(() => {
        fetchRadarItems();
    }, []);

    const fetchRadarItems = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/flyer-radar');
            const json = await res.json();
            if (json.success) {
                setRadarItems(json.data);
                if (json.data.length > 0 && !selectedItem) {
                    handleSelectItem(json.data[0]);
                }
            }
        } catch (error) {
            console.error("Failed to fetch radar items", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAvailableSignals = async () => {
        try {
            // Try to get from flyer-radar scan API first (real-time analysis)
            const scanRes = await fetch('/api/flyer-radar/scan');
            const scanJson = await scanRes.json();
            
            if (scanJson.success && scanJson.data && scanJson.data.length > 0) {
                setAvailableSignals(scanJson.data);
                return;
            }
            
            // Fallback to screener API
            const res = await fetch('/api/screener?all=false');
            const json = await res.json();
            if (json.success) {
                const silentFlyers = json.data.filter((s: any) => {
                    const isSilentFlyer = s.strategy.includes("SILENT FLYER");
                    const isEliteBounce = s.strategy.includes("ELITE BOUNCE") && (s.metadata?.squeezeDuration > 5 || s.relevanceScore > 200);
                    const isEmaBounce = s.strategy.includes("EMA Bounce") && (s.metadata?.atrCompression < 0.8 || s.relevanceScore > 100);
                    return isSilentFlyer || isEliteBounce || isEmaBounce;
                });
                setAvailableSignals(silentFlyers);
            }
        } catch (error) {
            console.error("Failed to fetch signals", error);
        }
    };

    const handleSelectItem = async (item: FlyerItem) => {
        setSelectedItem(item);
        setChartLoading(true);
        if (window.innerWidth < 1024) {
            setIsSidebarOpen(false);
        }
        try {
            const res = await fetch(`/api/technical?symbol=${item.ticker}&interval=1d`);
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

    const addToRadar = async (signal: any) => {
        try {
            // Handle both screener format and flyer-radar/scan format
            const ticker = signal.ticker;
            const entryPrice = signal.buyArea || signal.entryPrice || signal.currentPrice;
            const targetPrice = signal.tp || signal.targetPrice || entryPrice * 1.3;
            const stopLossPrice = signal.sl || signal.stopLossPrice || entryPrice * 0.95;
            
            const res = await fetch('/api/flyer-radar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker,
                    sector: signal.sector,
                    signalSource: signal.strategy || signal.signalSource || 'SILENT FLYER',
                    entryPrice,
                    targetPrice,
                    stopLossPrice,
                    relevanceScore: signal.relevanceScore,
                    metadata: signal.metadata
                })
            });
            const json = await res.json();
            if (json.success) {
                setShowAddModal(false);
                fetchRadarItems();
            } else {
                alert(json.error || 'Failed to add');
            }
        } catch (error) {
            console.error("Failed to add to radar", error);
        }
    };

    const deleteFromRadar = async (ticker: string) => {
        if (!confirm(`Remove ${ticker} from radar?`)) return;
        
        try {
            const res = await fetch(`/api/flyer-radar?ticker=${encodeURIComponent(ticker)}`, {
                method: 'DELETE'
            });
            const json = await res.json();
            if (json.success) {
                if (selectedItem?.ticker === ticker) {
                    setSelectedItem(null);
                    setChartData(null);
                }
                fetchRadarItems();
            }
        } catch (error) {
            console.error("Failed to delete", error);
        }
    };

    const updatePrices = async () => {
        setLoading(true);
        try {
            const updated: FlyerItem[] = [];
            for (const item of radarItems) {
                try {
                    const res = await fetch('/api/flyer-radar', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ticker: item.ticker, action: 'updatePrice' })
                    });
                    const json = await res.json();
                    if (json.success) {
                        updated.push(json.data);
                    }
                } catch (e) {
                    updated.push(item);
                }
            }
            setRadarItems(updated);
            setLastUpdate(new Date());
        } catch (error) {
            console.error("Failed to update prices", error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusInfo = (item: FlyerItem) => {
        const current = item.currentPrice || item.entryPrice;
        const entry = item.entryPrice;
        const target = item.targetPrice;
        const stop = item.stopLossPrice || entry * 0.95;

        if (current >= target) return { label: 'FLYING', color: 'oklch(0.7 0.25 150)', bg: 'oklch(0.7 0.25 150 / 0.1)', icon: <TrendingUp size={12} /> };
        if (current <= stop) return { label: 'FAILED', color: 'oklch(0.6 0.2 25)', bg: 'oklch(0.6 0.2 25 / 0.1)', icon: <XCircle size={12} /> };
        
        const movePct = ((current - entry) / entry) * 100;
        if (movePct > 5) return { label: 'TAKING_OFF', color: 'oklch(0.75 0.2 200)', bg: 'oklch(0.75 0.2 200 / 0.1)', icon: <Activity size={12} /> };
        
        return { label: 'SILENT', color: 'oklch(0.8 0.15 80)', bg: 'oklch(0.8 0.15 80 / 0.1)', icon: <Clock size={12} /> };
    };

    const getChangeFromEntry = (item: FlyerItem) => {
        const current = item.currentPrice || item.entryPrice;
        return ((current - item.entryPrice) / item.entryPrice) * 100;
    };

    const getMaxGain = (item: FlyerItem) => {
        if (!item.priceHistory || item.priceHistory.length === 0) return 0;
        const entry = item.entryPrice;
        const maxPrice = Math.max(...item.priceHistory.map((h: any) => h.price));
        return ((maxPrice - entry) / entry) * 100;
    };

    const formatDate = (date: Date | string) => {
        const d = new Date(date);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    return (
        <div className="flyer-tracker-root min-h-screen bg-[#050505] text-silver-300 font-mono">
            <div className="mobile-header">
                <button onClick={() => setIsSidebarOpen(true)} className="menu-trigger">
                    <Menu size={20} />
                    <span>FLYER_RADAR</span>
                </button>
                <div className="active-ticker-display">
                    {selectedItem ? selectedItem.ticker.replace('.JK', '') : 'AWAITING'}
                </div>
            </div>

            <div className="main-layout">
                <div className={`registry-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                    <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)}></div>
                    <div className="sidebar-content">
                        <div className="registry-header">
                            <div className="header-top">
                                <div className="title-group">
                                    <span className="title">FLYER_RADAR</span>
                                    <div className="count-badge">{radarItems.length}</div>
                                </div>
                                <button onClick={() => setIsSidebarOpen(false)} className="close-sidebar mobile-only">
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="header-actions">
                                <button onClick={() => { setShowAddModal(true); fetchAvailableSignals(); }} className="action-btn add">
                                    <Plus size={14} /> ADD
                                </button>
                                <button onClick={updatePrices} className="action-btn refresh">
                                    <RefreshCw size={14} className={loading ? 'spin' : ''} /> SYNC
                                </button>
                            </div>
                            {lastUpdate && (
                                <div className="last-update">
                                    <Zap size={10} /> {formatDate(lastUpdate)}
                                </div>
                            )}
                        </div>

                        <div className="registry-list custom-scrollbar">
                            {loading ? (
                                <div className="loading-state">
                                    <div className="scanner-line"></div>
                                    <span>INITIALIZING_RADAR...</span>
                                </div>
                            ) : radarItems.length === 0 ? (
                                <div className="empty-state">
                                    <span>NO_FLYERS_IN_RADAR</span>
                                    <button onClick={() => { setShowAddModal(true); fetchAvailableSignals(); }} className="add-first-btn">
                                        <Plus size={14} /> ADD_FIRST_FLYER
                                    </button>
                                </div>
                            ) : (
                                radarItems.map((item, idx) => {
                                    const status = getStatusInfo(item);
                                    const isActive = selectedItem?.ticker === item.ticker;
                                    const change = getChangeFromEntry(item);
                                    const maxGain = getMaxGain(item);
                                    
                                    return (
                                        <div key={idx} className={`registry-card ${isActive ? 'active' : ''}`}>
                                            <button onClick={() => handleSelectItem(item)} className="card-main">
                                                <div className="card-glitch-bg"></div>
                                                <div className="card-content">
                                                    <div className="card-top">
                                                        <div className="ticker-group">
                                                            <span className="ticker">{item.ticker.replace('.JK', '')}</span>
                                                            {item.signalSource.includes("BOUNCE") && (
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
                                                            <span className="value">{item.currentPrice || item.entryPrice}</span>
                                                        </div>
                                                        <div className={`change-info ${change >= 0 ? 'pos' : 'neg'}`}>
                                                            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                    {maxGain > 5 && (
                                                        <div className="peak-gain">
                                                            <Zap size={10} /> PEAK: +{maxGain.toFixed(1)}%
                                                        </div>
                                                    )}
                                                </div>
                                                <ChevronRight className="arrow-icon" size={14} />
                                            </button>
                                            <button onClick={() => deleteFromRadar(item.ticker)} className="delete-btn">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                <div className="mission-control">
                    {selectedItem ? (
                        <div className="mission-wrapper">
                            <div className="tactical-hud">
                                <div className="hud-unit main">
                                    <div className="unit-label">ACTIVE_MISSION</div>
                                    <div className="unit-value">{selectedItem.ticker.replace('.JK', '')}</div>
                                    <div className="unit-sub">SECTOR: {selectedItem.sector || 'N/A'}</div>
                                    <div className="unit-date">ENTRY: {formatDate(selectedItem.entryDate)}</div>
                                </div>

                                <div className="hud-grid-metrics">
                                    <div className="hud-unit">
                                        <div className="unit-label">ENTRY</div>
                                        <div className="unit-value small">{selectedItem.entryPrice}</div>
                                    </div>
                                    <div className="hud-unit highlight">
                                        <div className="unit-label">TARGET</div>
                                        <div className="unit-value small">{selectedItem.targetPrice}</div>
                                    </div>
                                    <div className="hud-unit danger">
                                        <div className="unit-label">ABORT</div>
                                        <div className="unit-value small">{selectedItem.stopLossPrice || (selectedItem.entryPrice * 0.95).toFixed(0)}</div>
                                    </div>
                                    <div className="hud-unit score-mobile">
                                        <div className="unit-label">SCORE</div>
                                        <div className="unit-value small text-emerald">{selectedItem.relevanceScore}</div>
                                    </div>
                                </div>

                                <div className="hud-unit score desktop-only">
                                    <div className="unit-label">FLYER_SCORE</div>
                                    <div className="unit-value">{selectedItem.relevanceScore}</div>
                                    <div className="score-bar">
                                        <div className="fill" style={{ width: `${Math.min(100, (selectedItem.relevanceScore || 0) / 400 * 100)}%` }}></div>
                                    </div>
                                </div>
                            </div>

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
                                        ticker={selectedItem.ticker}
                                        showSqueezeDeluxe={true}
                                    />
                                ) : (
                                    <div className="chart-empty">SELECT_UNIT_TO_STREAM_DATA</div>
                                )}
                            </div>

                            <div className="intel-grid">
                                <div className="intel-panel dna">
                                    <div className="panel-tag"><TrendingUp size={12}/> FLYER_DNA</div>
                                    <div className="intel-rows">
                                        <div className="row">
                                            <span className="label">SIGNAL_SOURCE</span>
                                            <span className="value">{selectedItem.signalSource}</span>
                                        </div>
                                        <div className="row">
                                            <span className="label">DAYS_TRACKED</span>
                                            <span className="value">
                                                {Math.floor((Date.now() - new Date(selectedItem.entryDate).getTime()) / (1000 * 60 * 60 * 24))}
                                            </span>
                                        </div>
                                        <div className="row">
                                            <span className="label">PRICE_POINTS</span>
                                            <span className="value">{selectedItem.priceHistory?.length || 0}</span>
                                        </div>
                                    </div>
                                    <div className="intel-quote">
                                        Added to radar on {formatDate(selectedItem.entryDate)}. Tracking price movement from entry to now.
                                    </div>
                                </div>

                                <div className="intel-panel performance">
                                    <div className="panel-tag"><Activity size={12}/> PERFORMANCE_METRICS</div>
                                    <div className="metrics-box">
                                        <div className="metric">
                                            <div className="m-label">MOVE_FROM_ENTRY</div>
                                            <div className={`m-value ${getChangeFromEntry(selectedItem) >= 0 ? 'pos' : 'neg'}`}>
                                                {getChangeFromEntry(selectedItem) >= 0 ? '+' : ''}{getChangeFromEntry(selectedItem).toFixed(2)}%
                                            </div>
                                        </div>
                                        <div className="metric">
                                            <div className="m-label">PEAK_GAIN</div>
                                            <div className="m-value pos">+{getMaxGain(selectedItem).toFixed(1)}%</div>
                                        </div>
                                    </div>
                                    <div className="status-banner">
                                        {selectedItem.status === 'flying' && (
                                            <div className="banner success">MISSION_COMPLETE // TGT_REACHED</div>
                                        )}
                                        {selectedItem.status === 'failed' && (
                                            <div className="banner failure">MISSION_ABORTED // SL_TRIGGERED</div>
                                        )}
                                        {selectedItem.status === 'taking_off' && (
                                            <div className="banner takingoff">MOMENTUM_BUILDING // +5%_GAIN</div>
                                        )}
                                        {selectedItem.status === 'silent' && (
                                            <div className="banner pending">RADAR_LOCKED // TRACKING_TARGET</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mission-empty">
                            <div className="radar-circle"></div>
                            <span>AWAITING_COMMAND... ADD_FLYERS_TO_RADAR</span>
                        </div>
                    )}
                </div>
            </div>

            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span>ADD_TO_RADAR</span>
                            <button onClick={() => setShowAddModal(false)}><X size={18} /></button>
                        </div>
                        <div className="modal-search">
                            <Search size={14} className="search-icon" />
                            <input type="text" placeholder="SEARCH_SIGNALS..." className="search-input" />
                        </div>
                        <div className="modal-list custom-scrollbar">
                            {availableSignals.length === 0 ? (
                                <div className="modal-empty">
                                    No signals found. Run the screener script first.
                                </div>
                            ) : (
                                availableSignals.map((signal, idx) => {
                                    const price = signal.buyArea || signal.entryPrice || signal.currentPrice || 0;
                                    const change = signal.currentPrice && price ? ((signal.currentPrice - price) / price) * 100 : 0;
                                    const strategy = signal.strategy || signal.signalSource || 'UNKNOWN';
                                    return (
                                        <button key={idx} onClick={() => addToRadar(signal)} className="modal-item">
                                            <div className="item-left">
                                                <span className="item-ticker">{signal.ticker.replace('.JK', '')}</span>
                                                <span className="item-strategy">{strategy}</span>
                                            </div>
                                            <div className="item-right">
                                                <span className="item-price">{price.toFixed(0)}</span>
                                                <span className={`item-change ${change >= 0 ? 'pos' : 'neg'}`}>
                                                    {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

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

                .header-actions {
                    display: flex;
                    gap: 8px;
                }

                .action-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 8px;
                    background: transparent;
                    border: 1px solid var(--border-tactical);
                    color: var(--text-muted);
                    font-size: 0.6rem;
                    font-weight: 900;
                    cursor: pointer;
                    transition: all 0.2s;
                    letter-spacing: 0.05em;
                }

                .action-btn.add:hover {
                    border-color: var(--accent-emerald);
                    color: var(--accent-emerald);
                }

                .action-btn.refresh:hover {
                    border-color: var(--accent-cyan);
                    color: var(--accent-cyan);
                }

                .spin {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .last-update {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.55rem;
                    color: var(--text-muted);
                    margin-top: 8px;
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
                    display: flex;
                    align-items: stretch;
                    background: oklch(0.12 0.01 240);
                    border: 1px solid var(--border-tactical);
                    border-radius: 10px;
                    overflow: hidden;
                    transition: all 0.3s;
                }

                .registry-card:hover {
                    border-color: var(--accent-cyan);
                }

                .registry-card.active {
                    border-color: var(--accent-cyan);
                    border-left: 4px solid var(--accent-cyan);
                }

                .card-main {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 14px;
                    background: transparent;
                    border: none;
                    text-align: left;
                    cursor: pointer;
                    overflow: hidden;
                    position: relative;
                }

                .card-glitch-bg {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(90deg, transparent, oklch(0.75 0.2 200 / 0.05), transparent);
                    transform: translateX(-100%);
                    transition: transform 0.5s;
                }

                .registry-card:hover .card-glitch-bg {
                    transform: translateX(100%);
                }

                .card-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .card-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }

                .ticker-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .ticker {
                    font-size: 1rem;
                    font-weight: 1000;
                    color: white;
                }

                .bounce-tag {
                    font-size: 0.5rem;
                    font-weight: 1000;
                    color: black;
                    background: var(--accent-cyan);
                    padding: 1px 4px;
                    border-radius: 2px;
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

                .peak-gain {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.6rem;
                    font-weight: 1000;
                    color: var(--accent-emerald);
                    margin-top: 6px;
                }

                .arrow-icon {
                    color: var(--text-muted);
                    flex-shrink: 0;
                    margin-left: 8px;
                }

                .delete-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 36px;
                    background: oklch(0.15 0.02 240);
                    border: none;
                    border-left: 1px solid var(--border-tactical);
                    color: var(--accent-rose);
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .delete-btn:hover {
                    background: oklch(0.6 0.2 25 / 0.2);
                }

                .loading-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                    color: var(--text-muted);
                    font-size: 0.7rem;
                    position: relative;
                    height: 100px;
                }

                .scanner-line {
                    position: absolute;
                    width: 100%;
                    height: 100px;
                    background: linear-gradient(to bottom, transparent, var(--accent-cyan), transparent);
                    opacity: 0.1;
                    animation: scanner-glow 2s linear infinite;
                }

                @keyframes scanner-glow {
                    0% { top: -100%; }
                    100% { top: 200%; }
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                    color: var(--text-muted);
                    font-size: 0.7rem;
                    gap: 16px;
                }

                .add-first-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 10px 16px;
                    background: transparent;
                    border: 1px solid var(--accent-cyan);
                    color: var(--accent-cyan);
                    font-size: 0.6rem;
                    font-weight: 900;
                    cursor: pointer;
                    letter-spacing: 0.05em;
                }

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
                    line-height: 1;
                }

                .hud-unit.main .unit-sub,
                .hud-unit.main .unit-date {
                    font-size: 0.65rem;
                    color: var(--text-muted);
                    margin-top: 4px;
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

                .score-bar {
                    height: 4px;
                    background: var(--border-tactical);
                    border-radius: 2px;
                    overflow: hidden;
                }

                .score-bar .fill {
                    height: 100%;
                    background: var(--accent-emerald);
                    transition: width 0.3s;
                }

                .score-mobile { display: none; }
                .text-emerald { color: var(--accent-emerald); }

                .chart-container {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-tactical);
                    border-radius: 16px;
                    position: relative;
                    overflow: hidden;
                    height: 600px;
                }

                .chart-overlay {
                    position: absolute;
                    inset: 0;
                    background: var(--panel-bg);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    z-index: 10;
                    color: var(--text-muted);
                    font-size: 0.7rem;
                }

                .spinner {
                    width: 32px;
                    height: 32px;
                    border: 2px solid var(--border-tactical);
                    border-top-color: var(--accent-cyan);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                .chart-empty {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-muted);
                    font-size: 0.8rem;
                }

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
                .metric .m-value.pos { color: var(--accent-emerald); }
                .metric .m-value.neg { color: var(--accent-rose); }

                .status-banner {
                    margin-top: auto;
                }

                .banner {
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 0.7rem;
                    font-weight: 1000;
                    letter-spacing: 0.05em;
                }

                .banner.success {
                    background: oklch(0.7 0.25 150 / 0.1);
                    color: var(--accent-emerald);
                }

                .banner.failure {
                    background: oklch(0.6 0.2 25 / 0.1);
                    color: var(--accent-rose);
                }

                .banner.takingoff {
                    background: oklch(0.75 0.2 200 / 0.1);
                    color: var(--accent-cyan);
                }

                .banner.pending {
                    background: oklch(0.8 0.15 80 / 0.1);
                    color: oklch(0.8 0.15 80);
                }

                .mission-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 400px;
                    background: var(--panel-bg);
                    border: 1px solid var(--border-tactical);
                    border-radius: 16px;
                    color: var(--text-muted);
                    font-size: 0.8rem;
                    gap: 24px;
                }

                .radar-circle {
                    width: 80px;
                    height: 80px;
                    border: 2px solid var(--border-tactical);
                    border-radius: 50%;
                    position: relative;
                    animation: pulse 2s ease-in-out infinite;
                }

                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.7; }
                }

                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: oklch(0.05 0 0 / 0.9);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 3000;
                }

                .modal-content {
                    width: 90%;
                    max-width: 500px;
                    max-height: 80vh;
                    background: var(--panel-bg);
                    border: 1px solid var(--border-tactical);
                    border-radius: 16px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-bottom: 1px solid var(--border-tactical);
                    font-size: 0.8rem;
                    font-weight: 900;
                    letter-spacing: 0.1em;
                }

                .modal-header button {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                }

                .modal-search {
                    padding: 16px 20px;
                    border-bottom: 1px solid var(--border-tactical);
                    position: relative;
                }

                .search-icon {
                    position: absolute;
                    left: 32px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--text-muted);
                }

                .search-input {
                    width: 100%;
                    padding: 10px 10px 10px 36px;
                    background: oklch(0.12 0.01 240);
                    border: 1px solid var(--border-tactical);
                    border-radius: 8px;
                    color: white;
                    font-size: 0.75rem;
                    font-family: inherit;
                }

                .search-input:focus {
                    outline: none;
                    border-color: var(--accent-cyan);
                }

                .modal-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .modal-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    background: oklch(0.12 0.01 240);
                    border: 1px solid var(--border-tactical);
                    border-radius: 8px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .modal-item:hover {
                    border-color: var(--accent-emerald);
                    background: oklch(0.7 0.2 150 / 0.05);
                }

                .modal-empty {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                    color: var(--text-muted);
                    font-size: 0.75rem;
                    text-align: center;
                }

                .item-left {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .item-ticker {
                    font-weight: 1000;
                    color: white;
                    font-size: 0.9rem;
                }

                .item-strategy {
                    font-size: 0.6rem;
                    color: var(--text-muted);
                }

                .item-right {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 2px;
                }

                .item-price {
                    font-weight: 1000;
                    color: white;
                }

                .item-change {
                    font-size: 0.7rem;
                    font-weight: 1000;
                }

                .item-change.pos { color: var(--accent-emerald); }
                .item-change.neg { color: var(--accent-rose); }

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
            `}</style>
        </div>
    );
}
