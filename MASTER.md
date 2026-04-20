# MASTER DESIGN SYSTEM: ULTIMATE SCREENER

## 1. Vision
Terminal-inspired financial intelligence dashboard. Clean, high-contrast, high-density, yet legible. Boutique "Bloomberg-lite" aesthetic.

## 2. Color Palette (OKLCH)
- **Background Main:** `oklch(0.12 0 0)` (Deep Black-Gray)
- **Background Panel:** `oklch(0.18 0 0)` (Slightly lighter gray)
- **Border:** `oklch(0.28 0 0)` (Subtle separation)
- **Text Primary:** `oklch(0.98 0 0)` (Pure White)
- **Text Secondary:** `oklch(0.70 0 0)` (Dimmed Gray)
- **Accent Green (Bullish):** `oklch(0.82 0.18 145)` (Vibrant Mint)
- **Accent Red (Bearish):** `oklch(0.62 0.22 25)` (Punchy Coral/Red)
- **Accent Amber (Warning):** `oklch(0.85 0.15 80)` (Golden)
- **Selection/Hover:** `oklch(0.25 0 0)`

## 3. Typography
- **Primary Font:** 'Fira Code', monospace (Terminal feel)
- **Headers:** Uppercase, letter-spacing `0.05em`
- **Density:** High density, small font-size (13px default, 12px for meta)

## 4. Spacing & Elevation
- **Grid:** 8px base unit
- **Radius:** 0px (Sharp edges for technical feel)
- **Elevation:** No shadows, only borders and subtle inner glows for accents.

## 5. Components
- **Panels:** Solid background, 1px border.
- **Buttons:** Outline by default, solid on hover. Micro-glow on active states.
- **Inputs:** Clean box, green focus border.

## 6. Mobile Strategy
- Stack all sidebars.
- Implement horizontal scrolling for tables with a fade indicator.
- Reduce padding to 8px-12px.
- Use a hamburger menu or scrollable nav if links exceed 3.
