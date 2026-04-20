# MEMORY: ULTIMATE SCREENER AI ANALYSIS

## Project Context
The "Ultimate Screener" is a terminal-inspired financial dashboard (Bloomberg-lite) running at `https://ultimate-screener.ebite.biz.id/`.
The goal of the new phase is to integrate Google Gemini AI to analyze stocks that have recently surged >20%, identify patterns, and use these patterns to build customized screeners.

## AI Analysis Plan (Agreed Upon)
1.  **Data Fetching:** When a stock spikes >20%, fetch historical candlestick data (min 200 candles) for 1d, 4h, and 15m timeframes.
2.  **Local Calculation (Accuracy):** Calculate technical indicators (RSI, MACD, MFI, MAs, Volume Spike, ATR) locally on the server using `technicalindicators` library to ensure mathematical precision and avoid AI hallucinations.
3.  **AI Prompting (Cost Efficiency):** Convert the calculated technicals for only the last 2 days into a strict, concise JSON structure. Feed this JSON to the Gemini API.
4.  **Meta-Analysis:** Run a background Cron Job to analyze all individual AI verdicts and extract common technical parameters (e.g., "MFI > 80 AND MA20 Crossover").
5.  **Screener Generation:** Use the extracted parameters from the Meta-Analysis to create actionable, automatic screeners for the user.

## Current State & Action Items
- [x] Initial plan and architecture finalized.
- [x] Installed `technicalindicators` for precise local math calculations.
- [x] `MEMORY.md` created to track progress.
- [x] **Resolved:** PostgreSQL database connection (`cerita_saham`) is now accessible via `pg` library. Password updated for local access.
- [x] Create Database Schema (Target: PostgreSQL). Created tables `ai_top_gainers_analysis` and `ai_meta_summary`.
- [ ] Implement API Route / Cron Job logic.
- [ ] Integrate Gemini API.
- [ ] Build `/ai-analyze` and `/summary` UI.
