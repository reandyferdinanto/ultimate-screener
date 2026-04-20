# AI Analysis & Top Gainer Tracking Plan

## 1. Goal
Automatically track stocks that have surged >20% over the last 2 days, calculate their technical indicators (1d, 4h, 15m), and use Google Gemini AI to analyze them individually and collectively to find the "secret sauce" of their breakouts. The ultimate goal is to use these insights to create custom screeners.

## 2. Architecture & Data Flow
1. **Market Data Source:** We need a reliable API to fetch historical candles (1d, 4h, 15m). *Suggestion: `yahoo-finance2` (Free) or Polygon.io (Paid).* Google Gemini cannot fetch real-time market data itself; it needs the data fed to it.
2. **Technical Calculation Engine:** Calculate RSI, MACD, MFI, Support/Resistance levels, and Moving Averages (EMA 20, SMA 50, SMA 200).
3. **Database Storage:** Store the raw technical data and the AI's analysis for each stock in the database (looks like we have PostgreSQL/Mongoose setup).
4. **AI Processing (Gemini API):**
   - **Individual Analysis:** Feed the calculated technicals for a single stock into Gemini. Ask it to identify why it spiked (e.g., "High volume breakout above MA200 with bullish divergence on MACD 4H").
   - **Meta-Analysis (Summary):** Feed the data of *all* recent top gainers into Gemini. Ask it to find commonalities (e.g., "80% of these stocks had an MFI > 80 on the 15m timeframe before the daily breakout").
5. **Automation (Cron Job):** Set up a Vercel Cron job (or `node-cron`) to run the scanner, calculate technicals, call Gemini, and save to DB automatically.

## 3. UI/UX Implementation (Terminal Aesthetic)
- **`/ai-analyze` (New Menu):** A high-density data table listing all stocks >20%. Columns: Ticker, Spike %, Volume Multiple, Key Indicator State, and a short "AI Verdict". Clicking a row expands the full technical breakdown.
- **`/summary` (New Menu):** A dashboard displaying the "Meta-Analysis". It will show the common patterns found among the top gainers, essentially revealing the "anatomy of a 20%+ runner".

## 4. Suggestions & Enhancements
- **Strict JSON Output from AI:** We should force Gemini to reply in strict JSON format. This allows us to render the analysis beautifully in our UI (green for bullish signals, red for bearish) instead of a messy wall of text.
- **Actionable Screener Parameters:** The "Summary" AI prompt must be engineered to output *quantifiable* conditions. For example, instead of saying "The RSI was high," it should output `"condition": "RSI_4H > 70"`. This makes it possible to automatically generate a new Screener based on the AI's findings later.
- **Volume Profiling:** Besides standard indicators, calculating the "Relative Volume" (Volume today vs Average 10-day Volume) is the #1 predictor of a >20% move. We should prioritize this metric before feeding data to the AI.
