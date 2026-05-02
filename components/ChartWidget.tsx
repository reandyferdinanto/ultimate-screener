"use client";
import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, IChartApi, AreaSeries } from "lightweight-charts";
import type { AreaData, Time } from "lightweight-charts";

type MarketChartPoint = {
  time: Time;
  value?: number;
  close?: number;
};

export default function ChartWidget({ title, symbol, isNegativeMode = false }: { title: string, symbol: string, isNegativeMode?: boolean }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<MarketChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketData() {
      try {
        const res = await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok) throw new Error(`/api/market failed with ${res.status}`);
        if (!contentType.includes("application/json")) throw new Error(`/api/market returned ${contentType || "non-JSON response"}`);

        const json = await res.json();
        if (!cancelled && json.success && json.data) {
          setData(json.data);
        }
      } catch (error) {
        console.error("Failed to load market data", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMarketData();

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const mainColor = isNegativeMode ? "#ef4444" : "#22c55e"; // red vs green
    const gridColor = "#333333";
    const textColor = "#999999";

    const container = chartContainerRef.current;
    const chart = createChart(container, {
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
      width: container.clientWidth,
      height: window.innerWidth < 768 ? 240 : 350,
    });
    
    chartRef.current = chart;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: mainColor,
      topColor: isNegativeMode ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)",
      bottomColor: "rgba(18, 18, 18, 0)",
      lineWidth: 2,
    });
    
    const formattedData = data.map((d): AreaData<Time> | null => {
      const value = d.value ?? d.close;
      return typeof value === "number" ? { time: d.time, value } : null;
    }).filter((d): d is AreaData<Time> => d !== null).sort((a, b) => Number(a.time) - Number(b.time));
    
    // Remove duplicates
    const uniqueData = Array.from(new Map(formattedData.map(item => [item.time, item])).values());
    
    try {
      areaSeries.setData(uniqueData);
      chart.timeScale().fitContent();
    } catch {
      console.error("Lightweight charts err:");
    }

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: window.innerWidth < 768 ? 240 : 350,
      });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, isNegativeMode]);

  const latestPoint = data[data.length - 1];
  const prevPoint = data[data.length - 2];
  const latestValue = latestPoint ? (latestPoint.close ?? latestPoint.value ?? 0) : 0;
  const prevValue = prevPoint ? (prevPoint.close ?? prevPoint.value ?? latestValue) : latestValue;
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
      <div ref={chartContainerRef} className="chart-widget-canvas" style={{ flex: 1, position: 'relative', minHeight: '300px' }} />
      <style jsx>{`
        @media (max-width: 768px) {
          .chart-widget-canvas {
            min-height: 240px !important;
          }
        }
      `}</style>
    </div>
  );
}
