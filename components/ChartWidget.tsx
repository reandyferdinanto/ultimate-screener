"use client";
import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, IChartApi, AreaSeries } from "lightweight-charts";

export default function ChartWidget({ title, symbol, isNegativeMode = false }: { title: string, symbol: string, isNegativeMode?: boolean }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    fetch(`/api/market?symbol=${symbol}`)
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data) {
          setData(res.data);
        }
        setLoading(false);
      });
  }, [symbol]);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const mainColor = isNegativeMode ? "#ef4444" : "#22c55e"; // red vs green
    const gridColor = "#333333";
    const textColor = "#999999";

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: textColor,
      },
      grid: {
        vertLines: { color: gridColor, style: 1 },
        horzLines: { color: gridColor, style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: window.innerWidth < 768 ? 250 : 350,
    });
    
    chartRef.current = chart;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: mainColor,
      topColor: isNegativeMode ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)",
      bottomColor: "rgba(18, 18, 18, 0)",
      lineWidth: 2,
    });
    
    seriesRef.current = areaSeries;
    
    const formattedData = data.map((d: any) => ({
      time: d.time,
      value: d.value || d.close
    })).sort((a: any, b: any) => a.time - b.time);
    
    // Remove duplicates
    const uniqueData = Array.from(new Map(formattedData.map(item => [item.time, item])).values());
    
    try {
      areaSeries.setData(uniqueData as any);
      chart.timeScale().fitContent();
    } catch {
      console.error("Lightweight charts err:");
    }

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, isNegativeMode]);

  const latestValue = data.length > 0 ? (data[data.length - 1].close || data[data.length - 1].value) : 0;
  const prevValue = data.length > 1 ? (data[data.length - 2].close || data[data.length - 2].value) : 0;
  const diff = latestValue - prevValue;
  const isUp = diff >= 0;
  const valueColorClass = isNegativeMode ? "negative" : (isUp ? "positive" : "negative");

  return (
    <div className="panel">
      <div className="panel-header">
        <span>{title} [{symbol}]</span>
        {loading ? (
          <span>LOAD...</span>
        ) : (
          <span className={`data-value ${valueColorClass}`} style={{ fontSize: '1.25rem' }}>
            {latestValue.toFixed(2)} {diff !== 0 && (isUp ? '▲' : '▼')}
          </span>
        )}
      </div>
      <div ref={chartContainerRef} style={{ flex: 1, position: 'relative', minHeight: '300px' }} />
    </div>
  );
}
