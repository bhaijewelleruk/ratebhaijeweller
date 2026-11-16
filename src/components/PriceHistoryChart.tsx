"use client";

import React, { useState, useEffect, useMemo } from "react";
import { formatGBP } from "@/lib/rates";

interface HistoryPoint {
  date: string;
  label: string;
  goldGram: number;
  silverGram: number;
  goldOunce: number;
  silverOunce: number;
  goldTola: number;
}

export default function PriceHistoryChart({
  liveGoldGram = 93.47,
  liveSilverGram = 1.2,
}: {
  liveGoldGram?: number;
  liveSilverGram?: number;
}) {
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [timeframe, setTimeframe] = useState<7 | 30 | 180 | 365>(30);
  const [unit, setUnit] = useState<"gram" | "tola" | "ounce">("gram");
  const [series, setSeries] = useState<HistoryPoint[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    fetch(
      `/api/rates/history?days=${timeframe}&gold=${liveGoldGram}&silver=${liveSilverGram}`
    )
      .then((r) => r.json())
      .then((res) => {
        if (active && res.success && Array.isArray(res.series)) {
          setSeries(res.series);
          setHoverIdx(null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [timeframe, liveGoldGram, liveSilverGram]);

  const unitMultiplier = useMemo(() => {
    if (unit === "tola") return 11.6638;
    if (unit === "ounce") return 31.1035;
    return 1;
  }, [unit]);

  const unitLabel = useMemo(() => {
    if (unit === "tola") return "per Tola (11.66g)";
    if (unit === "ounce") return "per Troy Ounce";
    return "per Gram (24K)";
  }, [unit]);

  const values = useMemo(() => {
    return series.map((pt) => {
      const base = metal === "gold" ? pt.goldGram : pt.silverGram;
      return Number((base * unitMultiplier).toFixed(2));
    });
  }, [series, metal, unitMultiplier]);

  const stats = useMemo(() => {
    if (values.length === 0) {
      const fallback = (metal === "gold" ? liveGoldGram : liveSilverGram) * unitMultiplier;
      return {
        min: fallback,
        max: fallback,
        avg: fallback,
        first: fallback,
        last: fallback,
        changeAmt: 0,
        changePct: 0,
      };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const first = values[0];
    const last = values[values.length - 1];
    const changeAmt = last - first;
    const changePct = first > 0 ? (changeAmt / first) * 100 : 0;

    return { min, max, avg, first, last, changeAmt, changePct };
  }, [values, metal, liveGoldGram, liveSilverGram, unitMultiplier]);

  const activeIdx = hoverIdx !== null && series[hoverIdx] ? hoverIdx : series.length - 1;
  const activePoint = series[activeIdx];
  const activeValue = values[activeIdx] ?? stats.last;

  // Build SVG path coordinates (width: 760, height: 220)
  const chartW = 760;
  const chartH = 220;
  const padX = 14;
  const padY = 20;

  const { linePath, areaPath, coords } = useMemo(() => {
    if (values.length < 2) {
      return { linePath: "", areaPath: "", coords: [] as { x: number; y: number }[] };
    }
    const range = Math.max(stats.max - stats.min, 0.01);
    const usableW = chartW - padX * 2;
    const usableH = chartH - padY * 2;

    const pts = values.map((v, i) => {
      const x = padX + (i / (values.length - 1)) * usableW;
      const y = padY + usableH - ((v - stats.min) / range) * usableH;
      return { x, y };
    });

    const line = pts
      .map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${chartH} L${pts[0].x.toFixed(1)},${chartH} Z`;

    return { linePath: line, areaPath: area, coords: pts };
  }, [values, stats.min, stats.max]);

  const isPositive = stats.changePct >= 0;
  const strokeColor = metal === "gold" ? "#8b6914" : "#475569";

  return (
    <section className="mt-6 bg-white/95 border-2 border-[#dfcca6] rounded-[12px] p-4 sm:p-6 shadow-xs">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#dfcca6]/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-notche font-bold uppercase tracking-widest px-2.5 py-0.5 rounded bg-[#faf5ea] text-[#8b6914] border border-[#dfcca6]">
              📈 London Fix Historical Index
            </span>
            <span
              className={`text-[10.5px] font-numbers font-bold px-2 py-0.5 rounded border ${
                isPositive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              {isPositive ? "+" : ""}
              {stats.changePct.toFixed(2)}% ({timeframe}D)
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-notche font-bold text-slate-900 mt-1">
            {metal === "gold" ? "24K Gold" : "999 Fine Silver"} Historical Price Trend ({unitLabel})
          </h2>
        </div>

        {/* Switchers: Metal + Unit + Timeframe */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metal Toggle */}
          <div className="inline-flex bg-[#faf8f5] p-1 rounded-lg border border-[#dfcca6]">
            <button
              type="button"
              onClick={() => setMetal("gold")}
              className={`px-3 py-1 rounded-md text-xs font-notche font-bold transition-all cursor-pointer ${
                metal === "gold"
                  ? "bg-[#8b6914] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🟡 Gold
            </button>
            <button
              type="button"
              onClick={() => setMetal("silver")}
              className={`px-3 py-1 rounded-md text-xs font-notche font-bold transition-all cursor-pointer ${
                metal === "silver"
                  ? "bg-slate-800 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              ⚪ Silver
            </button>
          </div>

          {/* Unit Toggle */}
          <div className="inline-flex bg-[#faf8f5] p-1 rounded-lg border border-[#dfcca6]">
            {(
              [
                { id: "gram", label: "1g" },
                { id: "tola", label: "Tola" },
                { id: "ounce", label: "1oz" },
              ] as const
            ).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUnit(u.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  unit === u.id
                    ? "bg-white text-[#8b6914] shadow-2xs border border-[#dfcca6]/60"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>

          {/* Timeframe Toggle */}
          <div className="inline-flex bg-[#faf8f5] p-1 rounded-lg border border-[#dfcca6]">
            {(
              [
                { days: 7, label: "7D" },
                { days: 30, label: "1M" },
                { days: 180, label: "6M" },
                { days: 365, label: "1Y" },
              ] as const
            ).map((tf) => (
              <button
                key={tf.days}
                type="button"
                onClick={() => setTimeframe(tf.days)}
                className={`px-2.5 py-1 rounded-md text-xs font-numbers font-bold transition-all cursor-pointer ${
                  timeframe === tf.days
                    ? "bg-[#8b6914] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Inspected Point & Period Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
        <div className="p-3 rounded-xl bg-[#faf8f5] border border-[#dfcca6]/70">
          <span className="text-[10px] font-bold uppercase text-stone-400 block">
            {activePoint ? `Selected (${activePoint.label})` : "Current Spot"}
          </span>
          <span className="text-lg sm:text-xl font-numbers font-bold text-[#8b6914]">
            {formatGBP(activeValue)}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#faf8f5] border border-[#dfcca6]/70">
          <span className="text-[10px] font-bold uppercase text-stone-400 block">
            {timeframe}D Period High
          </span>
          <span className="text-lg sm:text-xl font-numbers font-bold text-emerald-700">
            {formatGBP(stats.max)}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#faf8f5] border border-[#dfcca6]/70">
          <span className="text-[10px] font-bold uppercase text-stone-400 block">
            {timeframe}D Period Low
          </span>
          <span className="text-lg sm:text-xl font-numbers font-bold text-slate-700">
            {formatGBP(stats.min)}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#faf8f5] border border-[#dfcca6]/70">
          <span className="text-[10px] font-bold uppercase text-stone-400 block">
            {timeframe}D Period Change
          </span>
          <span
            className={`text-lg sm:text-xl font-numbers font-bold ${
              isPositive ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {isPositive ? "+" : ""}
            {formatGBP(stats.changeAmt)}
          </span>
        </div>
      </div>

      {/* Interactive SVG Area Chart */}
      <div className="relative mt-4 w-full h-52 sm:h-60 rounded-xl bg-gradient-to-b from-[#faf6ee]/80 to-white border border-[#dfcca6]/60 p-2 overflow-hidden select-none">
        {isLoading && series.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-stone-400">
            Loading historical chart...
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-full overflow-visible"
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              <linearGradient id="bullionAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={metal === "gold" ? "#d4af37" : "#64748b"}
                  stopOpacity="0.38"
                />
                <stop
                  offset="100%"
                  stopColor={metal === "gold" ? "#d4af37" : "#64748b"}
                  stopOpacity="0.02"
                />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines */}
            {[0.2, 0.5, 0.8].map((ratio, idx) => (
              <line
                key={idx}
                x1={padX}
                x2={chartW - padX}
                y1={chartH * ratio}
                y2={chartH * ratio}
                stroke="#e5dccb"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            ))}

            {/* Shaded Area */}
            {areaPath && <path d={areaPath} fill="url(#bullionAreaGrad)" />}

            {/* Smooth Price Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={strokeColor}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Active Crosshair & Marker */}
            {coords[activeIdx] && (
              <>
                <line
                  x1={coords[activeIdx].x}
                  x2={coords[activeIdx].x}
                  y1={padY / 2}
                  y2={chartH}
                  stroke={strokeColor}
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  opacity="0.6"
                />
                <circle
                  cx={coords[activeIdx].x}
                  cy={coords[activeIdx].y}
                  r="5.5"
                  fill="#ffffff"
                  stroke={strokeColor}
                  strokeWidth="3"
                />
              </>
            )}

            {/* Invisible Hover Columns for Smooth Point Selection */}
            {coords.map((pt, i) => {
              const colW = chartW / Math.max(coords.length, 1);
              return (
                <rect
                  key={i}
                  x={pt.x - colW / 2}
                  y={0}
                  width={colW}
                  height={chartH}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIdx(i)}
                  onTouchStart={() => setHoverIdx(i)}
                />
              );
            })}
          </svg>
        )}
      </div>

      {/* Bottom Date Axis Labels */}
      {series.length > 1 && (
        <div className="flex items-center justify-between text-[10.5px] font-numbers text-stone-400 mt-2 px-1">
          <span>{series[0]?.label}</span>
          <span>{series[Math.floor(series.length * 0.25)]?.label}</span>
          <span>{series[Math.floor(series.length * 0.5)]?.label}</span>
          <span>{series[Math.floor(series.length * 0.75)]?.label}</span>
          <span className="font-bold text-[#8b6914]">Today (Live)</span>
        </div>
      )}
    </section>
  );
}

