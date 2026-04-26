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
  elliott?: any;
  wavePivots?: any[];
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
  elliott,
  wavePivots,
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

    const bgColor = "#0a0a0a";
    const textColor = "#d1d4dc";
    const gridColor = "rgba(42, 46, 57, 0.1)";
    const isMobile = window.innerWidth < 768;
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
      height: chartHeight,
    });

    chartRef.current = chart;
    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.02, bottom: priceBottomMargin },
    });

    if (onLogicalRangeChange) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(onLogicalRangeChange);
    }

    // --- 1. VOLUME ---
    const volumeSeries = chart.addSeries(HistogramSeries, { 
      color: "#26a69a", priceFormat: { type: "volume" }, priceScaleId: "volume" 
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: volumeTopMargin, bottom: priceBottomMargin } });
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

    if (showEMA9) {
        chart.addSeries(LineSeries, { color: "#ffcfa6", lineWidth: 1.5 as LineWidth, title: "EMA 9", lastValueVisible: false, priceLineVisible: false })
             .setData(sanitizeData(data, 'ema9'));
    }
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
    if (showEMA60) {
        chart.addSeries(LineSeries, { color: "rgba(255, 160, 64, 0.75)", lineWidth: 1.5 as LineWidth, title: "EMA 60", lastValueVisible: false, priceLineVisible: false })
             .setData(sanitizeData(data, 'ema60'));
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
            color: value >= 0 ? "rgba(38, 166, 154, 0.55)" : "rgba(239, 83, 80, 0.55)",
          };
        })
      )
    );
    chart.addSeries(LineSeries, { color: "#2962FF", lineWidth: 1.5 as LineWidth, ...macdScaleOptions })
      .setData(
        compactChartData<LineData<Time>>(
          data.map((d) => {
            const value = Number(d.macd?.macd);
            return Number.isFinite(value) ? { time: asChartTime(d.time), value } : null;
          })
        )
      );
    chart.addSeries(LineSeries, { color: "#FF6D00", lineWidth: 1.5 as LineWidth, ...macdScaleOptions })
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
        const series = chart.addSeries(LineSeries, { color, lineWidth: 1 as LineWidth, title, lineStyle: 3, lastValueVisible: true, priceLineVisible: false });
        series.setData([{ time: startTime as UTCTimestamp, value: val }, { time: lastTime as UTCTimestamp, value: val }]);
      };
      drawPivot(pivots.p, "rgba(255,255,255,0.15)", "P");
      drawPivot(pivots.r1, "rgba(34, 197, 94, 0.15)", "R1");
      drawPivot(pivots.s1, "rgba(239, 68, 68, 0.15)", "S1");
    }

    // --- 8. ELLIOTT ZIGZAG & FIBONACCI ---
    if (wavePivots && wavePivots.length > 0) {
      const zigzagSeries = chart.addSeries(LineSeries, {
        color: "rgba(255, 235, 59, 0.6)",
        lineWidth: 2 as LineWidth,
        lineStyle: 0,
        title: "Elliott ZigZag",
        lastValueVisible: false,
        priceLineVisible: false,
      });

      const zigzagData = wavePivots.map(p => ({
        time: data[p.index].time as UTCTimestamp,
        value: p.price
      }));
      zigzagSeries.setData(zigzagData);

      // Markers for Waves dynamically assigned so they tie seamlessly to predictions
      let waveMarkers: any[] = [];
      let validPivots = [...wavePivots];
      
      // Elliott structure requires the peak to be a HIGH pivot before we predict pullbacks.
      if (validPivots.length > 0 && validPivots[validPivots.length - 1].type === 'low') {
          validPivots.pop();
      }

      if (elliott && elliott.trend === 'BULLISH') {
          // We need W0 (Low), W1 (High), W2 (Low), W3 (High)
          const pts = validPivots.slice(-4);
          waveMarkers = pts.map((p, i) => ({
            time: data[p.index].time as UTCTimestamp,
            position: p.type === 'high' ? 'aboveBar' as const : 'belowBar' as const,
            color: "rgba(130, 255, 160, 1)",
            shape: 'circle' as const,
            text: `W${i}`,
          }));
      } else if (elliott && elliott.trend === 'BEARISH') {
          // We need START (Low), 1 (High), 2 (Low), 3 (High), 4 (Low), 5 (High)
          const pts = validPivots.slice(-6);
          waveMarkers = pts.map((p, i) => ({
            time: data[p.index].time as UTCTimestamp,
            position: p.type === 'high' ? 'aboveBar' as const : 'belowBar' as const,
            color: "#FFEB3B",
            shape: 'circle' as const,
            text: i === 0 ? 'START' : `${i}`,
          }));
      } else {
          waveMarkers = wavePivots.slice(-5).map((p, i) => ({
            time: data[p.index].time as UTCTimestamp,
            position: p.type === 'high' ? 'aboveBar' as const : 'belowBar' as const,
            color: "#FFEB3B",
            shape: 'circle' as const,
            text: `${i + 1}`,
          }));
      }
      createSeriesMarkers(zigzagSeries, waveMarkers);
    }

    if (elliott && elliott.retracement) {
      const lastTime = data[data.length - 1].time;
      const startTime = data[data.length - 50].time;
      
      const drawFibo = (val: number, color: string, title: string, style = 2) => {
        const series = chart.addSeries(LineSeries, { 
          color, lineWidth: 1 as LineWidth, title, lineStyle: style as any, 
          lastValueVisible: true, priceLineVisible: false 
        });
        series.setData([{ time: startTime as UTCTimestamp, value: val }, { time: lastTime as UTCTimestamp, value: val }]);
      };

      // Support Levels (Retracement)
      drawFibo(elliott.retracement.h618, "rgba(239, 83, 80, 0.4)", "FIB 0.618");
      drawFibo(elliott.retracement.h382, "rgba(38, 166, 154, 0.4)", "FIB 0.382");

      // Target Levels (Extension & Retracement Projection)
      if (elliott.trend === 'BULLISH') {
        const lastPrice = data[data.length - 1].close;
        const diff = elliott.retracement.h0 - elliott.retracement.h100;
        
        // Find nearest authentic Fibo support below lastPrice
        let w4TargetFibo = elliott.retracement.h382;
        if (lastPrice <= elliott.retracement.h382) w4TargetFibo = elliott.retracement.h500;
        if (lastPrice <= elliott.retracement.h500) w4TargetFibo = elliott.retracement.h618;
        if (lastPrice <= elliott.retracement.h618) w4TargetFibo = elliott.retracement.h786;
        
        // Ensure the line visually drops to target it
        const w4Price = Math.min(lastPrice * 0.98, w4TargetFibo);
        
        // Realistic W5 Target based on Elliott Wave geometry (typically 0.618x the size of the whole W0-W3 impulse, mapped from W4)
        const w5Target = Math.max(elliott.retracement.h0 * 1.02, w4Price + diff * 0.618);

        drawFibo(w5Target, "rgba(130, 255, 160, 0.6)", "TARGET W5 (0.618 Ext)", 0);
        
        // --- 9. PREDICTION WAVE (UP) ---
        const predictionSeries = chart.addSeries(LineSeries, {
            color: "rgba(130, 255, 160, 0.4)",
            lineWidth: 2 as LineWidth,
            lineStyle: 2,
            title: "Prediction",
            lastValueVisible: false,
            priceLineVisible: false,
        });

        const lastTimeVal = data[data.length - 1].time as number;
        const timeStep = (data[1].time as number) - (data[0].time as number);

        const predictionData = [
            { time: lastTimeVal as UTCTimestamp, value: lastPrice },
            { time: (lastTimeVal + timeStep * 6) as UTCTimestamp, value: w4Price }, // Pullback W4
            { time: (lastTimeVal + timeStep * 16) as UTCTimestamp, value: w5Target } // Target W5
        ];
        predictionSeries.setData(predictionData);

        createSeriesMarkers(predictionSeries, [
            { time: predictionData[1].time, position: 'belowBar', color: 'rgba(130, 255, 160, 0.8)', shape: 'circle', text: 'W4' },
            { time: predictionData[2].time, position: 'aboveBar', color: 'rgba(130, 255, 160, 1)', shape: 'circle', text: 'W5 Target' },
        ]);
      } else if (elliott.trend === 'BEARISH') {
        // --- 9. PREDICTION WAVE (DOWN / A-B-C) ---
        const predictionSeries = chart.addSeries(LineSeries, {
            color: "rgba(239, 83, 80, 0.4)",
            lineWidth: 2 as LineWidth,
            lineStyle: 2,
            title: "Correction",
            lastValueVisible: false,
            priceLineVisible: false,
        });

        const lastPrice = data[data.length - 1].close;
        const lastTimeVal = data[data.length - 1].time as number;
        const timeStep = (data[1].time as number) - (data[0].time as number);

        // Prediction for A-B-C Correction
        // Wave A hunts for next Fibo support
        let wATargetFibo = elliott.retracement.h382;
        if (lastPrice <= elliott.retracement.h382) wATargetFibo = elliott.retracement.h500;
        if (lastPrice <= elliott.retracement.h500) wATargetFibo = elliott.retracement.h618;
        if (lastPrice <= elliott.retracement.h618) wATargetFibo = elliott.retracement.h786;
        const waveA = Math.min(lastPrice * 0.98, wATargetFibo);

        // Wave B bounces up towards nearest Fibo resistance
        let wBTargetFibo = elliott.retracement.h618;
        if (waveA >= elliott.retracement.h618) wBTargetFibo = elliott.retracement.h500;
        if (waveA >= elliott.retracement.h500) wBTargetFibo = elliott.retracement.h382;
        const waveB = Math.max(waveA * 1.05, wBTargetFibo);

        const waveC = Math.min(waveA * 0.90, elliott.retracement.h100);

        const predictionData = [
            { time: lastTimeVal as UTCTimestamp, value: lastPrice },
            { time: (lastTimeVal + timeStep * 5) as UTCTimestamp, value: waveA }, // Wave A down
            { time: (lastTimeVal + timeStep * 9) as UTCTimestamp, value: waveB }, // Wave B bounce
            { time: (lastTimeVal + timeStep * 16) as UTCTimestamp, value: waveC }  // Wave C bottom
        ];
        predictionSeries.setData(predictionData);

        createSeriesMarkers(predictionSeries, [
            { time: predictionData[1].time, position: 'belowBar', color: '#ef5350', shape: 'circle', text: 'A' },
            { time: predictionData[2].time, position: 'aboveBar', color: '#ef5350', shape: 'circle', text: 'B' },
            { time: predictionData[3].time, position: 'belowBar', color: '#ef5350', shape: 'circle', text: 'C' },
        ]);
      }
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
  }, [data, ticker, chartType, showEMA9, showEMA10, showEMA20, showEMA50, showEMA60, showEMA200, showUndercutBounce, showSqueezeDeluxe, showSuperTrend, showBB, showMFI, showVWAP, showOBV, showCMF, onLogicalRangeChange, pivots]);

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
          {showEMA9 && <span style={{ color: '#ffcfa6' }}>EMA 9</span>}
          {showEMA20 && <span style={{ color: '#2962FF' }}>● EMA 20</span>}
          {showEMA50 && <span style={{ color: '#FF6D00' }}>● EMA 50</span>}
          {showEMA200 && <span style={{ color: '#FFEB3B' }}>● EMA 200</span>}
          {showEMA60 && <span style={{ color: '#ffa040' }}>EMA 60</span>}
          <span style={{ color: '#26a69a' }}>MACD</span>
          {showSqueezeDeluxe && <span style={{ color: '#ffa600' }}>SQZ DELUXE</span>}
        </div>
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', height: showSqueezeDeluxe ? '760px' : '660px' }} />
    </div>
  );
}
