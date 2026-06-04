# Divergence-Focused Screener Guide

## Overview

This screener has been completely refactored to focus on **divergence detection** from Squeeze Deluxe and Accelerator Oscillator (AO) indicators, with additional support for accumulation detection, market structure analysis, and EMA bounce identification.

## Key Changes

### 1. **Removed Indicators**
The following indicators have been removed to maintain a clean, minimal codebase:
- KDJ Indicator
- Vortex Indicator
- MACD (kept in trend but not used in main analysis)
- Bollinger Bands (removed from analysis logic)
- SuperTrend
- Chandelier Exit
- Keltner Channels
- All volume indicators except MFI (AD, CMF, EMV, Force Index, NVI, OBV, VPT, VWAP, CVD)

### 2. **Retained Essential Indicators**
- **EMA Lines**: 9, 20, 60, 200 (for trend and support/resistance)
- **Squeeze Deluxe**: Primary divergence detection and volatility compression
- **MFI (Money Flow Index)**: Volume-weighted momentum
- **RSI (Relative Strength Index)**: Momentum oscillator
- **AO (Accelerator Oscillator)**: NEW - Momentum acceleration/deceleration

### 3. **New Features**

#### Accelerator Oscillator (AO)
- **Location**: `app/lib/indicators/momentum/ao.ts`
- **Calculation**: AO = SMA(Median Price, 5) - SMA(Median Price, 34)
- **Divergence Detection**: Identifies bullish/bearish divergences
- **Momentum Shifts**: Detects acceleration and deceleration

#### Divergence Detection
- **Squeeze Deluxe Divergences**: Built-in divergence detection
- **AO Divergences**: Custom implementation with lookback period
- **Double Divergences**: When both Squeeze and AO show divergence simultaneously (highest conviction)

#### Accumulation Detection
- Identifies when price consolidates or drifts lower while volume indicators show buying pressure
- Monitors MFI improvement trends
- Detects volume increases during consolidation
- Checks for squeeze compression (volatility contraction)

#### Market Structure Analysis
- EMA alignment (9 > 20 > 60 for bullish structure)
- Price position relative to key EMAs
- EMA trend direction
- Quality scoring: GOOD (70+), FAIR (50-69), POOR (<50)

#### EMA Bounce Detection
- Monitors price interaction with EMA 9, 20, 60, and 200
- Identifies when price touches and bounces off EMAs
- Confirms with rising EMA trend

### 4. **Conviction Report System**

The new divergence-focused conviction report only generates when:
1. **Bullish or bearish divergence detected** (Squeeze or AO)
2. **Good market structure** identified
3. **Price bouncing off EMA line**
4. **Accumulation pattern** detected

#### Conviction Scoring (0-100%)
- **Divergence signals**: 40-60 points
  - Double divergence (Squeeze + AO): +20 bonus
- **Market structure**: 10-20 points
- **EMA bounce**: 15 points
- **Accumulation**: 15 points
- **Squeeze compression**: 10 points (if with bullish divergence)
- **RSI/MFI oversold**: 10 points (confirmation)
- **AO momentum**: 10 points (acceleration/deceleration)

#### Report Categories
- **HIGH CONVICTION BULLISH DIVERGENCE** (70%+)
- **BULLISH DIVERGENCE SETUP** (50-69%)
- **BEARISH DIVERGENCE WARNING** (60%+)
- **EMA BOUNCE WITH GOOD STRUCTURE**
- **ACCUMULATION PHASE**
- **GOOD MARKET STRUCTURE**
- **POTENTIAL SETUP FORMING**
- **NO SIGNAL** (when no conditions met)

### 5. **Supported Timeframes**

All timeframes are now supported:
- **5m** (5 minutes)
- **15m** (15 minutes)
- **1h** (1 hour)
- **2h** (2 hours) - aggregated from 1h data
- **4h** (4 hours) - aggregated from 1h data
- **1d** (daily)

### 6. **API Changes**

#### `/api/technical` Response Structure
```json
{
  "success": true,
  "data": [...], // OHLCV data with indicators
  "divergenceReport": {
    "shouldReport": true,
    "verdict": "HIGH CONVICTION BULLISH DIVERGENCE",
    "conviction": 85,
    "details": "Signal details...",
    "context": "Timeframe and indicator context...",
    "color": "oklch(0.85 0.25 150)",
    "signals": ["🔥 DOUBLE BULLISH DIVERGENCE", "✅ Good Market Structure", ...],
    "divergence": {
      "squeeze": { "bullish": true, "bearish": false },
      "ao": { "bullish": true, "bearish": false }
    },
    "marketStructure": {
      "quality": "GOOD",
      "score": 85,
      "details": "EMA alignment bullish, Price above EMA20, ..."
    },
    "emaBounce": {
      "isBouncing": true,
      "emaLine": "EMA20",
      "emaValue": 5250,
      "distancePct": 1.5,
      "details": "Price bounced off EMA20..."
    },
    "accumulation": {
      "isAccumulating": true,
      "strength": 75,
      "details": "Accumulation detected: Price -2.1% over 20 bars, MFI improving 65% of the time, volume increasing"
    },
    "indicators": {
      "rsi": 42.5,
      "mfi": 38.2,
      "ao": -0.15,
      "squeezeIntensity": 2,
      "aoAccelerating": false,
      "aoDecelerating": false
    }
  },
  "screenerContext": {...},
  "activeScreenerSignals": [...],
  "_debug": {...}
}
```

### 7. **UI Updates**

#### Search Page (`/search`)
- Updated timeframe selector to include 5m and 2h
- New divergence report panel replacing old conviction report
- Visual indicators for:
  - Detected signals with emoji icons
  - Market structure quality
  - EMA bounce details
  - Accumulation strength bar
  - Key indicator values (RSI, MFI, AO, Squeeze)

#### Chart Controls
- Simplified indicator toggles
- Focus on essential indicators only
- Removed unused indicator buttons

### 8. **Scanner Updates**

#### `scripts/pg_screener_scan.js`
- Default intervals updated to: `["1d", "4h", "2h", "1h", "15m", "5m"]`
- Scans all timeframes by default
- Reports only when divergence or other key conditions are met

## Usage

### Running the Screener

1. **Start the development server**:
   ```bash
   cd app
   npm run dev
   ```

2. **Access the search page**:
   Navigate to `http://localhost:3000/search` or `https://ultimate-screener.ebite.biz.id/search`

3. **Run a full scan**:
   ```bash
   cd app
   node scripts/pg_screener_scan.js
   ```

4. **Scan specific timeframes**:
   ```bash
   node scripts/pg_screener_scan.js --intervals=1d,4h,1h
   ```

5. **Scan limited stocks**:
   ```bash
   node scripts/pg_screener_scan.js --limit=50
   ```

### Interpreting Results

#### High Conviction Signals
Look for:
- **Double divergences** (Squeeze + AO)
- **Conviction score 70%+**
- **Good market structure**
- **Multiple confirming signals**

#### Medium Conviction Signals
- Single divergence with good structure
- EMA bounce with accumulation
- Conviction score 50-69%

#### Watch List
- Accumulation without divergence
- Good structure without clear entry
- Conviction score <50%

## Technical Details

### File Structure
```
app/
├── lib/
│   └── indicators/
│       ├── momentum/
│       │   ├── index.ts (RSI, MFI exports)
│       │   └── ao.ts (NEW - Accelerator Oscillator)
│       ├── trend/
│       │   └── index.ts (EMA, SMA, MACD)
│       └── volatility/
│           └── index.ts (Squeeze Deluxe)
├── app/
│   ├── api/
│   │   └── technical/
│   │       └── route.ts (REFACTORED - Divergence-focused)
│   └── search/
│       └── page.tsx (UPDATED - New UI)
├── scripts/
│   └── pg_screener_scan.js (UPDATED - All timeframes)
└── globals.css (UPDATED - New styles)
```

### Key Functions

#### `detectAODivergence(quotes, ao, lookback)`
Detects bullish and bearish divergences in the Accelerator Oscillator.

#### `detectAccumulation(quotes, lookback)`
Identifies accumulation patterns based on price action, MFI, volume, and squeeze state.

#### `detectEmaBounce(quotes)`
Checks if price is bouncing off any EMA line (9, 20, 60, 200).

#### `assessMarketStructure(quotes)`
Evaluates market structure quality based on EMA alignment and trends.

#### `generateDivergenceReport(quotes, timeframe)`
Main function that generates the conviction report based on all detected signals.

## Best Practices

1. **Wait for confirmation**: Don't act on divergence alone; look for multiple confirming signals
2. **Check market structure**: Good structure increases probability of success
3. **Use proper risk management**: Always set stop losses based on the report
4. **Monitor multiple timeframes**: Higher timeframe divergences are more reliable
5. **Combine with volume**: Accumulation detection adds conviction to divergence signals

## Troubleshooting

### No signals appearing
- Check if market structure is poor
- Verify that divergences are actually present in the data
- Ensure timeframe has enough historical data

### Server errors
- Check that all dependencies are installed: `npm install`
- Verify PostgreSQL is running (if using database features)
- Check API logs for specific errors

### Chart not updating
- Clear browser cache
- Check network tab for API errors
- Verify symbol format (e.g., "BBCA.JK" for Indonesian stocks)

## Future Enhancements

Potential additions (not implemented):
- Volume profile analysis
- Order flow divergences
- Multi-timeframe divergence confluence
- Automated alert system
- Backtesting framework

## Support

For issues or questions:
1. Check the console logs for errors
2. Review the API response in browser DevTools
3. Verify indicator calculations are producing valid numbers
4. Test with known divergence examples

---

**Last Updated**: 2026-06-04
**Version**: 2.0.0 (Divergence-Focused Refactor)