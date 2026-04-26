# MEMORY: ULTIMATE SCREENER AI ANALYSIS

## Project Context
The "Ultimate Screener" is a terminal-inspired financial dashboard (Bloomberg-lite) running at `https://ultimate-screener.ebite.biz.id/`.
The current AI goal is not just to describe top gainers, but to learn the pre-breakout behavior that repeatedly appears before a stock enters the daily top gainers list and convert that behavior into a self-improving screener called `Secret Sauce`.

## Agreed Product Direction
1. Learn from daily top gainers instead of static heuristics.
2. Focus on what happened in the previous `1-10` candles before the breakout day.
3. Extract repeatable technical patterns from those pre-breakout candles.
4. Turn the patterns into a versioned `Secret Sauce` formula.
5. Run the latest `Secret Sauce` formula against the active IDX universe each day.
6. Backtest the resulting candidates automatically.
7. If the winrate degrades, improve the next formula version using the latest top-gainer samples.

## Pre-Breakout Features To Learn
The AI/quant pipeline should prioritize what happens before the breakout candle, not only on the breakout candle itself.

- Candle-range compression across the previous `3-10` candles
- ATR contraction before expansion
- Distance to `EMA20` and whether price is coiling near it
- Volume build-up and relative-volume acceleration
- RSI slope and RSI zone before breakout
- MFI / money-flow accumulation behavior
- MACD histogram improvement or momentum turn
- Close-near-high behavior in the last few candles
- Higher-low / base building structure
- Failed breakdown or shakeout followed by recovery

## Daily Learning Loop
1. `collect_top_gainers`
   Capture the day’s strongest winners.
2. `extract_pre_breakout_features`
   Store the `T-10` to `T-1` window before each breakout.
3. `generate_secret_sauce_version`
   Build a new or improved formula from historical winners and the latest backtest summary.
4. `run_secret_sauce_screener`
   Apply the latest formula to the whole active universe.
5. `backtest_secret_sauce_runs`
   Score the candidates after a holding window.
6. `improve_formula_if_needed`
   If winrate is weak, tighten or shift the next formula using the latest top-gainer patterns.

## Database Direction
PostgreSQL remains the best place for AI research tables, versioning, and backtest history.
MongoDB remains the operational store for the stock universe and screener outputs already used by the app.

Core AI research tables should cover:
- breakout/top-gainer analyses
- historical pre-breakout samples
- versioned Secret Sauce formulas
- daily Secret Sauce candidate runs
- backtest results and formula performance summaries

## Current State
- [x] Initial AI direction established.
- [x] Installed `technicalindicators` for local indicator math.
- [x] MongoDB connectivity fixed for the app runtime.
- [x] Local PostgreSQL runtime available for AI research tables.
- [x] Base tables `ai_top_gainers_analysis` and `ai_meta_summary` created.
- [x] `/api/ai-summary`, `/api/ai-analysis`, and `/api/ai-candidates` no longer fail due to PostgreSQL auth.
- [x] **Secret Sauce v2**: SMA50 trend filter, ATR compression, 3-day volume buildup, higher-low structure, candle quality, RSI guard (45-68), MACD histogram improving.
- [x] **EMA Bounce v2**: Volume threshold 1.0x (was 0.7x), candle quality filter, RSI guard (40-65), close-above-prev-high detection, SMA50 mandatory.
- [x] **Elite Bounce v2**: RSI guard (40-68), squeeze+bounce confluence detection (`isSqueezeBounce`), conviction score enhanced.
- [x] **Pipeline fix**: `run_secret_sauce_screener.js` now writes to MongoDB `stocksignals` alongside PostgreSQL, so dynamic Secret Sauce results appear in web UI.
- [x] **Sync screener**: SMA50 filter for downtrend exclusion, squeeze+bounce detection routed as ELITE BOUNCE with 130 extra score.
- [x] **Formula defaults tightened**: minRvol 1.3, minMfi 50, maxCompressionPct 4.0, minCloseNearHighPct 65, maxDistEma20Pct 5.
- [x] **Walk-forward**: `matchesFormula` now checks `isAboveSma50`.
- [x] **Dynamic Elliott Wave Projection**: 
  - Chart `waveMarkers` dynamically assign W0-W3 (Bullish) or 1-5 (Bearish) to ZigZag ensuring projection points accurately extend the wave. 
  - W4 & Wave A aggressively target absolute Fib retracements iteratively below `lastPrice`. 
  - W5 geometric calculation fixed: `W5Target = w4Price + diff * 0.618` instead of an absolute 1.618 overhead extension. 
  - Textual Conviction Report is synced with charting logic to display strictly matching dynamic Fibo levels and Target prices.
- [x] **Squeeze Deluxe parity**: EliCobra formula aligned for momentum, squeeze thresholds, DFO/overflux, bullish/bearish divergence markers, and shared scanner helper usage.
- [x] **Conviction Report execution plan**: `/search` now combines Squeeze Deluxe with 20 EMA pullback/reclaim rules to output BUY, SELL/REDUCE, or WAIT AND SEE with entry zone, stop, target, invalidation, and wait reasons.
- [x] **EMA crossover confirmation**: `/search` now calculates/displays EMA9 and EMA60; Conviction Report uses EMA9/20 for fast timing and EMA20/60 for swing trend confirmation.
- [ ] Persist `1-10` candle pre-breakout features in a structured form.
- [ ] Store versioned `Secret Sauce` formulas and their performance.
- [ ] Run the screener from the latest formula instead of hardcoded rules.
- [ ] Score daily candidates and feed results back into the next formula version.

## Implementation Notes
- Keep local indicator math deterministic and cheap.
- Use Gemini only where synthesis or explanation adds value; formula generation must still have a rule-based fallback.
- The first production-ready loop should be able to operate even if Gemini is unavailable.

## Next Manual Review Step
1. Send the contents of `artifacts/secret-sauce-review/walkforward-ai-review-prompt.txt` together with the latest walk-forward review JSON file to the AI reviewer.
2. Save the AI response to:
   `C:\reandy\ultimate-screener\app\artifacts\secret-sauce-review\manual-revision-walkforward.json`
3. Apply the revision with:
   `npm run secret-sauce:apply-revision -- "artifacts/secret-sauce-review/manual-revision-walkforward.json"`
4. After the AI response is available, continue by applying the revision and running the next Secret Sauce screener version.
