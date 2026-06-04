'use client';

import { useState, useEffect } from 'react';
import AdvancedChart from '@/components/AdvancedChart';

// Market session detection
function getCurrentSession() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  if (utcHour >= 0 && utcHour < 8) {
    return { name: 'Asian', color: 'from-blue-500 to-cyan-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' };
  } else if (utcHour >= 8 && utcHour < 16) {
    return { name: 'London', color: 'from-purple-500 to-pink-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' };
  } else {
    return { name: 'New York', color: 'from-green-500 to-emerald-500', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30' };
  }
}

export default function GoldPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState('1h');
  const [currentSession, setCurrentSession] = useState(getCurrentSession());
  
  // Chart indicator toggles
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA60, setShowEMA60] = useState(true);
  const [showEMA200, setShowEMA200] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showAO, setShowAO] = useState(true);
  const [showSqueezeDeluxe, setShowSqueezeDeluxe] = useState(true);
  const [showMFI, setShowMFI] = useState(false);
  const [showBollingerBands, setShowBollingerBands] = useState(false);
  const [showATR, setShowATR] = useState(false);
  const [showStochastic, setShowStochastic] = useState(false);
  const [showADX, setShowADX] = useState(false);
  const [showParabolicSAR, setShowParabolicSAR] = useState(false);

  const symbol = 'GC=F'; // Gold Futures
  const displayTicker = 'XAU/USD';

  useEffect(() => {
    loadGoldData();
    
    // Update session every minute
    const sessionInterval = setInterval(() => {
      setCurrentSession(getCurrentSession());
    }, 60000) as unknown as number;
    
    return () => clearInterval(sessionInterval);
  }, [interval]);

  async function loadGoldData() {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/technical?symbol=${symbol}&interval=${interval}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error loading gold data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  const timeframes = [
    { value: '1m', label: 'M1', group: 'Scalping' },
    { value: '5m', label: 'M5', group: 'Scalping' },
    { value: '15m', label: 'M15', group: 'Intraday' },
    { value: '30m', label: 'M30', group: 'Intraday' },
    { value: '1h', label: 'H1', group: 'Swing' },
    { value: '4h', label: 'H4', group: 'Swing' },
    { value: '1d', label: 'D1', group: 'Position' },
    { value: '1wk', label: 'W1', group: 'Position' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header with Session Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600">
              🥇 Gold Trading Dashboard
            </h1>
            <div className={`px-4 py-2 rounded-lg border ${currentSession.borderColor} ${currentSession.bgColor}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${currentSession.color} animate-pulse`}></div>
                <span className={`text-sm font-semibold bg-gradient-to-r ${currentSession.color} bg-clip-text text-transparent`}>
                  {currentSession.name} Session
                </span>
              </div>
            </div>
          </div>
          <p className="text-slate-400">
            XAU/USD Technical Analysis with Multi-Timeframe Divergence Detection
          </p>
        </div>

        {/* Timeframe Selector - Grouped */}
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {['Scalping', 'Intraday', 'Swing', 'Position'].map((group) => (
              <div key={group} className="bg-slate-900/50 rounded-lg border border-slate-800 p-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">{group}</h4>
                <div className="flex flex-wrap gap-2">
                  {timeframes.filter(tf => tf.group === group).map((tf) => (
                    <button
                      key={tf.value}
                      onClick={() => setInterval(tf.value)}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                        interval === tf.value
                          ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white shadow-lg shadow-yellow-500/30'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={loadGoldData}
            disabled={loading}
            className="mt-3 px-6 py-2 rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all disabled:opacity-50"
          >
            {loading ? '⟳ Loading...' : '↻ Refresh Data'}
          </button>
        </div>

        {/* Indicator Toggles */}
        <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Technical Indicators (TA-Lib Optimized for Gold)</h3>
          
          {/* Trend Indicators */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Trend & Moving Averages</h4>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showEMA9} onChange={(e) => setShowEMA9(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">EMA 9</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showEMA20} onChange={(e) => setShowEMA20(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">EMA 20</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showEMA60} onChange={(e) => setShowEMA60(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">EMA 60</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showEMA200} onChange={(e) => setShowEMA200(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">EMA 200</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showParabolicSAR} onChange={(e) => setShowParabolicSAR(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">Parabolic SAR</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showADX} onChange={(e) => setShowADX(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">ADX (Trend Strength)</span>
              </label>
            </div>
          </div>

          {/* Momentum Indicators */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Momentum & Oscillators</h4>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showRSI} onChange={(e) => setShowRSI(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">RSI</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showAO} onChange={(e) => setShowAO(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">AO (Accelerator)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showStochastic} onChange={(e) => setShowStochastic(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">Stochastic</span>
              </label>
            </div>
          </div>

          {/* Volatility & Volume */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Volatility & Volume</h4>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showBollingerBands} onChange={(e) => setShowBollingerBands(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">Bollinger Bands</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showATR} onChange={(e) => setShowATR(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">ATR (Volatility)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showSqueezeDeluxe} onChange={(e) => setShowSqueezeDeluxe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">Squeeze Deluxe</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showMFI} onChange={(e) => setShowMFI(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500" />
                <span className="text-sm text-slate-300">MFI (Money Flow)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg">
            <p className="text-red-400">⚠️ {error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-yellow-500 border-t-transparent mb-4"></div>
              <p className="text-slate-400">Loading gold data...</p>
            </div>
          </div>
        )}

        {/* Chart */}
        {data && data.data && data.data.length > 0 && (
          <div className="mb-8">
            <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
              <AdvancedChart
                key={`gold-${symbol}-${interval}-${showEMA9}-${showEMA20}-${showEMA60}-${showEMA200}-${showRSI}-${showAO}-${showSqueezeDeluxe}-${showMFI}`}
                data={data.data}
                pivots={data.pivots}
                ticker={displayTicker}
                chartType="candle"
                showEMA9={showEMA9}
                showEMA20={showEMA20}
                showEMA60={showEMA60}
                showEMA200={showEMA200}
                showRSI={showRSI}
                showAO={showAO}
                showSqueezeDeluxe={showSqueezeDeluxe}
                showMFI={showMFI}
              />
            </div>
          </div>
        )}

        {/* Divergence Report */}
        {data && data.divergenceReport && (
          <div className="mb-8">
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 rounded-lg border border-slate-700 p-6 shadow-xl">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 mb-4">
                📊 Divergence Analysis
              </h2>
              
              {data.divergenceReport.conviction > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Conviction Score:</span>
                    <span className={`text-2xl font-bold ${
                      data.divergenceReport.conviction >= 70 ? 'text-green-400' :
                      data.divergenceReport.conviction >= 50 ? 'text-yellow-400' :
                      'text-orange-400'
                    }`}>
                      {data.divergenceReport.conviction}%
                    </span>
                  </div>
                  
                  {data.divergenceReport.signals && data.divergenceReport.signals.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-slate-400 uppercase">Active Signals</h3>
                      {data.divergenceReport.signals.map((signal: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2 text-slate-300">
                          <span className="text-yellow-500">•</span>
                          <span>{signal}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {data.divergenceReport.marketStructure && (
                    <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">
                      <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Market Structure</h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Quality:</span>
                          <span className={`font-semibold ${
                            data.divergenceReport.marketStructure.quality === 'Strong' ? 'text-green-400' :
                            data.divergenceReport.marketStructure.quality === 'Good' ? 'text-yellow-400' :
                            'text-orange-400'
                          }`}>
                            {data.divergenceReport.marketStructure.quality}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Score:</span>
                          <span className="text-slate-300 font-semibold">{data.divergenceReport.marketStructure.score}/100</span>
                        </div>
                        {data.divergenceReport.marketStructure.details && (
                          <p className="text-slate-300 text-sm mt-2">{data.divergenceReport.marketStructure.details}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-400 text-lg">⚠️ No significant signals detected</p>
                  <p className="text-slate-500 text-sm mt-2">Waiting for market structure, EMA bounce, or divergence patterns</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Session-Specific Analysis */}
        <div className="mb-8">
          <div className={`bg-gradient-to-br from-slate-900/90 to-slate-800/90 rounded-lg border ${currentSession.borderColor} p-6 shadow-xl`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${currentSession.color} animate-pulse`}></div>
              <h2 className={`text-2xl font-bold bg-gradient-to-r ${currentSession.color} bg-clip-text text-transparent`}>
                {currentSession.name} Session Analysis
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 rounded-lg ${currentSession.bgColor} border ${currentSession.borderColor}`}>
                <h4 className="text-sm font-semibold text-slate-400 uppercase mb-2">Session Characteristics</h4>
                <ul className="space-y-1 text-sm text-slate-300">
                  {currentSession.name === 'Asian' && (
                    <>
                      <li>• Lower volatility, range-bound</li>
                      <li>• Tokyo/Hong Kong/Singapore markets</li>
                      <li>• Best for: Scalping, range trading</li>
                      <li>• Watch: Asian economic data</li>
                    </>
                  )}
                  {currentSession.name === 'London' && (
                    <>
                      <li>• Highest liquidity & volatility</li>
                      <li>• Major breakouts often occur</li>
                      <li>• Best for: Trend following, breakouts</li>
                      <li>• Watch: EUR/GBP data, ECB policy</li>
                    </>
                  )}
                  {currentSession.name === 'New York' && (
                    <>
                      <li>• High volatility, USD-driven moves</li>
                      <li>• Overlaps with London (peak activity)</li>
                      <li>• Best for: News trading, momentum</li>
                      <li>• Watch: US data, Fed speakers, yields</li>
                    </>
                  )}
                </ul>
              </div>
              
              <div className={`p-4 rounded-lg ${currentSession.bgColor} border ${currentSession.borderColor}`}>
                <h4 className="text-sm font-semibold text-slate-400 uppercase mb-2">Typical Price Action</h4>
                <ul className="space-y-1 text-sm text-slate-300">
                  {currentSession.name === 'Asian' && (
                    <>
                      <li>• Average range: 0.3-0.5%</li>
                      <li>• Consolidation patterns common</li>
                      <li>• Respect support/resistance</li>
                      <li>• Lower false breakouts</li>
                    </>
                  )}
                  {currentSession.name === 'London' && (
                    <>
                      <li>• Average range: 0.8-1.2%</li>
                      <li>• Strong directional moves</li>
                      <li>• London Fix at 10:30 & 15:00 UTC</li>
                      <li>• Breakout opportunities</li>
                    </>
                  )}
                  {currentSession.name === 'New York' && (
                    <>
                      <li>• Average range: 0.6-1.0%</li>
                      <li>• Reversal patterns at session end</li>
                      <li>• 13:30 UTC: US data releases</li>
                      <li>• 18:00 UTC: NY close positioning</li>
                    </>
                  )}
                </ul>
              </div>
              
              <div className={`p-4 rounded-lg ${currentSession.bgColor} border ${currentSession.borderColor}`}>
                <h4 className="text-sm font-semibold text-slate-400 uppercase mb-2">Trading Strategy</h4>
                <ul className="space-y-1 text-sm text-slate-300">
                  {currentSession.name === 'Asian' && (
                    <>
                      <li>✓ Use tighter stops (lower ATR)</li>
                      <li>✓ Focus on mean reversion</li>
                      <li>✓ Fade extremes, buy dips/sell rallies</li>
                      <li>✗ Avoid chasing breakouts</li>
                    </>
                  )}
                  {currentSession.name === 'London' && (
                    <>
                      <li>✓ Trade with the trend</li>
                      <li>✓ Wider stops (higher ATR)</li>
                      <li>✓ Breakout confirmation essential</li>
                      <li>✓ Watch for London Fix volatility</li>
                    </>
                  )}
                  {currentSession.name === 'New York' && (
                    <>
                      <li>✓ News-driven strategies</li>
                      <li>✓ Quick scalps on data releases</li>
                      <li>✓ Monitor DXY correlation closely</li>
                      <li>✗ Reduce size before 18:00 UTC</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Gold Market Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">About XAU/USD</h3>
            <p className="text-slate-300 text-sm mb-3">
              Gold (XAU) priced in US Dollars (USD). Highly liquid precious metal influenced by USD strength, yields, inflation, and risk sentiment.
            </p>
            <div className="space-y-1 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Contract Size:</span>
                <span className="text-slate-300">100 oz</span>
              </div>
              <div className="flex justify-between">
                <span>Pip Value:</span>
                <span className="text-slate-300">$0.01/oz</span>
              </div>
              <div className="flex justify-between">
                <span>Typical Spread:</span>
                <span className="text-slate-300">0.20-0.40</span>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Trading Sessions</h3>
            <div className="space-y-3 text-sm">
              <div className={`p-2 rounded ${currentSession.name === 'Asian' ? currentSession.bgColor + ' border ' + currentSession.borderColor : 'bg-slate-800/30'}`}>
                <div className="flex justify-between text-slate-300">
                  <span>🌏 Asia:</span>
                  <span>00:00-09:00 UTC</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Low volatility, range-bound</p>
              </div>
              <div className={`p-2 rounded ${currentSession.name === 'London' ? currentSession.bgColor + ' border ' + currentSession.borderColor : 'bg-slate-800/30'}`}>
                <div className="flex justify-between text-slate-300">
                  <span>🇬🇧 London:</span>
                  <span>08:00-17:00 UTC</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Highest liquidity & volatility</p>
              </div>
              <div className={`p-2 rounded ${currentSession.name === 'New York' ? currentSession.bgColor + ' border ' + currentSession.borderColor : 'bg-slate-800/30'}`}>
                <div className="flex justify-between text-slate-300">
                  <span>🇺🇸 New York:</span>
                  <span>13:00-22:00 UTC</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">USD-driven, news-heavy</p>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Key Drivers & Correlations</h3>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-red-400">↓</span>
                <span><strong>US Dollar (DXY):</strong> Inverse correlation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400">↓</span>
                <span><strong>Treasury Yields:</strong> Higher yields = lower gold</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">↑</span>
                <span><strong>Inflation (CPI):</strong> Hedge against inflation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">↑</span>
                <span><strong>Risk-Off:</strong> Safe-haven demand</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">⚡</span>
                <span><strong>Fed Policy:</strong> Rate decisions impact gold</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Made with Bob
