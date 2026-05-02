export default function StockAnalysisPage() {
  return (
    <div className="panel scanline-container" style={{ maxWidth: 960, margin: "0 auto" }}>
      <div className="panel-header">
        <span>STOCK ANALYSIS</span>
        <span>DISABLED</span>
      </div>
      <div style={{ display: "grid", gap: 12, padding: "12px 0" }}>
        <h1 style={{ fontSize: "clamp(2rem, 7vw, 4rem)", letterSpacing: "-0.06em", textTransform: "uppercase" }}>
          Stock Analysis Is Not Ready
        </h1>
        <p style={{ color: "var(--text-secondary)", maxWidth: 680, lineHeight: 1.6 }}>
          This experimental page was disabled because its UI components and data modules are incomplete.
          Use Dashboard, Screener, Analysis, or Research while this module is rebuilt.
        </p>
      </div>
    </div>
  );
}
