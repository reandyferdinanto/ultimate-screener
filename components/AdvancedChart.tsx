"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef } from "react";
import { 
  createChart, 
  ColorType, 
  CrosshairMode, 
  IChartApi, 
  UTCTimestamp,
  LineWidth,
  LineStyle,
  LogicalRange,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  BaselineSeries,
  AreaSeries,
  createSeriesMarkers
} from "lightweight-charts";
import type { BaselineData, HistogramData, LineData, SeriesMarker, Time } from "lightweight-charts";

const asChartTime = (time: number | string) => time as Time;
const compactChartData = <T,>(values: (T | null)[]): T[] =>
  values.filter((value): value is T => value !== null);
const finiteChartNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;


interface AdvancedChartProps {
  data: any[];
  pivots: any;
  riskPlan?: any;
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
  showEMA9?: boolean;
  showEMA10?: boolean;
  showEMA20?: boolean;
  showEMA50?: boolean;
  showEMA60?: boolean;
  showEMA200?: boolean;
  showUndercutBounce?: boolean;
  showSqueezeDeluxe?: boolean;
}

export default function AdvancedChart({ 
  data, 
  pivots, 
  riskPlan,
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
  showEMA9 = false,
  showEMA10 = false,
  showEMA20 = true,
  showEMA50 = true,
  showEMA60 = false,
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

    const bgColor = "rgba(5, 8, 12, 0)";
    const textColor = "rgba(226, 232, 240, 0.82)";
    const gridColor = "rgba(148, 163, 184, 0.075)";
    const isMobile = window.innerWidth < 768;
    const compactTitle = (title: string) => {
      if (!isMobile) return title;
      const labels: Record<string, string> = {
        "Screener Entry": "ENTRY",
        "Entry": "ENTRY",
        "Entry High": "E↑",
        "Entry Low": "E↓",
        "Ideal Buy": "BUY",
        "Early Exit": "EXIT",
        "Hard Stop": "SL",
        "Target 1": "T1",
        "Target 2": "T2",
        "Pivot": "",
        "Resistance": "",
        "Support": "",
        "Chandelier Stop": "",
      };
      return labels[title] ?? title;
    };
    const hasSqueezePane = showSqueezeDeluxe;
    const macdPaneRatio = hasSqueezePane ? 0.2 : 0.26;
    const squeezePaneRatio = hasSqueezePane ? 0.22 : 0;
    const lowerGap = hasSqueezePane ? 0.03 : 0.02;
    const lowerReserved = macdPaneRatio + squeezePaneRatio + lowerGap;
    const priceBottomMargin = Math.min(0.52, lowerReserved);
    const volumeTopMargin = Math.max(0.48, 1 - priceBottomMargin - 0.08);
    const macdTopMargin = hasSqueezePane ? 1 - squeezePaneRatio - lowerGap - macdPaneRatio : 1 - macdPaneRatio;
    const macdBottomMargin = hasSqueezePane ? squeezePaneRatio + lowerGap : 0;
    const squeezeTopMargin = 1 - squeezePaneRatio;
    const chartHeight = isMobile
      ? (hasSqueezePane ? 560 : 460)
      : (hasSqueezePane ? 760 : 660);
    const rightOffsetBars = isMobile ? 30 : 50;

    // Clear container
    chartContainerRef.current.innerHTML = '';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.045)", style: LineStyle.Dotted },
        horzLines: { color: gridColor, style: LineStyle.Dotted }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: "rgba(125, 211, 252, 0.45)",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0f172a",
        },
        horzLine: {
          width: 1,
          color: "rgba(125, 211, 252, 0.45)",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0f172a",
        }
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.12)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: rightOffsetBars,
        barSpacing: isMobile ? 8 : 12,
        minBarSpacing: 4,
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.12)",
        textColor: textColor
      },
      leftPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.12)",
        textColor: textColor
      },
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
    });

    chartRef.current = chart;
    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.02, bottom: priceBottomMargin },
      borderColor: "rgba(148, 163, 184, 0.12)",
    });

    chart.priceScale("left").applyOptions({
      scaleMargins: { top: 0.02, bottom: priceBottomMargin },
      borderColor: "rgba(148, 163, 184, 0.12)",
    });

    if (onLogicalRangeChange) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(onLogicalRangeChange);
    }

    // --- 1. VOLUME ---
    const volumeSeries = chart.addSeries(HistogramSeries, { 
      color: "rgba(45, 212, 191, 0.22)", priceFormat: { type: "volume" }, priceScaleId: "volume" 
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: volumeTopMargin, bottom: priceBottomMargin } });
    volumeSeries.setData(data.map(d => ({
      time: d.time as UTCTimestamp,
      value: d.volume,
      color: d.close >= d.open ? "rgba(45, 212, 191, 0.20)" : "rgba(244, 63, 94, 0.18)"
    })));

    const priceAtmosphere = chart.addSeries(AreaSeries, {
      topColor: "rgba(56, 189, 248, 0.11)",
      bottomColor: "rgba(15, 23, 42, 0.00)",
      lineColor: "rgba(56, 189, 248, 0.0)",
      lineWidth: 1 as LineWidth,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    priceAtmosphere.setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.close })));

    // --- 2. MAIN SERIES (CANDLE / LINE) ---
    const mainSeries = chartType === 'candle'
        ? chart.addSeries(CandlestickSeries, {
            upColor: "#16c784",
            downColor: "#f43f5e",
            borderUpColor: "rgba(52, 211, 153, 0.95)",
            borderDownColor: "rgba(251, 113, 133, 0.95)",
            wickUpColor: "rgba(94, 234, 212, 0.85)",
            wickDownColor: "rgba(251, 113, 133, 0.85)",
            borderVisible: true,
            wickVisible: true,
          })
        : chart.addSeries(LineSeries, {
            color: "rgba(226, 232, 240, 0.96)",
            lineWidth: 3 as LineWidth,
            lastValueVisible: true,
            priceLineVisible: true,
            priceLineColor: "rgba(125, 211, 252, 0.45)",
            priceLineStyle: LineStyle.Dotted,
            title: "Price",
        });

    if (chartType === 'candle') {
        mainSeries.setData(data.map(d => ({
            time: d.time as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close,
        })));
    } else {
        (mainSeries as any).setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.close })));
    }

    // --- 2.1 MARKERS (BOUNCE) ---
    if (showUndercutBounce) {
        const markers: any[] = [];
        
        data.filter(d => d.isUndercutBounce || d.isEliteBounce).forEach(d => {
            markers.push({
                time: d.time as UTCTimestamp,
                position: 'belowBar',
                color: d.isEliteBounce ? 'rgba(255, 215, 0, 1)' : 'rgba(130, 255, 160, 1)',
                shape: 'arrowUp',
                text: d.isEliteBounce ? `ELITE ${d.convictionScore}%` : `BOUNCE ${d.convictionScore}%`,
            });
        });
        
        // Sort markers by time to avoid render issues
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        createSeriesMarkers(mainSeries, markers);
    }

    // --- 3. EMAs ---
    const sanitizeData = (arr: any[], key: string) =>
        arr.map(d => ({ time: d.time as UTCTimestamp, value: d[key] }))
           .filter(v => v.value !== undefined && v.value !== null && !isNaN(v.value));
    const sanitizeMappedData = (mapper: (item: any) => number | null | undefined) =>
        compactChartData<LineData<Time>>(
          data.map((d) => {
            const value = mapper(d);
            return typeof value === "number" && Number.isFinite(value)
              ? { time: asChartTime(d.time), value }
              : null;
          })
        );

    if (showEMA9) {
        chart.addSeries(LineSeries, {
            color: "rgba(96, 165, 250, 0.92)",
            lineWidth: 2 as LineWidth,
            title: "EMA 9",
            lastValueVisible: false,
            priceLineVisible: false,
            lineStyle: LineStyle.Solid,
        }).setData(sanitizeData(data, 'ema9'));
    }
    if (showEMA10) {
        chart.addSeries(LineSeries, {
            color: "rgba(6, 182, 212, 0.82)",
            lineWidth: 1.5 as LineWidth,
            title: "EMA 10",
            lastValueVisible: false,
            priceLineVisible: false,
        }).setData(sanitizeData(data, 'ema10'));
    }
    if (showEMA20) {
        chart.addSeries(LineSeries, {
            color: "rgba(245, 158, 11, 0.94)",
            lineWidth: 3 as LineWidth,
            title: "EMA 20",
            lastValueVisible: false,
            priceLineVisible: false,
        }).setData(sanitizeData(data, 'ema20'));
    }
    if (showEMA50) {
        chart.addSeries(LineSeries, {
            color: "rgba(248, 113, 113, 0.78)",
            lineWidth: 2 as LineWidth,
            title: "EMA 50",
            lastValueVisible: false,
            priceLineVisible: false,
        }).setData(sanitizeData(data, 'ema50'));
    }
    if (showEMA60) {
        chart.addSeries(LineSeries, {
            color: "rgba(167, 139, 250, 0.84)",
            lineWidth: 2 as LineWidth,
            title: "EMA 60",
            lastValueVisible: false,
            priceLineVisible: false,
        }).setData(sanitizeData(data, 'ema60'));
    }
    if (showEMA200) {
        chart.addSeries(LineSeries, {
            color: "rgba(244, 114, 182, 0.58)",
            lineWidth: 1.5 as LineWidth,
            title: "EMA 200",
            lastValueVisible: false,
            priceLineVisible: false,
            lineStyle: LineStyle.Dashed,
        }).setData(sanitizeData(data, 'ema200'));
    }

    // --- 3.1 RISK CHANNELS ---
    const keltnerUpper = sanitizeMappedData((d) => d.keltner?.upper);
    const keltnerMiddle = sanitizeMappedData((d) => d.keltner?.middle);
    const keltnerLower = sanitizeMappedData((d) => d.keltner?.lower);
    if (keltnerUpper.length > 10 && keltnerLower.length > 10) {
      chart.addSeries(LineSeries, {
        color: "rgba(56, 189, 248, 0.20)",
        lineWidth: 1 as LineWidth,
        lineStyle: LineStyle.Dotted,
        title: "Keltner Upper",
        lastValueVisible: false,
        priceLineVisible: false,
      }).setData(keltnerUpper);
      chart.addSeries(LineSeries, {
        color: "rgba(148, 163, 184, 0.18)",
        lineWidth: 1 as LineWidth,
        title: "Keltner Mid",
        lastValueVisible: false,
        priceLineVisible: false,
      }).setData(keltnerMiddle);
      chart.addSeries(LineSeries, {
        color: "rgba(56, 189, 248, 0.20)",
        lineWidth: 1 as LineWidth,
        lineStyle: LineStyle.Dotted,
        title: "Keltner Lower",
        lastValueVisible: false,
        priceLineVisible: false,
      }).setData(keltnerLower);
    }

    const chandelierLong = sanitizeMappedData((d) => d.chandelier?.long);
    if (chandelierLong.length > 10) {
      chart.addSeries(LineSeries, {
        color: "rgba(248, 113, 113, 0.35)",
        lineWidth: 1 as LineWidth,
        lineStyle: LineStyle.Dashed,
        title: compactTitle("Chandelier Stop"),
        lastValueVisible: !isMobile,
        priceLineVisible: false,
      }).setData(chandelierLong);
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
        chart.addSeries(LineSeries, { lineWidth: 1 as LineWidth, lastValueVisible: false, priceLineVisible: false, color: "rgba(148, 163, 184, 0.24)", title: "BB Upper" })
             .setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.bb?.upper })).filter(v => !!v.value));
        chart.addSeries(LineSeries, { lineWidth: 1 as LineWidth, lastValueVisible: false, priceLineVisible: false, color: "rgba(148, 163, 184, 0.24)", title: "BB Lower" })
             .setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.bb?.lower })).filter(v => !!v.value));
        
        const bbBack = chart.addSeries(AreaSeries, { topColor: "rgba(148, 163, 184, 0.045)", bottomColor: "rgba(15, 23, 42, 0.00)", lineVisible: false, lastValueVisible: false, priceLineVisible: false });
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
            priceLineVisible: false,
        }).setData(sanitizeData(data, 'vwap'));
    }

    // --- 6.1 MACD LOWER PANE ---
    const macdScaleOptions = {
      priceScaleId: "macd",
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    };
    const macdHistSeries = chart.addSeries(HistogramSeries, { ...macdScaleOptions });
    chart.priceScale("macd").applyOptions({
      scaleMargins: { top: macdTopMargin, bottom: macdBottomMargin },
      borderColor: "rgba(197, 203, 206, 0.12)",
    });
    macdHistSeries.setData(
      compactChartData<HistogramData<Time>>(
        data.map((d) => {
          const value = Number(d.macd?.histogram);
          if (!Number.isFinite(value)) return null;
          return {
            time: asChartTime(d.time),
            value,
            color: value >= 0 ? "rgba(45, 212, 191, 0.48)" : "rgba(244, 63, 94, 0.46)",
          };
        })
      )
    );
    chart.addSeries(LineSeries, { color: "rgba(96, 165, 250, 0.82)", lineWidth: 2 as LineWidth, ...macdScaleOptions })
      .setData(
        compactChartData<LineData<Time>>(
          data.map((d) => {
            const value = Number(d.macd?.macd);
            return Number.isFinite(value) ? { time: asChartTime(d.time), value } : null;
          })
        )
      );
    chart.addSeries(LineSeries, { color: "rgba(251, 146, 60, 0.84)", lineWidth: 2 as LineWidth, ...macdScaleOptions })
      .setData(
        compactChartData<LineData<Time>>(
          data.map((d) => {
            const value = Number(d.macd?.signal);
            return Number.isFinite(value) ? { time: asChartTime(d.time), value } : null;
          })
        )
      );

    // --- 6.2 SQUEEZE DELUXE LOWER PANE ---
    if (showSqueezeDeluxe) {
      const squeezeScaleOptions = {
        priceScaleId: "squeeze",
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      };

      const gaugeBandData = (
        predicate: (momentum: number, flux: number) => boolean,
        value: number
      ) =>
        compactChartData<BaselineData<Time>>(
          data.map((d) => {
            const momentum = finiteChartNumber(d.squeezeDeluxe?.momentum);
            const flux = finiteChartNumber(d.squeezeDeluxe?.flux);
            return momentum !== null && flux !== null && predicate(momentum, flux)
              ? { time: asChartTime(d.time), value }
              : null;
          })
        );

      const addUpperGaugeBand = (predicate: (momentum: number, flux: number) => boolean, color: string) => {
        chart.addSeries(BaselineSeries, {
          baseValue: { type: "price", price: 70 },
          topFillColor1: color,
          topFillColor2: color,
          topLineColor: "transparent",
          bottomFillColor1: "transparent",
          bottomFillColor2: "transparent",
          bottomLineColor: "transparent",
          lineWidth: 1,
          ...squeezeScaleOptions,
        }).setData(gaugeBandData(predicate, 75));
      };

      const addLowerGaugeBand = (predicate: (momentum: number, flux: number) => boolean, color: string) => {
        chart.addSeries(BaselineSeries, {
          baseValue: { type: "price", price: -70 },
          topFillColor1: "transparent",
          topFillColor2: "transparent",
          topLineColor: "transparent",
          bottomFillColor1: color,
          bottomFillColor2: color,
          bottomLineColor: "transparent",
          lineWidth: 1,
          ...squeezeScaleOptions,
        }).setData(gaugeBandData(predicate, -75));
      };

      addUpperGaugeBand((momentum, flux) => momentum > 0 && flux > 0, "rgba(22, 155, 93, 0.42)");
      addUpperGaugeBand((momentum, flux) => !(momentum > 0 && flux > 0) && (momentum > 0 || flux > 0), "rgba(22, 155, 93, 0.22)");
      addUpperGaugeBand((momentum, flux) => momentum <= 0 && flux <= 0, "rgba(120, 123, 134, 0.12)");
      addLowerGaugeBand((momentum, flux) => momentum < 0 && flux < 0, "rgba(151, 5, 41, 0.42)");
      addLowerGaugeBand((momentum, flux) => !(momentum < 0 && flux < 0) && (momentum < 0 || flux < 0), "rgba(151, 5, 41, 0.22)");
      addLowerGaugeBand((momentum, flux) => momentum >= 0 && flux >= 0, "rgba(120, 123, 134, 0.12)");

      const fluxSeries = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: 0 },
        topFillColor1: "rgba(22, 155, 93, 0.30)",
        topFillColor2: "rgba(22, 155, 93, 0.03)",
        topLineColor: "rgba(22, 155, 93, 0.55)",
        bottomFillColor1: "rgba(151, 5, 41, 0.03)",
        bottomFillColor2: "rgba(151, 5, 41, 0.30)",
        bottomLineColor: "rgba(151, 5, 41, 0.55)",
        lineWidth: 1,
        ...squeezeScaleOptions,
      });
      chart.priceScale("squeeze").applyOptions({
        scaleMargins: { top: squeezeTopMargin, bottom: 0 },
        borderColor: "rgba(197, 203, 206, 0.12)",
      });
      fluxSeries.setData(
        compactChartData<BaselineData<Time>>(
          data.map((d) => {
            const value = finiteChartNumber(d.squeezeDeluxe?.flux);
            return value !== null ? { time: asChartTime(d.time), value } : null;
          })
        )
      );

      chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: 0 },
        topFillColor1: "rgba(17, 207, 119, 0.52)",
        topFillColor2: "rgba(17, 207, 119, 0.08)",
        topLineColor: "rgba(17, 207, 119, 0.85)",
        bottomFillColor1: "rgba(209, 22, 69, 0.08)",
        bottomFillColor2: "rgba(209, 22, 69, 0.52)",
        bottomLineColor: "rgba(209, 22, 69, 0.85)",
        lineWidth: 1,
        ...squeezeScaleOptions,
      }).setData(
        compactChartData<BaselineData<Time>>(
          data.map((d) => {
            const value = finiteChartNumber(d.squeezeDeluxe?.overflux ?? d.squeezeDeluxe?.overFlux);
            return value !== null ? { time: asChartTime(d.time), value } : null;
          })
        )
      );

      chart.addSeries(HistogramSeries, { ...squeezeScaleOptions })
        .setData(
          compactChartData<HistogramData<Time>>(
            data.map((d) => {
              const sqz = d.squeezeDeluxe?.squeeze;
              if (!sqz?.low) return null;
              const color = sqz.high ? "#ff1100" : sqz.mid ? "#ff5e00" : "#ffa600";
              const value = 1;
              return { time: asChartTime(d.time), value, color };
            })
          )
        );

      chart.addSeries(LineSeries, {
        color: "rgba(203, 213, 225, 0.45)",
        lineWidth: 1 as LineWidth,
        ...squeezeScaleOptions,
      }).setData(
        compactChartData<LineData<Time>>(
          data.map((d) => {
            const value = finiteChartNumber(d.squeezeDeluxe?.signal);
            return value !== null ? { time: asChartTime(d.time), value } : null;
          })
        )
      );

      const momentumSeries = chart.addSeries(LineSeries, {
        color: "#ffcfa6",
        lineWidth: 2 as LineWidth,
        ...squeezeScaleOptions,
      });
      momentumSeries.setData(
        compactChartData<LineData<Time>>(
          data.map((d) => {
            const value = finiteChartNumber(d.squeezeDeluxe?.momentum);
            const signal = finiteChartNumber(d.squeezeDeluxe?.signal);
            if (value === null) return null;
            return {
              time: asChartTime(d.time),
              value,
              color: signal !== null && value > signal ? "#ffcfa6" : "#419fec"
            };
          })
        )
      );

      const squeezeMarkers: SeriesMarker<Time>[] = data.flatMap((d): SeriesMarker<Time>[] => {
        const markers: SeriesMarker<Time>[] = [];
        if (d.squeezeDeluxe?.isBearDiv) {
          markers.push({
            time: asChartTime(d.time),
            position: "aboveBar" as const,
            color: "#d11645",
            shape: "arrowDown" as const,
            text: "D-",
          });
        }
        if (d.squeezeDeluxe?.isBullDiv) {
          markers.push({
            time: asChartTime(d.time),
            position: "belowBar" as const,
            color: "#ffa600",
            shape: "arrowUp" as const,
            text: "D+",
          });
        }
        return markers;
      });
      if (squeezeMarkers.length > 0) {
        createSeriesMarkers(momentumSeries, squeezeMarkers);
      }
    }

    // --- 7. PIVOTS ---
    if (pivots && data.length > 20) {
      const lastTime = data[data.length - 1].time;
      const startTime = data[data.length - 20].time;
      const drawPivot = (val: number, color: string, title: string) => {
        const series = chart.addSeries(LineSeries, { color, lineWidth: 1 as LineWidth, title: compactTitle(title), lineStyle: 3, lastValueVisible: !isMobile, priceLineVisible: false });
        series.setData([{ time: startTime as UTCTimestamp, value: val }, { time: lastTime as UTCTimestamp, value: val }]);
      };
      drawPivot(pivots.p, "rgba(226, 232, 240, 0.18)", "Pivot");
      drawPivot(pivots.r1, "rgba(45, 212, 191, 0.20)", "Resistance");
      drawPivot(pivots.s1, "rgba(251, 113, 133, 0.20)", "Support");
    }

    // --- 8. EXECUTION RISK PLAN ---
    if (riskPlan && data.length > 2) {
      const startTime = data[Math.max(0, data.length - 60)].time as UTCTimestamp;
      const lastTime = data[data.length - 1].time as UTCTimestamp;
      const timeStep = Number(data[data.length - 1].time) - Number(data[data.length - 2].time);
      const fallbackEnd = Number.isFinite(timeStep)
        ? (Number(lastTime) + timeStep * (riskPlan.timeStopBars || 4)) as UTCTimestamp
        : lastTime;
      const endTime = (riskPlan.expiresAt || fallbackEnd) as UTCTimestamp;
      const drawRiskLine = (value: unknown, color: string, title: string, style: LineStyle = LineStyle.Dashed, width: LineWidth = 1 as LineWidth) => {
        const price = finiteChartNumber(value);
        if (price === null) return;
        chart.addSeries(LineSeries, {
          color,
          lineWidth: width,
          lineStyle: style,
          title: compactTitle(title),
          lastValueVisible: true,
          priceLineVisible: false,
        }).setData([{ time: startTime, value: price }, { time: endTime, value: price }]);
      };

      const entryLow = finiteChartNumber(riskPlan.entryLow);
      const entryHigh = finiteChartNumber(riskPlan.entryHigh);
      const entryCollapsed = entryLow !== null && entryHigh !== null && Math.abs(entryHigh - entryLow) <= Math.max(1, entryHigh * 0.001);
      if (entryCollapsed) {
        drawRiskLine(entryHigh, "rgba(56, 189, 248, 0.92)", riskPlan.screenerSynced ? "Screener Entry" : "Entry", LineStyle.Solid, 3 as LineWidth);
      } else {
        drawRiskLine(riskPlan.entryHigh, "rgba(56, 189, 248, 0.72)", "Entry High", LineStyle.Dashed, 2 as LineWidth);
        drawRiskLine(riskPlan.entryLow, "rgba(56, 189, 248, 0.52)", "Entry Low", LineStyle.Dashed, 2 as LineWidth);
      }
      const idealBuy = finiteChartNumber(riskPlan.idealBuy);
      if (!entryCollapsed || idealBuy === null || entryHigh === null || Math.abs(idealBuy - entryHigh) > Math.max(1, entryHigh * 0.001)) {
        drawRiskLine(riskPlan.idealBuy, "rgba(226, 232, 240, 0.52)", "Ideal Buy", LineStyle.Dotted);
      }
      drawRiskLine(riskPlan.earlyExit, "rgba(251, 191, 36, 0.78)", "Early Exit", LineStyle.Dashed, 2 as LineWidth);
      drawRiskLine(riskPlan.hardStop, "rgba(244, 63, 94, 0.88)", "Hard Stop", LineStyle.Solid, 3 as LineWidth);
      drawRiskLine(riskPlan.target1, "rgba(45, 212, 191, 0.82)", "Target 1", LineStyle.Dashed, 2 as LineWidth);
      drawRiskLine(riskPlan.target2, "rgba(132, 204, 22, 0.64)", "Target 2", LineStyle.Dotted);

      const markerSeries = chart.addSeries(LineSeries, {
        color: "transparent",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      markerSeries.setData([{ time: lastTime, value: data[data.length - 1].close }]);
      createSeriesMarkers(markerSeries, [{
        time: lastTime,
        position: riskPlan.shouldEnter ? "belowBar" as const : "aboveBar" as const,
        color: riskPlan.stateColor || "#fbbf24",
        shape: riskPlan.shouldEnter ? "arrowUp" as const : "circle" as const,
        text: riskPlan.stateLabel || riskPlan.action,
        size: 1 as const,
      }]);
    }

    const lastDataTime = Number(data[data.length - 1]?.time);
    const oneYearAgo = lastDataTime - (365 * 24 * 60 * 60);
    const firstVisibleIndex = data.findIndex((item) => Number(item.time) >= oneYearAgo);
    if (!syncLogicalRange && Number.isFinite(lastDataTime) && firstVisibleIndex > 0) {
      chart.timeScale().setVisibleLogicalRange({
        from: firstVisibleIndex,
        to: data.length - 1 + rightOffsetBars,
      });
    } else if (!syncLogicalRange) {
      chart.timeScale().fitContent();
      chart.timeScale().scrollToPosition(rightOffsetBars, false);
    }

    const resizeObserver = new ResizeObserver(() => {
        if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
              height: window.innerWidth < 768
                ? (showSqueezeDeluxe ? 560 : 460)
                : (showSqueezeDeluxe ? 760 : 660),
            });
        }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      isMounted.current = false;
      resizeObserver.disconnect();
      if (chartRef.current) {
          try {
              chartRef.current.remove();
          } catch {
              // ignore
          }
          chartRef.current = null;
      }
    };
  }, [data, ticker, chartType, showEMA9, showEMA10, showEMA20, showEMA50, showEMA60, showEMA200, showUndercutBounce, showSqueezeDeluxe, showSuperTrend, showBB, showMFI, showVWAP, showOBV, showCMF, onLogicalRangeChange, pivots, riskPlan]);

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
    <div className="panel premium-chart-panel">
      <div className="premium-chart-header">
        <div className="chart-title-block">
          <span className="chart-eyebrow">Price Intelligence</span>
          <strong>CHART HARGA: {ticker}</strong>
        </div>
        <div className="mobile-hide premium-chart-legend">
          {showEMA9 && <span style={{ color: '#3b82f6' }}>EMA 9</span>}
          {showEMA20 && <span style={{ color: '#f59e0b' }}>● EMA 20</span>}
          {showEMA50 && <span style={{ color: '#ef4444' }}>● EMA 50</span>}
          {showEMA200 && <span style={{ color: '#ec4899' }}>● EMA 200</span>}
          {showEMA60 && <span style={{ color: '#8b5cf6' }}>EMA 60</span>}
          <span style={{ color: '#26a69a' }}>MACD</span>
          {showSqueezeDeluxe && <span style={{ color: '#ffa600' }}>SQZ DELUXE</span>}
          {riskPlan?.screenerSynced && <span style={{ color: '#38bdf8' }}>ENTRY/STOP DARI SCREENER</span>}
          {riskPlan && <span style={{ color: riskPlan.stateColor || '#fbbf24' }}>{riskPlan.stateLabel || 'RENCANA RISIKO'}</span>}
        </div>
      </div>
      <div ref={chartContainerRef} className={`advanced-chart-canvas ${showSqueezeDeluxe ? 'with-squeeze' : ''}`} style={{ width: '100%', height: showSqueezeDeluxe ? '760px' : '660px' }} />
      <style jsx>{`
        .premium-chart-panel {
          position: relative;
          padding: 0;
          overflow: hidden;
          background:
            radial-gradient(circle at 18% 0%, rgba(56, 189, 248, 0.18), transparent 34%),
            radial-gradient(circle at 86% 18%, rgba(34, 197, 94, 0.10), transparent 30%),
            linear-gradient(180deg, #070b12 0%, #05070b 48%, #030406 100%);
          border: 1px solid rgba(148, 163, 184, 0.18);
          box-shadow:
            0 30px 90px rgba(0, 0, 0, 0.42),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }

        .premium-chart-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background-image:
            linear-gradient(90deg, rgba(148, 163, 184, 0.045) 1px, transparent 1px),
            linear-gradient(0deg, rgba(148, 163, 184, 0.035) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: linear-gradient(180deg, rgba(0,0,0,0.9), transparent 74%);
        }

        .premium-chart-panel::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 3;
          box-shadow: inset 0 0 90px rgba(0, 0, 0, 0.45);
        }

        .premium-chart-header {
          position: relative;
          z-index: 4;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(2, 6, 12, 0.52));
          backdrop-filter: blur(14px);
        }

        .chart-title-block {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }

        .chart-eyebrow {
          color: #7dd3fc;
          font-size: 0.52rem;
          font-weight: 1000;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .chart-title-block strong {
          color: white;
          font-size: 0.78rem;
          letter-spacing: 0.08em;
          overflow-wrap: anywhere;
        }

        .premium-chart-legend {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
          font-size: 0.66rem;
          font-weight: 900;
        }

        .premium-chart-legend span {
          padding: 4px 7px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.12);
          white-space: nowrap;
        }

        .advanced-chart-canvas {
          position: relative;
          z-index: 2;
        }

        @media (max-width: 768px) {
          .premium-chart-header {
            align-items: flex-start;
            padding: 12px;
          }

          .chart-title-block strong {
            font-size: 0.68rem;
          }

          .advanced-chart-canvas {
            height: 460px !important;
          }
          .advanced-chart-canvas.with-squeeze {
            height: 560px !important;
          }
        }
      `}</style>
    </div>
  );
}
