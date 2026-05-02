"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useCallback } from "react";
import { Send, Settings, RefreshCw, BarChart2, Filter, ChevronDown, Check } from "lucide-react";
import Link from "next/link";
import Navigation from "@/components/Navigation";

interface SignalData {
  ticker: string;
  strategy?: string;
  signalSource?: string;
  currentPrice?: number;
  currentPriceSource?: string;
  deltaPct?: number | null;
  buyArea?: number;
  entryLow?: number;
  entryHigh?: number;
  idealBuy?: number;
  tp?: number;
  target1?: number;
  target2?: number;
  sl?: number;
  riskPct?: string | null;
  rewardRisk?: number;
  maxLossPct?: number;
  atrPct?: number | null;
  state?: string;
  stateLabel?: string;
  setupScore?: number;
  volumeScore?: number;
  daysHeld?: number;
  category?: string;
  vector?: string;
  appearedAt?: string;
  createdAt?: string;
  entryDate?: string;
  updatedAt?: string;
  lastScannedAt?: string;
  lastQuoteDate?: string;
  dataFreshness?: {
    source?: string;
    lastQuoteDate?: string;
    lastScannedAt?: string;
    quoteAgeHours?: number | null;
    isLikelyFreshDaily?: boolean;
  };
  evaluation?: {
    status?: string;
    label?: string;
    description?: string;
    ageHours?: number | null;
    activeMarketHours?: number | null;
    dueAt?: string | null;
  };
  priceHistory?: { date?: string; price: number }[];
  metadata?: Record<string, any>;
}

// PATCH 1: Enhanced Risk Management Interfaces
interface AdvancedRiskMetrics {
  volatilityScore: number; // ATR-based volatility 0-1
  correlationScore: number; // Correlation dengan market 0-1
  liquidityScore: number; // Volume-based liquidity 0-1
  regimeScore: number; // Market regime alignment 0-1
  portfolioOverlap: number; // Portfolio overlap 0-1
  riskAdjustedReturn: number; // Risk-adjusted return score 0-100
  maxPositionSize: number; // Recommended max position size
  recoveryFactor: number; // Recovery potential 0-1
}

interface SignalStrength {
  convictionLevel: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  catalystType: 'TECHNICAL' | 'FUNDAMENTAL' | 'SENTIMENT' | 'VOLUME';
  timeframeAlignment: number; // 0-1 score
  marketStructure: 'ACCUMULATION' | 'DISTRIBUTION' | 'TRENDING' | 'RANGING';
}

interface MarketConditions {
  regime: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'VOLATILE';
  trendStrength: number; // 0-1
  volatility: number; // 0-1
  liquidity: number; // 0-1
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  vixLevel?: number; // Market fear index
}

interface SignalScore {
  totalScore: number;
  technicalScore: number;
  fundamentalScore: number;
  volumeScore: number;
  marketStructureScore: number;
  riskAdjustedScore: number;
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
}

interface PositionSizing {
  suggestedSize: number;
  maxLoss: number;
  riskPercentage: number;
  pyramidingLevels: number[];
  trailingConfig: {
    type: 'PERCENTAGE' | 'ATR' | 'SUPPORT';
    value: number;
    activationLevel: number;
  };
}

interface RiskCheckResult {
  canAdd: boolean;
  warnings: string[];
  suggestedAdjustments: string[];
}

interface ScanMeta {
  source?: string;
  priceSource?: string;
  sortBy?: string;
  livePriceRefreshed?: number;
  livePriceFailed?: number;
  latestDataAt?: string | null;
  isLatestDataFresh?: boolean;
  latestSignalAt?: string | null;
  isLatestSignalFresh?: boolean;
  latestScannedAt?: string | null;
  isLatestScanFresh?: boolean;
  scanned?: number;
  matched?: number;
  failures?: number;
}

type SortMode = 'latest' | 'deltaDesc' | 'deltaAsc' | 'priceAsc' | 'priceDesc';

const viewCopy: Record<string, { label: string; plain: string; helper: string; risk: string }> = {
  signals: {
    label: 'EMA Bounce',
    plain: 'Pantulan EMA & buy on dip',
    helper: 'Saham yang baru masuk karena harga kembali menguat di area EMA/support. Cocok untuk entry bertahap dekat area beli.',
    risk: 'Valid selama harga tidak tembus stop dan delta tidak memburuk setelah D+2.',
  },
  entry: {
    label: 'Entry Ideal Live',
    plain: 'Zona entry hari ini',
    helper: 'Scan live untuk saham yang sedang berada di area beli ideal menurut trade plan teknikal.',
    risk: 'Gunakan hanya jika risk/reward masih masuk dan candle terakhir tidak invalidasi.',
  },
  cooldown: {
    label: 'Cooldown Reset',
    plain: 'Pullback sehat',
    helper: 'Saham yang sedang cooling down setelah naik. Fokusnya menunggu harga stabil sebelum lanjut.',
    risk: 'Jangan kejar harga; tunggu reclaim atau base baru.',
  },
  breakout: {
    label: 'Technical Breakout',
    plain: 'Base rapat siap breakout',
    helper: 'Kandidat yang masuk karena akumulasi rapat, power ignition, atau pola mirip pemenang historis.',
    risk: 'Valid jika volume dan harga tidak kembali masuk ke bawah area entry.',
  },
  divergence: {
    label: 'CVD Divergence',
    plain: 'Divergensi orderflow',
    helper: 'Kandidat dari ketidakseimbangan aliran volume terhadap harga.',
    risk: 'Butuh konfirmasi harga; jangan pakai jika struktur chart melemah.',
  },
  sqz_div: {
    label: 'Squeeze Divergence',
    plain: 'Kompresi volatilitas',
    helper: 'Saham yang masuk karena squeeze dan bullish divergence, dengan pilihan timeframe 1D atau 4H.',
    risk: 'Valid jika kompresi mulai release ke atas, bukan breakdown.',
  },
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatFreshness = (value?: string) => {
  if (!value) return "UNKNOWN";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "UNKNOWN";
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / 36_000) / 100);
  if (hours < 1) return "<1H AGO";
  if (hours < 24) return `${hours.toFixed(1)}H AGO`;
  return `${Math.floor(hours / 24)}D AGO`;
};

const formatPrice = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-';
};

const formatSignalAge = (hours?: number | null) => {
  if (hours === null || hours === undefined) return 'jam bursa belum tersedia';
  if (hours < 11) return `${hours} jam bursa aktif`;
  return `${(hours / 5.5).toFixed(1)} hari bursa aktif`;
};

const formatCategory = (value?: string) => String(value || 'TECHNICAL').replace(/_/g, ' ');

const evaluationTone = (status?: string) => {
  if (status === 'FAILED_D2') return 'failed';
  if (status === 'CONTINUE_D2') return 'continue';
  return 'watching';
};

const sortSignals = (signals: SignalData[], sortMode: SortMode) => {
  const sorted = [...signals];
  const numeric = (value: unknown, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  if (sortMode === 'deltaDesc') return sorted.sort((a, b) => numeric(b.deltaPct, -999) - numeric(a.deltaPct, -999));
  if (sortMode === 'deltaAsc') return sorted.sort((a, b) => numeric(a.deltaPct, 999) - numeric(b.deltaPct, 999));
  if (sortMode === 'priceAsc') return sorted.sort((a, b) => numeric(a.currentPrice || a.buyArea, 999999) - numeric(b.currentPrice || b.buyArea, 999999));
  if (sortMode === 'priceDesc') return sorted.sort((a, b) => numeric(b.currentPrice || b.buyArea, -1) - numeric(a.currentPrice || a.buyArea, -1));
  return sorted;
};

// PATCH 1: Enhanced Risk Management Functions
const detectMarketRegime = (marketData?: any[]): MarketConditions => {
  // Simplified market regime detection
  const defaultConditions: MarketConditions = {
    regime: 'SIDEWAYS',
    trendStrength: 0.5,
    volatility: 0.3,
    liquidity: 0.7,
    sentiment: 'NEUTRAL',
    vixLevel: 18
  };

  // In real implementation, this would analyze market data
  // For now, we'll use defaults with some logic
  return defaultConditions;
};

const calculateTechnicalScore = (signal: SignalData): number => {
  let score = 50; // Base score

  // Volume score (0-25 points)
  if (signal.volumeScore) {
    score += Math.min(25, signal.volumeScore * 0.25);
  }

  // Setup score (0-25 points)
  if (signal.setupScore) {
    score += Math.min(25, signal.setupScore * 0.25);
  }

  // Risk-Reward ratio (0-25 points)
  if (signal.rewardRisk && signal.rewardRisk > 1) {
    score += Math.min(25, signal.rewardRisk * 5);
  }

  // Volatility adjustment (penalty if too volatile)
  if (signal.atrPct) {
    const vol = parseFloat(signal.atrPct.toString());
    if (vol > 8) score -= 20;
    else if (vol > 6) score -= 10;
    else if (vol < 2) score += 10; // Low volatility bonus
  }

  return Math.max(0, Math.min(100, score));
};

const calculateRiskAdjustedScore = (signal: SignalData): number => {
  let score = 50;

  // Risk percentage analysis
  if (signal.riskPct) {
    const risk = parseFloat(signal.riskPct.toString());
    if (risk < 3) score += 20;
    else if (risk < 5) score += 10;
    else if (risk > 8) score -= 20;
    else if (risk > 10) score -= 30;
  }

  // Reward-Reward ratio
  if (signal.rewardRisk) {
    if (signal.rewardRisk >= 3) score += 25;
    else if (signal.rewardRisk >= 2) score += 15;
    else if (signal.rewardRisk >= 1.5) score += 5;
    else score -= 15;
  }

  // ATR-based volatility adjustment
  if (signal.atrPct) {
    const atr = parseFloat(signal.atrPct.toString());
    const volScore = Math.max(0, 100 - (atr * 10)); // Lower volatility = higher score
    score = (score + volScore) / 2;
  }

  return Math.max(0, Math.min(100, score));
};

const calculateSignalScore = (signal: SignalData, marketConditions?: MarketConditions): SignalScore => {
  const technicalScore = calculateTechnicalScore(signal);
  const volumeScore = signal.volumeScore || 50;
  const riskAdjustedScore = calculateRiskAdjustedScore(signal);

  // Market structure alignment (simplified)
  let marketStructureScore = 50;
  if (marketConditions) {
    if (marketConditions.regime === 'BULLISH' && signal.category === 'ENTRY_IDEAL') {
      marketStructureScore = 80;
    } else if (marketConditions.regime === 'BEARISH' && signal.category === 'COOLDOWN') {
      marketStructureScore = 75;
    } else if (marketConditions.regime === 'SIDEWAYS') {
      marketStructureScore = 60;
    }
  }

  // Weighted total score
  const totalScore = (
    technicalScore * 0.4 +
    volumeScore * 0.2 +
    marketStructureScore * 0.2 +
    riskAdjustedScore * 0.2
  );

  // Determine recommendation
  let recommendation: SignalScore['recommendation'] = 'HOLD';
  if (totalScore >= 80) recommendation = 'STRONG_BUY';
  else if (totalScore >= 65) recommendation = 'BUY';
  else if (totalScore < 40) recommendation = 'SELL';
  else if (totalScore < 25) recommendation = 'STRONG_SELL';

  return {
    totalScore: Math.round(totalScore),
    technicalScore: Math.round(technicalScore),
    fundamentalScore: 50, // Placeholder - would need fundamental data
    volumeScore,
    marketStructureScore: Math.round(marketStructureScore),
    riskAdjustedScore: Math.round(riskAdjustedScore),
    recommendation
  };
};

const calculateOptimalPosition = (signal: SignalData, accountSize: number = 100000): PositionSizing => {
  const maxRiskPerTrade = accountSize * 0.02; // 2% max risk

  // Calculate stop loss distance
  const stopDistance = signal.buyArea && signal.sl ?
    Math.abs(signal.buyArea - signal.sl) : 0;

  if (stopDistance === 0 || !signal.buyArea) {
    return {
      suggestedSize: 0,
      maxLoss: 0,
      riskPercentage: 0,
      pyramidingLevels: [],
      trailingConfig: { type: 'PERCENTAGE', value: 5, activationLevel: 2 }
    };
  }

  // Base position size calculation
  const baseShares = Math.floor(maxRiskPerTrade / stopDistance);

  // Adjust based on signal quality
  const score = calculateSignalScore(signal);
  const convictionMultiplier = {
    'STRONG_BUY': 1.5,
    'BUY': 1.25,
    'HOLD': 1.0,
    'SELL': 0.75,
    'STRONG_SELL': 0.5
  };

  const adjustedShares = Math.floor(
    baseShares * convictionMultiplier[score.recommendation]
  );

  // Ensure we don't exceed position size limits
  const positionValue = adjustedShares * signal.buyArea;
  const maxPositionValue = accountSize * 0.25; // Max 25% per position

  const finalShares = positionValue > maxPositionValue ?
    Math.floor(maxPositionValue / signal.buyArea) : adjustedShares;

  return {
    suggestedSize: finalShares,
    maxLoss: finalShares * stopDistance,
    riskPercentage: ((finalShares * stopDistance) / accountSize) * 100,
    pyramidingLevels: generatePyramidingLevels(signal, finalShares),
    trailingConfig: generateTrailingConfig(signal)
  };
};

const generatePyramidingLevels = (signal: SignalData, baseSize: number): number[] => {
  if (!signal.tp || !signal.buyArea) return [];

  const levels = [];
  const targetDistance = signal.tp - signal.buyArea;

  // Add entry levels at 25%, 50%, and 75% of target
  for (let i = 1; i <= 3; i++) {
    levels.push(Math.floor(baseSize * 0.25 * i));
  }

  return levels;
};

const generateTrailingConfig = (signal: SignalData): PositionSizing['trailingConfig'] => {
  // Use ATR for trailing if available, otherwise percentage
  if (signal.atrPct) {
    const atr = parseFloat(signal.atrPct.toString());
    return {
      type: 'ATR',
      value: atr * 2, // 2x ATR trailing
      activationLevel: 1.5 // Activate after 1.5R move
    };
  }

  return {
    type: 'PERCENTAGE',
    value: 3, // 3% trailing stop
    activationLevel: 2 // Activate after 2% gain
  };
};

const applyAdvancedFilters = (signals: SignalData[], marketConditions?: MarketConditions, filters?: any): SignalData[] => {
  // Default filters if not provided
  const defaultFilters = {
    minRiskReward: 2.0,
    maxVolatility: 8,
    minVolumeScore: 60,
    enableCorrelationCheck: true,
    maxSectorExposure: 30,
    enableAdvancedScoring: true
  };

  const activeFilters = filters || defaultFilters;

  return signals.filter(signal => {
    // Risk-Reward filter
    if (signal.rewardRisk && signal.rewardRisk < activeFilters.minRiskReward) {
      return false;
    }

    // Volatility filter
    if (signal.atrPct) {
      const vol = parseFloat(signal.atrPct.toString());
      if (vol > activeFilters.maxVolatility) {
        return false;
      }
    }

    // Volume score filter
    if (signal.volumeScore && signal.volumeScore < activeFilters.minVolumeScore) {
      return false;
    }

    // Market regime filter
    if (marketConditions && activeFilters.enableCorrelationCheck) {
      if (marketConditions.regime === 'BEARISH' &&
          signal.category !== 'COOLDOWN' &&
          signal.category !== 'ENTRY_IDEAL') {
        return false;
      }

      if (marketConditions.regime === 'VOLATILE' &&
          signal.riskPct && parseFloat(signal.riskPct.toString()) > 6) {
        return false;
      }
    }

    return true;
  });
};

export default function ScreenerPage() {
  const [data, setData] = useState<SignalData[]>([]);
  const [view, setView] = useState<'signals' | 'entry' | 'cooldown' | 'breakout' | 'divergence' | 'sqz_div' | 'arahunter'>('signals');
  const [priceRange, setPriceRange] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [sqzTimeframe, setSqzTimeframe] = useState<'1d' | '4h'>('1d');
  const [vectorFilter, setVectorFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);

  // PATCH 1: Enhanced Risk Management State
  const [marketConditions, setMarketConditions] = useState<MarketConditions | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState({
    minRiskReward: 2.0,
    maxVolatility: 8,
    minVolumeScore: 60,
    enableCorrelationCheck: true,
    maxSectorExposure: 30,
    enableAdvancedScoring: true
  });
  const [enhancedData, setEnhancedData] = useState<(SignalData & {
    score?: SignalScore;
    riskMetrics?: AdvancedRiskMetrics;
    positionSizing?: PositionSizing;
    riskCheck?: RiskCheckResult;
  })[]>([]);

  const fetchData = async () => {
    if (view === 'entry') {
      setScanning(true);
      setMsg("Memindai zona entry live...");
      try {
        await loadCurrentData();
        setMsg("Scan entry selesai. Cek delta, stop, dan target sebelum masuk.");
      } catch {
        setMsg("Scan entry gagal. Coba ulang beberapa saat lagi.");
      } finally {
        setScanning(false);
        setTimeout(() => setMsg(""), 5000);
      }
      return;
    }

    setScanning(true);
    setMsg("Memperbarui screener dari data terbaru dan menyimpan hasil ke database...");
    try {
      const scanRes = await fetch("/api/screener/scan", { method: "POST" });
      const scanJson = await scanRes.json();
      if (scanJson.success) {
        setMsg(`Scan selesai. Data terbaru tersimpan di DB pada ${formatDateTime(scanJson.scanCompletedAt)}.`);
        await loadCurrentData();
      } else {
        setMsg("Scan gagal: " + scanJson.error);
      }
    } catch {
      setMsg("Koneksi gagal saat menjalankan scan.");
    } finally {
      setScanning(false);
      setTimeout(() => setMsg(""), 5000);
    }
  };

  const loadCurrentData = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = view === 'entry'
        ? `/api/screener/entry-ideal?priceRange=${priceRange}&interval=1d`
        : `/api/screener?priceRange=${priceRange}&dateFilter=${dateFilter}`;
      const res = await fetch(endpoint);
      const json = await res.json();
      if (json.success) {
        const rawData = json.data;

        // PATCH 1: Apply enhanced processing
        // Detect market conditions (in real app, this would come from API)
        const conditions = detectMarketRegime();
        setMarketConditions(conditions);

        // Apply advanced filters
        const filteredSignals = applyAdvancedFilters(rawData, conditions, advancedFilters);

        // Calculate scores and metrics
        const enhancedSignals = filteredSignals.map(signal => {
          const score = calculateSignalScore(signal, conditions);
          const positionSizing = calculateOptimalPosition(signal);

          return {
            ...signal,
            score,
            positionSizing,
            riskMetrics: {
              volatilityScore: signal.atrPct ? Math.max(0, 100 - parseFloat(signal.atrPct.toString()) * 10) : 50,
              correlationScore: 50, // Placeholder - would need correlation data
              liquidityScore: signal.volumeScore || 50,
              regimeScore: conditions.regime === 'BULLISH' ? 80 : conditions.regime === 'BEARISH' ? 30 : 60,
              portfolioOverlap: 0, // Placeholder - would need portfolio data
              riskAdjustedReturn: score.riskAdjustedScore,
              maxPositionSize: positionSizing.suggestedSize,
              recoveryFactor: 0.5 // Placeholder - would need historical data
            }
          };
        });

        setData(rawData); // Keep original data
        setEnhancedData(enhancedSignals); // Set enhanced data
        setScanMeta(json.scanMeta || null);
      } else {
        setData([]);
        setEnhancedData([]);
        setScanMeta(null);
        setMsg(`LOAD_FAILED: ${json.error || 'UNKNOWN'}`);
      }
    } catch {
      console.error("Failed to load current data");
      setData([]);
      setEnhancedData([]);
      setScanMeta(null);
    } finally {
      setLoading(false);
    }
  }, [priceRange, dateFilter, view, advancedFilters]);

  useEffect(() => {
    const savedToken = localStorage.getItem("botToken");
    const savedChat = localStorage.getItem("chatId");
    if (savedToken) setBotToken(savedToken);
    if (savedChat) setChatId(savedChat);
  }, []);

  useEffect(() => {
    loadCurrentData();
  }, [priceRange, dateFilter, view, advancedFilters]);

  const baseSignals = data.filter(s => {
      const source = s.signalSource || s.strategy || "";
      const category = String(s.category || s.metadata?.category || "").toUpperCase();
      const vector = String(s.vector || s.metadata?.vector || "").toUpperCase();
      if (view === 'entry') return category === 'ENTRY_IDEAL' || source.includes('ENTRY_IDEAL');
      if (view === 'cooldown') return category === 'COOLDOWN' || /COOLDOWN|EXTENDED_EMA20_COOLDOWN|PULLBACK|SIDEWAYS/.test(`${source} ${vector}`.toUpperCase());
      if (view === 'breakout') return category === 'TECHNICAL_BREAKOUT' || /TECHNICAL_BREAKOUT|TIGHT_FLAT|POWER_IGNITION|WINNER_SIMILARITY|TECHNICAL BREAKOUT/.test(`${source} ${vector}`.toUpperCase());
      if (view === 'divergence') return source.includes('CVD');
      if (view === 'sqz_div') {
          const sourceLower = source.toLowerCase();
          const vector = String(s.vector || s.metadata?.vector || "").toLowerCase();
          const isSqz = category === 'SQUEEZE_DIVERGENCE' || sourceLower.includes('squeeze divergence') || vector.includes('sqz_bull_div');
          const hasExplicitTf = sourceLower.includes('1d') || sourceLower.includes('4h') || vector.includes('1d') || vector.includes('4h');
          const isRightTF = sourceLower.includes(sqzTimeframe.toLowerCase()) || vector.includes(sqzTimeframe.toLowerCase()) || (!hasExplicitTf && sqzTimeframe === '1d');
          return isSqz && isRightTF;
      }
      return [
        category,
        vector,
        source.toUpperCase()
      ].some(value => /EMA_BOUNCE|ELITE_BOUNCE|BUY_ON_DIP|TURNAROUND|EXPLOSION|SQUEEZE_RELEASE|PERFECT_RETEST|RETEST|DIP|EMA20/.test(value));
  });

  const vectorOptions = Array.from(new Set(baseSignals.flatMap(s => {
    const category = String(s.category || s.metadata?.category || "").trim().toUpperCase();
    const vector = String(s.vector || s.metadata?.vector || "").trim().toUpperCase();
    return [category, vector].filter(Boolean);
  }))).sort((a, b) => a.localeCompare(b));

  const filteredSignals = vectorFilter === 'all'
    ? baseSignals
    : baseSignals.filter(s => {
      const source = String(s.signalSource || s.strategy || "").toUpperCase();
      const category = String(s.category || s.metadata?.category || "").toUpperCase();
      const vector = String(s.vector || s.metadata?.vector || "").toUpperCase();
      return [category, vector].some(value => value === vectorFilter) || source.includes(vectorFilter);
    });

  const displayedSignals = sortSignals(filteredSignals, sortMode);

  const activeAccent = view === 'entry'
    ? 'oklch(0.78 0.2 115)'
    : (view === 'cooldown' ? 'oklch(0.82 0.18 95)' : (view === 'breakout' ? 'oklch(0.84 0.18 75)' : (view === 'sqz_div' ? 'oklch(0.82 0.18 145)' : 'var(--accent-emerald)')));
  const activeViewCopy = viewCopy[view] || viewCopy.signals;
  const activeViewLabel = activeViewCopy.label;
  const activeRiskBadge = view === 'entry'
    ? 'In zone + RR layak'
    : (view === 'cooldown' ? 'Pullback terkontrol' : (view === 'breakout' ? 'Akumulasi rapat' : (view === 'sqz_div' ? 'Squeeze + divergence' : 'Risk terukur')));

  const saveSettings = () => {
    localStorage.setItem("botToken", botToken);
    localStorage.setItem("chatId", chatId);
    setShowSettings(false);
    setMsg("CONFIG_SAVED");
    setTimeout(() => setMsg(""), 3000);
  };

  const sendToTelegram = async () => {
    if (!botToken || !chatId) {
      setMsg("CONFIG_MISSING");
      return;
    }
    setSending(true);
    try {
      const signalsToPush = displayedSignals.slice(0, 3);
      if (signalsToPush.length === 0) {
          setMsg("NO_SIGNALS_TO_PUSH");
          setSending(false);
          return;
      }

      const text = `🎯 *SCREENER ANALYTICS REPORT*\n\n` + 
        signalsToPush.map(s => {
          const meta = s.metadata || {};
          const mfi = parseFloat(String(meta.mfi)) || 0;
          const dist20 = parseFloat(String(meta.dist20)) || 0;
          const consolidation = parseFloat(String(meta.consolidationScore)) || 0;
          
          let projection = "🔄 *PATTERN FORMING*";
          if (consolidation < 4.0 && mfi > 60 && mfi < 88 && dist20 > 0 && dist20 < 5) {
              projection = "🚀 *BREAKOUT ANALYSIS:* Strong accumulation coiling near EMA20.";
          }

          return `🚀 *${s.ticker}*\n` +
            `💰 Area: ${s.buyArea} | Tgt: ${s.tp}\n` +
            `📊 MFI: ${mfi.toFixed(1)} | Dist: ${dist20.toFixed(1)}%\n` +
            `${projection}\n` +
            `🛑 SL: ${s.sl}`;
        }).join('\n\n---\n\n');

      const res = await fetch("/api/telegram", {
        method: "POST",
        body: JSON.stringify({ botToken, chatId, text }),
      });
      const json = await res.json();
      if (json.success) setMsg("Pushed to Telegram!");
      else setMsg("Push failed: " + json.error);
    } catch {
      setMsg("Connection error.");
    } finally {
      setSending(false);
      setTimeout(() => setMsg(""), 4000);
    }
  };

  return (
    <div className="screener-root min-h-screen bg-[#050505] text-silver-300 font-mono">
      
      <main className="screener-container">
        <header className="screener-header">
          <div className="header-left">
            <div className="eyebrow">Screener saham tersimpan</div>
            <h1 className="main-title">Saham yang Baru Masuk Radar</h1>
            <p className="page-subtitle">
              Lihat kapan sinyal muncul, progres harga dari entry, dan keputusan evaluasi otomatis D+2 sebelum lanjut ke conviction report.
            </p>
            <div className="tabs-container custom-scrollbar">
              {[
                { id: 'signals', label: 'EMA Bounce', color: 'var(--accent-emerald)' },
                { id: 'entry', label: 'Entry Ideal', color: 'oklch(0.78 0.2 115)' },
                { id: 'cooldown', label: 'Cooldown', color: 'oklch(0.82 0.18 95)' },
                { id: 'breakout', label: 'Breakout', color: 'oklch(0.84 0.18 75)' },
                { id: 'divergence', label: 'CVD Divergence', color: 'oklch(0.7 0.2 300)' },
                { id: 'sqz_div', label: 'SQZ Divergence', color: 'oklch(0.82 0.18 145)' }
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => { setView(tab.id as any); setVectorFilter('all'); }} 
                  className={`tab-item ${view === tab.id ? 'active' : ''}`}
                  style={{ '--tab-accent': tab.color } as any}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="controls-group">
            <div className="filter-title"><Filter size={13} /> Filter & urutkan</div>
            <div className="filters-row">
              {view === 'sqz_div' && (
                <div className="select-wrapper">
                  <label>Timeframe</label>
                  <select value={sqzTimeframe} onChange={e => setSqzTimeframe(e.target.value as any)}>
                    <option value="1d">1D</option>
                    <option value="4h">4H</option>
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              )}
              <div className="select-wrapper">
                <label>Harga entry</label>
                <select value={priceRange} onChange={e => setPriceRange(e.target.value)}>
                    <option value="all">Semua harga</option>
                    <option value="under300">Di bawah 300</option>
                    <option value="under500">Di bawah 500</option>
                    <option value="above500">500 ke atas</option>
                </select>
                <ChevronDown size={14} className="select-icon" />
              </div>
              {view !== 'entry' && (
                <div className="select-wrapper">
                  <label>Waktu muncul</label>
                  <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                      <option value="all">Semua sinyal aktif</option>
                      <option value="today">Hari ini</option>
                      <option value="3d">3 hari terakhir</option>
                      <option value="7d">7 hari terakhir</option>
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              )}
              <div className="select-wrapper">
                <label>Urutkan</label>
                <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}>
                    <option value="latest">Sinyal terbaru</option>
                    <option value="deltaDesc">Delta tertinggi</option>
                    <option value="deltaAsc">Delta terendah</option>
                    <option value="priceAsc">Harga termurah</option>
                    <option value="priceDesc">Harga tertinggi</option>
                </select>
                <ChevronDown size={14} className="select-icon" />
              </div>
            </div>
            
            <div className="actions-row">
              <button className="action-btn scan-btn" onClick={fetchData} disabled={loading || scanning}>
                <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
                <span>{scanning ? "Memindai..." : (view === 'entry' ? "Scan entry" : "Scan terbaru")}</span>
              </button>
              <button className="action-btn icon-only" onClick={() => setShowSettings(!showSettings)}>
                <Settings size={14} />
              </button>
              <button 
                className={`action-btn icon-only ${(!botToken || !chatId || loading || scanning) ? 'disabled' : ''}`} 
                onClick={sendToTelegram} 
                disabled={sending || loading || scanning}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </header>

        {msg && <div className="status-toast">{msg}</div>}

        {showSettings && (
          <div className="settings-panel animate-slide-down">
            <div className="panel-header">COMM_SYSTEM_CONFIG</div>
            <div className="settings-grid">
              <div className="input-field">
                <label>BOT_TOKEN</label>
                <input type="password" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="Enter API Token..." />
              </div>
              <div className="input-field">
                <label>CHAT_ID</label>
                <input type="text" value={chatId} onChange={e => setChatId(e.target.value)} placeholder="Enter Target ID..." />
              </div>
              <button className="save-settings-btn" onClick={saveSettings}>
                <Check size={14} />
                <span>SAVE_CONFIG</span>
              </button>
            </div>
          </div>
        )}

        <div className="signals-viewport panel">
          <div className="viewport-header">
            <div className="header-status">
              <div className="pulse-dot" style={{ backgroundColor: activeAccent }}></div>
              <div>
                <span className="view-label">{activeViewLabel}</span>
                <p className="view-helper">{activeViewCopy.helper}</p>
              </div>
              {(loading || scanning) && <span className="refreshing-tag animate-pulse">Memperbarui data...</span>}
            </div>
            <span className="risk-badge">
               {activeRiskBadge}
            </span>
          </div>

          <div className="scan-freshness-strip">
            <span>Data: {scanMeta?.source ? (view === 'entry' ? 'live trade plan' : 'sinyal tersimpan di DB') : 'memuat'}</span>
            {view !== 'entry' && scanMeta?.priceSource && <span>Harga: {scanMeta.priceSource}</span>}
            {scanMeta?.sortBy && <span>Default: sinyal terbaru</span>}
            {view !== 'entry' && scanMeta?.livePriceRefreshed !== undefined && <span>Quote live: {scanMeta.livePriceRefreshed}</span>}
            {view !== 'entry' && Boolean(scanMeta?.livePriceFailed) && <span className="fresh-warn">Quote gagal: {scanMeta?.livePriceFailed}</span>}
            <span>Sinyal terakhir: {formatFreshness(scanMeta?.latestSignalAt || scanMeta?.latestScannedAt || undefined)}</span>
            <span>Harga terakhir: {formatFreshness(scanMeta?.latestDataAt || scanMeta?.latestScannedAt || undefined)}</span>
            {view !== 'entry' && <span>Scan DB: {formatFreshness(scanMeta?.latestScannedAt || undefined)}</span>}
            {view === 'entry' && <span>Match: {scanMeta?.matched ?? 0}/{scanMeta?.scanned ?? '-'}</span>}
            {view === 'entry' && Boolean(scanMeta?.failures) && <span className="fresh-warn">Fetch gagal: {scanMeta?.failures}</span>}
            <span className={(scanMeta?.isLatestSignalFresh ?? scanMeta?.isLatestScanFresh) ? 'fresh-ok' : 'fresh-warn'}>
              {(scanMeta?.isLatestSignalFresh ?? scanMeta?.isLatestScanFresh) ? 'Data masih baru' : 'Klik Scan terbaru'}
            </span>
          </div>

          <div className="explain-strip">
            <div><strong>Kapan masuk?</strong><span>Kolom muncul menunjukkan waktu sinyal pertama kali masuk kategori ini.</span></div>
            <div><strong>Progress</strong><span>Delta dan mini chart membandingkan harga terbaru terhadap entry awal.</span></div>
            <div><strong>Evaluasi D+2</strong><span>Hanya menghitung jam bursa aktif. Weekend, libur, atau quote/IHSG tidak bergerak tidak dihitung.</span></div>
          </div>

          {(loading || scanning) && data.length === 0 ? (
            <div className="loading-container">
              <div className="scanner-glow"></div>
              <div className="loading-text">{scanning ? (view === 'entry' ? "Memindai area entry..." : "Membaca ulang pasar...") : "Menghubungkan data..."}</div>
              <div className="loading-sub">{view === 'entry' ? "Menyinkronkan trade plan teknikal" : "Memakai sinyal DB dan hanya memperbarui kandidat terbaru"}</div>
            </div>
          ) : displayedSignals.length === 0 ? (
            <div className="empty-viewport">Tidak ada sinyal aktif untuk filter ini.</div>
          ) : (
            <div className={`table-responsive custom-scrollbar ${(loading || scanning) ? 'opacity-50' : ''}`}>
              <table className="signals-table">
                <thead>
                  <tr>
                    <th style={{width: '14%'}}>TICKER</th>
                    <th style={{width: '16%'}}>
                      <div className="vector-header-filter">
                        <span>KATEGORI / VECTOR</span>
                        <select value={vectorFilter} onChange={e => setVectorFilter(e.target.value)} className="vector-column-select">
                          <option value="all">Semua kategori</option>
                          {vectorOptions.map(option => (
                            <option key={option} value={option}>{formatCategory(option)}</option>
                          ))}
                        </select>
                      </div>
                    </th>
                    <th className="hide-tablet" style={{width: '10%'}}>MUNCUL</th>
                    <th className="hide-tablet text-right" style={{width: '8%'}}>RISK / RR</th>
                    <th className="text-right" style={{width: '10%'}}>ENTRY</th>
                    <th className="text-right" style={{width: '12%'}}>TARGET</th>
                    <th className="hide-tablet text-right" style={{width: '10%'}}>STOP</th>
                    <th className="text-right" style={{width: '8%'}}>DELTA</th>
                    <th className="hide-mobile text-center" style={{width: '12%'}}>MINI CHART</th>
                    <th className="text-center" style={{width: '5%'}}>CHART</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSignals.map((row, i) => {
                    const referencePrice = row.idealBuy || row.buyArea;
                    const targetPrice = row.target1 || row.tp;
                    const hasCurrentPrice = typeof row.currentPrice === 'number' && Number.isFinite(row.currentPrice);
                    const profit = row.deltaPct ?? ((hasCurrentPrice && referencePrice) ? ((row.currentPrice! - referencePrice) / referencePrice) * 100 : null);
                    const history = row.priceHistory || [];
                    const pathData = history.length > 1 ? history : (referencePrice && hasCurrentPrice ? [{ price: referencePrice }, { price: row.currentPrice! }] : []);
                    const pathFirst = pathData[0]?.price;
                    const pathLast = pathData[pathData.length - 1]?.price;
                    const pathDirection = Number(pathLast) >= Number(pathFirst) ? 'naik' : 'turun';
                    const entryDisplay = view === 'entry' && row.entryLow && row.entryHigh
                      ? `${row.entryLow}-${row.entryHigh}`
                      : formatPrice(row.buyArea);
                    const riskDisplay = view === 'entry'
                      ? `${row.maxLossPct?.toFixed(1) || row.riskPct || '-'}%/${row.rewardRisk?.toFixed(2) || '-'}R`
                      : (row.riskPct ? `${row.riskPct}%` : '-');
                    const evaluation = row.evaluation || row.metadata?.evaluation;
                    const tone = evaluationTone(evaluation?.status);
                    
                    return (
                      <tr key={i} className="signal-row">
                        <td>
                          <div className="ticker-cell">
                            <span className="ticker-name">{row.ticker.replace('.JK', '')}</span>
                            {row.metadata?.fluxStatus && (
                              <div className="ticker-metadata">
                                <span>FLX: {row.metadata.fluxStatus}</span>
                                <span>SQZ: {row.metadata.squeezeStatus}</span>
                              </div>
                            )}
                            <div className="ticker-metadata">
                              <span>{formatCategory(row.category || row.metadata?.category)}</span>
                              <span>QUOTE: {formatFreshness(row.lastQuoteDate || row.metadata?.lastQuoteDate)}</span>
                              {row.state && <span>{row.stateLabel || row.state}</span>}
                              {row.metadata?.confidenceLevel && (
                                <span className={`confidence-badge ${row.metadata.confidenceLevel.toLowerCase()}`}>
                                  {row.metadata.confidenceLevel}
                                </span>
                              )}
                              {row.metadata?.expectedReturn && (
                                <span className="target-return">
                                  TARGET: {row.metadata.expectedReturn}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="strategy-badge" style={(() => {
                              const s = row.strategy?.toLowerCase() || '';
                              let color = 'oklch(0.7 0.2 150)'; // Default emerald
                              
                              if (s.includes('entry_ideal')) color = 'oklch(0.78 0.2 115)';
                              else if (s.includes('cooldown')) color = 'oklch(0.82 0.18 95)';
                              else if (s.includes('elite')) color = 'oklch(0.85 0.3 180)';
                              else if (s.includes('explosion') || s.includes('volatility')) color = 'oklch(0.85 0.25 150)';
                              else if (s.includes('dip')) color = 'oklch(0.8 0.25 160)';
                              else if (s.includes('turnaround')) color = 'oklch(0.85 0.15 240)';
                              else if (s.includes('arahunter')) color = 'oklch(0.85 0.2 85)';
                              else if (s.includes('scalp')) color = 'oklch(0.75 0.2 45)';
                              else if (s.includes('retest')) color = 'oklch(0.8 0.15 220)';
                              else if (s.includes('cvd')) color = 'oklch(0.7 0.2 300)';
                              else if (s.includes('squeeze')) color = 'oklch(0.82 0.18 145)';
                              else if (s.includes('bounce')) {
                                  // Check for high confidence indicators
                                  const metadata = row.metadata || {};
                                  if (metadata.confidenceLevel === 'HIGH' || metadata.confidenceLevel === 'FAST_HIGH_PROB') {
                                      color = 'oklch(0.85 0.3 180)'; // Gold for high confidence
                                  } else if (metadata.confidenceLevel === 'MEDIUM') {
                                      color = 'oklch(0.85 0.25 200)'; // Cyan for medium
                                  } else {
                                      color = 'oklch(0.7 0.2 150)'; // Default emerald
                                  }
                              }
                              
                              return {
                                  color: color,
                                  borderColor: `oklch(from ${color} l c h / 0.3)`,
                                  backgroundColor: `oklch(from ${color} l c h / 0.1)`
                              };
                          })()}>
                            {row.strategy?.replace('CONVICTION: ', '').replace('SIGNAL: ', '').replace('SCALP: ', '') || 'BOUNCE'}
                          </span>
                          <div className="vector-subline">{row.vector || row.metadata?.vector || 'GENERAL'}</div>
                        </td>
                        <td className="hide-tablet">
                          <div className="appeared-cell">
                            <span>{formatDateTime(row.appearedAt || row.createdAt || row.entryDate)}</span>
                            <small>{formatSignalAge(evaluation?.activeMarketHours ?? evaluation?.ageHours)}</small>
                            <small>Scan: {formatFreshness(row.lastScannedAt || row.updatedAt || row.metadata?.lastScannedAt || row.metadata?.scanRunAt)}</small>
                          </div>
                        </td>
                        <td className="hide-tablet text-right risk-cell">{riskDisplay}</td>
                        <td className="text-right weight-700">{entryDisplay}</td>
                        <td className="text-right weight-700 text-emerald">{formatPrice(targetPrice)}</td>
                        <td className="text-right hide-tablet text-rose weight-700">{formatPrice(row.sl)}</td>
                        <td className="text-right">
                          <div className="profit-cell">
                            <span className={`profit-val ${profit === null || profit >= 0 ? 'pos' : 'neg'}`}>
                              {profit === null ? '-' : `${profit >= 0 ? '+' : ''}${profit.toFixed(1)}%`}
                            </span>
                            <span className="time-val">
                              {hasCurrentPrice ? `harga ${formatPrice(row.currentPrice)}` : 'harga -'}
                            </span>
                            <span className={`evaluation-pill ${tone}`}>{evaluation?.label || 'Menunggu evaluasi'}</span>
                          </div>
                        </td>
                        <td className="hide-mobile">
                          <div className="sparkline-container">
                            {pathData.length > 1 && (
                              <svg viewBox="0 0 100 30" preserveAspectRatio="none">
                                <path
                                  d={(() => {
                                      const prices = pathData.map(p => p.price);
                                      const min = Math.min(...prices);
                                      const max = Math.max(...prices);
                                      const range = max - min || 1;
                                      return pathData.map((p, idx) => {
                                          const x = (idx / (pathData.length - 1)) * 100;
                                          const y = 28 - ((p.price - min) / range) * 26;
                                          return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                                      }).join(' ');
                                  })()}
                                  className={`sparkline-path ${profit === null || profit >= 0 ? 'pos' : 'neg'}`}
                                />
                              </svg>
                            )}
                            {pathData.length > 1 && <small className={`sparkline-caption ${pathDirection}`}>trend {pathDirection}</small>}
                          </div>
                        </td>
                        <td className="text-center">
                          <Link href={`/search?symbol=${row.ticker}`} className="analyze-link">
                              <BarChart2 size={14} />
                              <span className="hide-tablet">Report</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
            --glass-bg: oklch(0.15 0.02 240 / 0.8);
        }

        .screener-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .screener-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 32px;
            flex-wrap: wrap;
        }

        .header-left {
            flex: 1;
            min-width: 300px;
        }

        .eyebrow {
            color: var(--accent-emerald);
            font-size: 0.68rem;
            font-weight: 1000;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            margin-bottom: 8px;
        }

        .main-title {
            font-size: clamp(1.4rem, 3vw, 2.4rem);
            font-weight: 1000;
            color: white;
            letter-spacing: -0.03em;
            margin-bottom: 8px;
            text-shadow: 0 0 20px oklch(1 0 0 / 0.1);
        }

        .page-subtitle {
            color: oklch(0.74 0.02 240);
            max-width: 720px;
            line-height: 1.6;
            font-size: 0.86rem;
            margin: 0 0 20px;
        }

        .tabs-container {
            display: flex;
            gap: 4px;
            overflow-x: auto;
            padding-bottom: 8px;
            mask-image: linear-gradient(to right, black 85%, transparent 100%);
        }

        .tab-item {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-size: 0.7rem;
            font-weight: 900;
            padding: 8px 16px;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
            letter-spacing: 0.05em;
            border-bottom: 2px solid transparent;
        }

        .tab-item:hover { color: white; }
        .tab-item.active {
            color: var(--tab-accent);
            border-bottom-color: var(--tab-accent);
            background: oklch(from var(--tab-accent) l c h / 0.05);
        }

        .controls-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: flex-end;
            background: oklch(0.12 0.015 240 / 0.78);
            border: 1px solid var(--border-tactical);
            border-radius: 14px;
            padding: 14px;
        }

        .filter-title {
            display: flex;
            align-items: center;
            gap: 8px;
            color: white;
            width: 100%;
            font-size: 0.68rem;
            font-weight: 1000;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .filters-row, .actions-row {
            display: flex;
            gap: 8px;
        }

        .select-wrapper {
            position: relative;
            background: oklch(0.12 0.01 240);
            border: 1px solid var(--border-tactical);
            border-radius: 10px;
            min-width: 168px;
        }

        .select-wrapper label {
            display: block;
            color: var(--text-muted);
            font-size: 0.52rem;
            font-weight: 1000;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            padding: 8px 32px 0 12px;
        }

        .select-wrapper select {
            appearance: none;
            background: transparent;
            border: none;
            color: white;
            font-size: 0.72rem;
            font-weight: 800;
            padding: 3px 32px 8px 12px;
            cursor: pointer;
            width: 100%;
            font-family: inherit;
            min-height: 34px;
        }

        .select-wrapper select option,
        .vector-column-select option {
            background: #11131a;
            color: #f8fafc;
        }

        .select-wrapper select:focus,
        .vector-column-select:focus {
            outline: 2px solid oklch(0.75 0.2 200 / 0.55);
            outline-offset: 2px;
        }

        .select-icon {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            pointer-events: none;
            color: var(--text-muted);
        }

        .action-btn {
            background: oklch(0.2 0.02 240);
            border: 1px solid var(--border-tactical);
            color: white;
            font-size: 0.7rem;
            font-weight: 900;
            padding: 0 16px;
            height: 32px;
            min-height: 40px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .action-btn:hover:not(:disabled) {
            background: oklch(0.25 0.02 240);
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
        }

        .action-btn.icon-only { padding: 0 10px; }
        .action-btn.disabled { opacity: 0.4; cursor: not-allowed; }

        .scan-btn {
            background: oklch(0.7 0.2 150 / 0.1);
            border-color: oklch(0.7 0.2 150 / 0.3);
            color: var(--accent-emerald);
        }

        .scan-btn:hover:not(:disabled) {
            background: oklch(0.7 0.2 150 / 0.2);
            border-color: var(--accent-emerald);
        }

        .status-toast {
            background: oklch(0.7 0.2 150 / 0.1);
            border: 1px solid var(--accent-emerald);
            color: var(--accent-emerald);
            padding: 10px 16px;
            font-size: 0.75rem;
            font-weight: 800;
            border-radius: 8px;
            animation: slide-in 0.3s ease-out;
        }

        .settings-panel {
            background: var(--panel-bg);
            border: 1px solid var(--border-tactical);
            border-radius: 12px;
            padding: 20px;
        }

        .panel-header {
            font-size: 0.7rem;
            font-weight: 900;
            color: var(--text-muted);
            margin-bottom: 16px;
            letter-spacing: 0.1em;
        }

        .settings-grid {
            display: grid;
            grid-template-columns: 1fr 1fr auto;
            gap: 16px;
            align-items: flex-end;
        }

        .input-field label {
            display: block;
            font-size: 0.6rem;
            color: var(--text-muted);
            margin-bottom: 6px;
        }

        .input-field input {
            width: 100%;
            background: oklch(0.1 0 0);
            border: 1px solid var(--border-tactical);
            padding: 10px;
            color: white;
            font-family: inherit;
            font-size: 0.8rem;
            border-radius: 6px;
        }

        .save-settings-btn {
            height: 40px;
            background: var(--accent-emerald);
            color: black;
            border: none;
            padding: 0 20px;
            border-radius: 6px;
            font-weight: 900;
            font-size: 0.7rem;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }

        .signals-viewport {
            background: var(--panel-bg);
            border: 1px solid var(--border-tactical);
            border-radius: 16px;
            overflow: hidden;
        }

        .table-responsive {
            overflow-x: auto;
            overflow-y: visible;
        }

        .viewport-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-tactical);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .scan-freshness-strip {
            display: flex;
            gap: 14px;
            flex-wrap: wrap;
            padding: 10px 24px;
            border-bottom: 1px solid var(--border-tactical);
            background: oklch(0.11 0.015 240 / 0.85);
            color: var(--text-muted);
            font-size: 0.6rem;
            font-weight: 900;
            letter-spacing: 0.06em;
        }

        .fresh-ok { color: var(--accent-emerald); }
        .fresh-warn { color: oklch(0.85 0.2 70); }

        .header-status {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .pulse-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        .view-label {
            display: block;
            font-size: 0.9rem;
            font-weight: 1000;
            color: white;
            letter-spacing: 0.05em;
        }

        .view-helper {
            margin: 4px 0 0;
            color: var(--text-muted);
            font-size: 0.68rem;
            font-weight: 700;
            line-height: 1.5;
            max-width: 760px;
            letter-spacing: 0;
        }

        .explain-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 1px;
            background: var(--border-tactical);
            border-bottom: 1px solid var(--border-tactical);
        }

        .explain-strip div {
            background: oklch(0.13 0.016 240);
            padding: 14px 18px;
        }

        .explain-strip strong {
            display: block;
            color: white;
            font-size: 0.68rem;
            font-weight: 1000;
            margin-bottom: 4px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }

        .explain-strip span {
            color: oklch(0.7 0.02 240);
            font-size: 0.68rem;
            line-height: 1.45;
        }

        .refreshing-tag {
            font-size: 0.6rem;
            font-weight: 900;
            color: var(--accent-cyan);
            background: oklch(from var(--accent-cyan) l c h / 0.1);
            padding: 2px 8px;
            border-radius: 4px;
            letter-spacing: 0.05em;
        }

        .opacity-50 { opacity: 0.5; }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

        .risk-badge {
            font-size: 0.65rem;
            font-weight: 900;
            color: var(--accent-rose);
            background: oklch(0.6 0.2 25 / 0.1);
            padding: 4px 10px;
            border-radius: 4px;
            border: 1px solid oklch(0.6 0.2 25 / 0.2);
        }

        .loading-container {
            padding: 80px 40px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            position: relative;
        }

        .scanner-glow {
            width: 240px;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--accent-emerald), transparent);
            position: relative;
            overflow: hidden;
        }

        .scanner-glow::after {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, white, transparent);
            animation: scan 2s infinite linear;
        }

        .loading-text { font-size: 1rem; font-weight: 1000; color: var(--accent-emerald); letter-spacing: 0.1em; }
        .loading-sub { font-size: 0.7rem; color: var(--text-muted); }

        .signals-table {
            width: 100%;
            min-width: 1280px;
            border-collapse: collapse;
            font-size: 0.8rem;
            table-layout: auto;
        }

        .signals-table th {
            text-align: left;
            padding: 10px 12px;
            color: var(--text-muted);
            font-size: 0.6rem;
            font-weight: 900;
            letter-spacing: 0.1em;
            border-bottom: 1px solid var(--border-tactical);
            background: oklch(0.18 0.02 240);
        }

        .vector-header-filter {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 180px;
        }

        .vector-column-select {
            width: 100%;
            min-width: 170px;
            appearance: none;
            background: #11131a;
            border: 1px solid var(--border-tactical);
            color: white;
            border-radius: 5px;
            padding: 5px 8px;
            font-family: inherit;
            font-size: 0.58rem;
            font-weight: 900;
            letter-spacing: 0.04em;
        }

        .signal-row {
            border-bottom: 1px solid var(--border-tactical);
            transition: background 0.2s;
        }

        .signal-row:hover { background: oklch(0.18 0.02 240 / 0.5); }

        .signal-row td { padding: 10px 12px; vertical-align: middle; overflow: visible; }

        .ticker-name { font-size: 1.1rem; font-weight: 1000; color: white; display: block; }
        .ticker-metadata { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .ticker-metadata span { font-size: 0.55rem; color: var(--text-muted); font-weight: 800; }

        .confidence-badge {
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.5rem;
          font-weight: 1000;
          text-transform: uppercase;
        }

        .confidence-badge.high {
          background: oklch(0.7 0.2 150 / 0.2);
          color: var(--accent-emerald);
          border: 1px solid oklch(0.7 0.2 150 / 0.4);
        }

        .confidence-badge.medium {
          background: oklch(0.85 0.25 200 / 0.2);
          color: oklch(0.85 0.25 200);
          border: 1px solid oklch(0.85 0.25 200 / 0.4);
        }

        .confidence-badge.standard {
          background: oklch(0.75 0.2 320 / 0.2);
          color: oklch(0.75 0.2 320);
          border: 1px solid oklch(0.75 0.2 320 / 0.4);
        }

        .confidence-badge.fast_high_prob {
          background: oklch(0.85 0.3 180 / 0.2);
          color: oklch(0.85 0.3 180);
          border: 1px solid oklch(0.85 0.3 180 / 0.4);
        }

        .target-return {
          background: oklch(0.6 0.2 25 / 0.2);
          color: oklch(0.6 0.2 25);
          border: 1px solid oklch(0.6 0.2 25 / 0.4);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.5rem;
          font-weight: 1000;
        }

        .strategy-badge {
            font-size: 0.6rem;
            font-weight: 1000;
            padding: 2px 8px;
            border-radius: 4px;
            background: oklch(0.7 0.2 150 / 0.1);
            color: var(--accent-emerald);
            border: 1px solid oklch(0.7 0.2 150 / 0.3);
            white-space: normal;
            overflow: visible;
            text-overflow: clip;
            display: inline-block;
            max-width: 100%;
            line-height: 1.35;
        }

        .vector-subline {
            margin-top: 6px;
            color: var(--text-muted);
            font-size: 0.55rem;
            font-weight: 900;
            letter-spacing: 0.04em;
            overflow: visible;
            text-overflow: clip;
            white-space: normal;
            overflow-wrap: anywhere;
        }

        .appeared-cell { display: flex; flex-direction: column; gap: 4px; }
        .appeared-cell span { color: white; font-size: 0.7rem; font-weight: 900; }
        .appeared-cell small { color: var(--text-muted); font-size: 0.55rem; font-weight: 900; }

        .strategy-badge.sauce {
            color: oklch(0.85 0.25 200);
            background: oklch(0.85 0.25 200 / 0.1);
            border-color: oklch(0.85 0.25 200 / 0.3);
        }

        .profit-val { font-size: 1rem; font-weight: 1000; display: block; }
        .profit-val.pos { color: var(--accent-emerald); }
        .profit-val.neg { color: var(--accent-rose); }
        .time-val { font-size: 0.65rem; color: var(--text-muted); font-weight: 800; }

        .evaluation-pill {
            display: inline-flex;
            margin-top: 5px;
            padding: 3px 6px;
            border-radius: 999px;
            font-size: 0.52rem;
            font-weight: 1000;
            line-height: 1.2;
            max-width: 150px;
            text-align: left;
        }

        .evaluation-pill.watching {
            color: oklch(0.82 0.18 95);
            background: oklch(0.82 0.18 95 / 0.12);
            border: 1px solid oklch(0.82 0.18 95 / 0.22);
        }

        .evaluation-pill.continue {
            color: var(--accent-emerald);
            background: oklch(0.7 0.2 150 / 0.12);
            border: 1px solid oklch(0.7 0.2 150 / 0.24);
        }

        .evaluation-pill.failed {
            color: var(--accent-rose);
            background: oklch(0.6 0.2 25 / 0.14);
            border: 1px solid oklch(0.6 0.2 25 / 0.25);
        }

        .sparkline-container { width: 110px; min-height: 42px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .sparkline-container svg { width: 100px; height: 30px; }
        .sparkline-path { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
        .sparkline-path.pos { stroke: var(--accent-emerald); filter: drop-shadow(0 0 4px oklch(0.7 0.2 150 / 0.4)); }
        .sparkline-path.neg { stroke: var(--accent-rose); filter: drop-shadow(0 0 4px oklch(0.6 0.2 25 / 0.4)); }
        .sparkline-caption { color: var(--text-muted); font-size: 0.5rem; font-weight: 1000; text-transform: uppercase; }
        .sparkline-caption.naik { color: var(--accent-emerald); }
        .sparkline-caption.turun { color: var(--accent-rose); }

        .analyze-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: oklch(0.2 0.02 240);
            border: 1px solid var(--border-tactical);
            color: white;
            font-size: 0.65rem;
            font-weight: 900;
            border-radius: 4px;
            text-decoration: none;
            transition: all 0.2s;
        }

        .analyze-link:hover {
            background: white;
            color: black;
            border-color: white;
        }

        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .text-emerald { color: var(--accent-emerald); }
        .text-rose { color: var(--accent-rose); }
        .weight-700 { font-weight: 700; }

        @keyframes scan { from { left: -100%; } to { left: 100%; } }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } }
        @keyframes slide-in { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        /* RESPONSIVE */
        @media (max-width: 1024px) {
            .screener-header { flex-direction: column; align-items: flex-start; gap: 24px; }
            .controls-group { width: 100%; align-items: stretch; }
            .filters-row, .actions-row { flex-wrap: wrap; }
            .select-wrapper { flex: 1; min-width: 120px; }
            .explain-strip { grid-template-columns: 1fr; }
            .settings-grid { grid-template-columns: 1fr; }
            .hide-tablet { display: none; }
            .signals-table td, .signals-table th { padding: 12px 16px; }
            .signals-table { min-width: 980px; }
        }

        @media (max-width: 700px) {
            .screener-container { padding: 10px 0 0; gap: 14px; }
            .screener-header { gap: 14px; padding: 0 2px; }
            .header-left { min-width: 0; width: 100%; }
            .hide-mobile { display: none; }
            .ticker-name { font-size: 0.95rem; }
            .main-title { font-size: 1.35rem; margin-bottom: 8px; letter-spacing: -0.02em; }
            .page-subtitle { font-size: 0.76rem; margin-bottom: 12px; }
            .tabs-container { padding-bottom: 10px; margin-inline: -10px; padding-inline: 10px; scroll-snap-type: x proximity; }
            .tab-item { padding: 10px 12px; font-size: 0.62rem; min-height: 42px; scroll-snap-align: start; }
            .filters-row, .actions-row { display: grid; grid-template-columns: 1fr 1fr; width: 100%; gap: 8px; }
            .actions-row .scan-btn { grid-column: 1 / -1; }
            .action-btn { justify-content: center; min-height: 44px; }
            .select-wrapper { min-width: 0; }
            .viewport-header { padding: 14px 12px; align-items: flex-start; flex-direction: column; gap: 8px; }
            .header-status { align-items: flex-start; gap: 8px; flex-wrap: wrap; }
            .view-label { font-size: 0.72rem; }
            .view-helper { font-size: 0.62rem; }
            .risk-badge { font-size: 0.58rem; }
            .scan-freshness-strip { padding: 10px 12px; gap: 8px; font-size: 0.55rem; flex-wrap: nowrap; overflow-x: auto; }
            .scan-freshness-strip span { flex: 0 0 auto; }
            .explain-strip div { padding: 12px; }
            .table-responsive { overflow: visible; }
            .signals-table { min-width: 0; width: 100%; display: block; white-space: normal; }
            .signals-table thead { display: none; }
            .signals-table tbody { display: grid; gap: 10px; padding: 10px; }
            .signals-table tr.signal-row { display: grid; grid-template-columns: 1fr; border: 1px solid var(--border-tactical); border-radius: 12px; overflow: hidden; background: oklch(0.12 0.015 240); }
            .signals-table td { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 10px; align-items: start; padding: 9px 10px; border-bottom: 1px solid var(--border-tactical); text-align: left !important; }
            .signals-table td:last-child { border-bottom: none; }
            .signals-table td::before { color: var(--text-muted); font-size: 0.55rem; font-weight: 1000; letter-spacing: 0.08em; }
            .signals-table td:nth-child(1)::before { content: 'TICKER'; }
            .signals-table td:nth-child(2)::before { content: 'KATEGORI'; }
            .signals-table td:nth-child(5)::before { content: 'ENTRY'; }
            .signals-table td:nth-child(6)::before { content: 'TARGET'; }
            .signals-table td:nth-child(8)::before { content: 'DELTA'; }
            .signals-table td:nth-child(10)::before { content: 'CHART'; }
            .strategy-badge { max-width: 100%; overflow-wrap: anywhere; }
            .ticker-metadata { gap: 6px; }
            .analyze-link { min-height: 40px; justify-content: center; }
            .profit-val { font-size: 0.9rem; }
            .loading-container { padding: 48px 16px; }
            .scanner-glow { width: min(240px, 80vw); }
        }

        @media (max-width: 420px) {
            .filters-row, .actions-row { grid-template-columns: 1fr; }
            .signals-table td { grid-template-columns: 72px minmax(0, 1fr); }
        }

        .custom-scrollbar::-webkit-scrollbar { height: 4px; width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-tactical); border-radius: 10px; }
      `}</style>
    </div>
  );
}
