"use client";
import React, { useEffect, useRef } from "react";
import { 
  createChart, 
  ColorType, 
  CrosshairMode, 
  IChartApi, 
  UTCTimestamp,
  LineWidth,
  LogicalRange,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  createSeriesMarkers
} from "lightweight-charts";

interface AdvancedChartProps {
  data: any[];
  pivots: any;
  ticker: string;
  onLogicalRangeChange?: (range: LogicalRange | null) => void;
  syncLogicalRange?: LogicalRange | null;
  showSuperTrend?: boolean;
  showBB?: boolean;
  showMFI?: boolean;
  showVWAP?: boolean;
  showOBV?: boolean;
  showCMF?: boolean;
  chartType?: 'candle' | 'line';
  showEMA10?: boolean;
  showEMA20?: boolean;
  showEMA50?: boolean;
  showEMA200?: boolean;
  showUndercutBounce?: boolean;
  showSqueezeDeluxe?: boolean;
}

export default function AdvancedChart({ 
  data, 
  pivots, 
  ticker, 
  onLogicalRangeChange,
  syncLogicalRange,
  showSuperTrend = false,
  showBB = false,
  showMFI = false,
  showVWAP = false,
  showOBV = false,
  showCMF = false,
  chartType = 'candle',
  showEMA10 = false,
  showEMA20 = true,
  showEMA50 = true,
  showEMA200 = true,
  showUndercutBounce = false,
  showSqueezeDeluxe = false
}: AdvancedChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (!chartContainerRef.current || data.length === 0) return;

    const bgColor = "#0a0a0a";
    const textColor = "#d1d4dc";
    const gridColor = "rgba(42, 46, 57, 0.1)";

    // Clear container
    chartContainerRef.current.innerHTML = '';

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: bgColor }, textColor: textColor },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { 
        borderColor: "rgba(197, 203, 206, 0.2)", 
        timeVisible: true, 
        secondsVisible: false, 
        rightOffset: 15,
        barSpacing: 12
      },
      width: chartContainerRef.current.clientWidth,
      height: window.innerWidth < 768 ? 400 : 600,
    });

    chartRef.current = chart;

    if (onLogicalRangeChange) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(onLogicalRangeChange);
    }

    // --- 1. VOLUME ---
    const volumeSeries = chart.addSeries(HistogramSeries, { 
      color: "#26a69a", priceFormat: { type: "volume" }, priceScaleId: "volume" 
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volumeSeries.setData(data.map(d => ({
      time: d.time as UTCTimestamp,
      value: d.volume,
      color: d.close >= d.open ? "rgba(38, 166, 154, 0.2)" : "rgba(239, 83, 80, 0.2)"
    })));

    // --- 2. MAIN SERIES (CANDLE / LINE) ---
    const mainSeries = chartType === 'candle' 
        ? chart.addSeries(CandlestickSeries, {
            upColor: "#26a69a", downColor: "#ef5350", borderVisible: false,
            wickUpColor: "#26a69a", wickDownColor: "#ef5350",
        })
        : chart.addSeries(LineSeries, {
            color: "rgba(255, 255, 255, 0.8)", lineWidth: 2 as LineWidth,
            lastValueVisible: true, priceLineVisible: true, title: "Price"
        });

    if (chartType === 'candle') {
        mainSeries.setData(data.map(d => ({
            time: d.time as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close,
        })));
    } else {
        (mainSeries as any).setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.close })));
    }

    // --- 2.1 MARKERS (BOUNCE & DIVERGENCE) ---
    if (showUndercutBounce || showSqueezeDeluxe) {
        const markers: any[] = [];
        
        if (showUndercutBounce) {
            data.filter(d => d.isUndercutBounce || d.isEliteBounce).forEach(d => {
                markers.push({
                    time: d.time as UTCTimestamp,
                    position: 'belowBar',
                    color: d.isEliteBounce ? 'rgba(255, 215, 0, 1)' : 'rgba(130, 255, 160, 1)',
                    shape: 'arrowUp',
                    text: d.isEliteBounce ? `ELITE ${d.convictionScore}%` : `BOUNCE ${d.convictionScore}%`,
                });
            });
        }
        
        if (showSqueezeDeluxe) {
            data.filter(d => d.squeezeDeluxe?.isBullDiv).forEach(d => {
                markers.push({
                    time: d.time as UTCTimestamp,
                    position: 'belowBar',
                    color: '#ffa600',
                    shape: 'arrowUp',
                    text: 'D▴',
                });
            });
        }
        
        // Sort markers by time to avoid render issues
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        createSeriesMarkers(mainSeries, markers);
    }

    // --- 3. EMAs ---
    const sanitizeData = (arr: any[], key: string) => 
        arr.map(d => ({ time: d.time as UTCTimestamp, value: d[key] }))
           .filter(v => v.value !== undefined && v.value !== null && !isNaN(v.value));

    if (showEMA10) {
        chart.addSeries(LineSeries, { color: "rgba(130, 255, 160, 0.5)", lineWidth: 1.5 as LineWidth, title: "EMA 10", lastValueVisible: false, priceLineVisible: false })
             .setData(sanitizeData(data, 'ema10'));
    }
    if (showEMA20) {
        chart.addSeries(LineSeries, { color: "#2962FF", lineWidth: 1.5 as LineWidth, title: "EMA 20", lastValueVisible: false, priceLineVisible: false })
             .setData(sanitizeData(data, 'ema20'));
    }
    if (showEMA50) {
        chart.addSeries(LineSeries, { color: "#FF6D00", lineWidth: 1.5 as LineWidth, title: "EMA 50", lastValueVisible: false, priceLineVisible: false })
             .setData(sanitizeData(data, 'ema50'));
    }
    if (showEMA200) {
        chart.addSeries(LineSeries, { color: "rgba(255, 235, 59, 0.5)", lineWidth: 1.5 as LineWidth, title: "EMA 200", lastValueVisible: false, priceLineVisible: false, lineStyle: 2 })
             .setData(sanitizeData(data, 'ema200'));
    }

    // --- 4. SUPERTREND ---
    if (showSuperTrend) {
        const stSeries = chart.addSeries(LineSeries, { lineWidth: 2 as LineWidth, lastValueVisible: false, priceLineVisible: false, title: "SuperTrend" });
        stSeries.setData(data.map(d => ({
            time: d.time as UTCTimestamp, value: d.superTrend?.value,
            color: d.superTrend?.direction === 1 ? "rgba(34, 197, 94, 0.8)" : "rgba(239, 68, 68, 0.8)"
        })).filter(v => v.value !== undefined && v.value !== null && !isNaN(v.value)));
    }

    // --- 5. BOLLINGER BANDS ---
    if (showBB) {
        chart.addSeries(LineSeries, { lineWidth: 1 as LineWidth, lastValueVisible: false, priceLineVisible: false, color: "rgba(41, 98, 255, 0.3)", title: "BB Upper" })
             .setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.bb?.upper })).filter(v => !!v.value));
        chart.addSeries(LineSeries, { lineWidth: 1 as LineWidth, lastValueVisible: false, priceLineVisible: false, color: "rgba(41, 98, 255, 0.3)", title: "BB Lower" })
             .setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.bb?.lower })).filter(v => !!v.value));
        
        const bbBack = chart.addSeries(AreaSeries, { topColor: "rgba(41, 98, 255, 0.03)", bottomColor: "rgba(41, 98, 255, 0.03)", lineVisible: false, lastValueVisible: false, priceLineVisible: false });
        bbBack.setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.bb?.upper, baseValue: d.bb?.lower })).filter(v => !!v.value));
    }

    // --- 6. VOLUME OSCILLATORS ---
    if (showMFI) {
        const mfiSeries = chart.addSeries(AreaSeries, {
            topColor: "rgba(255, 235, 59, 0.1)", bottomColor: "rgba(255, 235, 59, 0)",
            lineColor: "rgba(255, 235, 59, 0.4)", lineWidth: 1 as LineWidth, title: "MFI", priceScaleId: "mfi",
            lastValueVisible: false, priceLineVisible: false,
        });
        chart.priceScale("mfi").applyOptions({ scaleMargins: { top: 0.80, bottom: 0.05 } });
        mfiSeries.setData(sanitizeData(data, 'mfi'));
    }

    if (showOBV) {
        const obvSeries = chart.addSeries(LineSeries, {
            color: "rgba(33, 150, 243, 0.6)", lineWidth: 1 as LineWidth, title: "OBV", priceScaleId: "obv",
            lastValueVisible: false, priceLineVisible: false,
        });
        chart.priceScale("obv").applyOptions({ scaleMargins: { top: 0.70, bottom: 0.15 } });
        obvSeries.setData(sanitizeData(data, 'obv'));
    }

    if (showCMF) {
        const cmfSeries = chart.addSeries(HistogramSeries, {
            color: "rgba(156, 39, 176, 0.4)", title: "CMF", priceScaleId: "cmf",
            lastValueVisible: false, priceLineVisible: false,
        });
        chart.priceScale("cmf").applyOptions({ scaleMargins: { top: 0.60, bottom: 0.25 } });
        cmfSeries.setData(data.map(d => ({ 
          time: d.time as UTCTimestamp, 
          value: d.cmf, 
          color: d.cmf >= 0 ? "rgba(38, 166, 154, 0.4)" : "rgba(239, 83, 80, 0.4)"
        })).filter(v => v.value !== undefined && !isNaN(v.value)));
    }

    if (showVWAP) {
        chart.addSeries(LineSeries, { 
            color: "rgba(255, 255, 255, 0.5)", 
            lineWidth: 1 as LineWidth, 
            lineStyle: 1,
            title: "VWAP", 
            lastValueVisible: false, 
            priceLineVisible: false 
        }).setData(sanitizeData(data, 'vwap'));
    }

    // --- 7. PIVOTS ---
    if (pivots && data.length > 20) {
      const lastTime = data[data.length - 1].time;
      const startTime = data[data.length - 20].time;
      const drawPivot = (val: number, color: string, title: string) => {
        const series = chart.addSeries(LineSeries, { color, lineWidth: 1 as LineWidth, title, lineStyle: 3, lastValueVisible: true, priceLineVisible: false });
        series.setData([{ time: startTime as UTCTimestamp, value: val }, { time: lastTime as UTCTimestamp, value: val }]);
      };
      drawPivot(pivots.p, "rgba(255,255,255,0.15)", "P");
      drawPivot(pivots.r1, "rgba(34, 197, 94, 0.15)", "R1");
      drawPivot(pivots.s1, "rgba(239, 68, 68, 0.15)", "S1");
    }

    const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      isMounted.current = false;
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
          try {
              chartRef.current.remove();
          } catch {
              // ignore
          }
          chartRef.current = null;
      }
    };
  }, [data, ticker, chartType, showEMA10, showEMA20, showEMA50, showEMA200, showUndercutBounce, showSqueezeDeluxe, showSuperTrend, showBB, showMFI, showVWAP, showOBV, showCMF, onLogicalRangeChange, pivots]);

  useEffect(() => {
    if (isMounted.current && chartRef.current && syncLogicalRange) {
        try {
            chartRef.current.timeScale().setVisibleLogicalRange(syncLogicalRange);
        } catch {
            // ignore
        }
    }
  }, [syncLogicalRange]);

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>TECHNICAL ANALYSIS: {ticker}</span>
        <div className="mobile-hide" style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
          {showEMA20 && <span style={{ color: '#2962FF' }}>● EMA 20</span>}
          {showEMA50 && <span style={{ color: '#FF6D00' }}>● EMA 50</span>}
          {showEMA200 && <span style={{ color: '#FFEB3B' }}>● EMA 200</span>}
        </div>
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', height: '600px' }} />
    </div>
  );
}
