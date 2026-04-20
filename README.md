# Ultimate Screener

Terminal-inspired financial intelligence dashboard (Bloomberg-lite) for Indonesian Stock Exchange (IDX).

## Features
- **Real-time Technical Analysis:** Advanced indicators including Squeeze Momentum Deluxe, Elliott Wave, and Pivot Points.
- **AI Stock Analysis:** Integration with Google Gemini to analyze >20% price spikes and identify common patterns.
- **Custom Screeners:** Automatic scanners for "Secret Sauce", "ARA Hunter", and "EMA Bounce" strategies.
- **Telegram Bot:** Interactive bot for on-demand stock analysis and automated alerts.

## Tech Stack
- **Frontend:** Next.js (React 19), Tailwind CSS, Lightweight Charts.
- **Backend:** Next.js API Routes (Node.js).
- **Database:** PostgreSQL (Primary for AI Analysis) & MongoDB (Legacy/Settings).
- **AI:** Google Gemini API.
- **Data Source:** Yahoo Finance.

## Local Installation

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL
- MongoDB (Optional if using default cloud URI)

### 2. Clone and Install
```bash
git clone <repository-url>
cd ultimate-screener
npm install
```

### 3. Environment Variables
Create a `.env.local` file in the root directory:
```env
MONGODB_URI=your_mongodb_connection_string
AI_DATABASE_URL=postgresql://user:password@localhost:5432/db_name
GEMINI_API_KEY=your_gemini_api_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token (or set in DB)
```

### 4. Database Setup
Initialize the PostgreSQL tables:
```bash
node scripts/init_pg_db.js
```

### 5. Run the Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Running the Bot & Scanners

### Telegram Bot
The bot handles interactive commands like `/analyze <ticker>` and `/top`.
```bash
node scripts/telegram_bot.js
```

### Daily Screener
Runs the main strategy scanner (Secret Sauce, Squeeze Release):
```bash
node scripts/scan.js
```

### AI Meta-Analysis (Cron)
Analyzes spikes and extracts patterns:
```bash
npx ts-node scripts/ai_screener_cron.ts
```

### Real-time Alerts
Monitors for new signals during market hours:
```bash
node scripts/realtime_scanner.js
```

## Optimization & Performance
- **Batch Processing:** Scanners use batching to respect API rate limits.
- **Local Math:** Technical indicators are calculated locally using `technicalindicators` and `indicatorts` libraries to avoid AI hallucinations and improve speed.
- **Terminal Aesthetic:** UI is optimized for high-density information display using OKLCH colors and Fira Code font.
