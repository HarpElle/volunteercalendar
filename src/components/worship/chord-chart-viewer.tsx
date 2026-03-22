"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChordChartRenderer } from "./chord-chart-renderer";
import {
  transposeSongChart,
  convertChartNotation,
  ALL_KEYS,
} from "@/lib/music";
import type { SongChartData, ChartType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChordChartViewerProps {
  chartData: SongChartData;
  /** Song metadata for the header. */
  title?: string;
  writers?: string | null;
  copyright?: string | null;
  ccliNumber?: string | null;
  /** Render in StageSync mode. */
  stageSyncMode?: boolean;
  /** Additional className. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  standard: "Standard",
  nashville: "Nashville",
  solfege_fixed: "Do-Re-Mi (Fixed)",
  solfege_movable: "Do-Re-Mi (Movable)",
};

const FIT_OPTIONS = [
  { value: null, label: "Auto" },
  { value: 1, label: "1 Page" },
  { value: 2, label: "2 Pages" },
  { value: 3, label: "3 Pages" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChordChartViewer({
  chartData,
  title,
  writers,
  copyright,
  ccliNumber,
  stageSyncMode = false,
  className = "",
}: ChordChartViewerProps) {
  const originalKey = chartData.metadata.original_key || "C";

  // Toolbar state
  const [activeKey, setActiveKey] = useState(originalKey);
  const [chartType, setChartType] = useState<ChartType>("standard");
  const [columns, setColumns] = useState<1 | 2>(1);
  const [fontScale, setFontScale] = useState(1.0);
  const [headingBold, setHeadingBold] = useState(true);
  const [chordHighlight, setChordHighlight] = useState(true);
  const [fitPages, setFitPages] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);

  // Compute the transformed chart data
  const displayChart = getDisplayChart(chartData, originalKey, activeKey, chartType);

  // Fit-to-N-pages scaling
  useFitToPages(chartRef, fitPages, fontScale, setFontScale);

  // Reset handler
  function handleReset() {
    setActiveKey(originalKey);
    setChartType("standard");
    setColumns(1);
    setFontScale(1.0);
    setHeadingBold(true);
    setChordHighlight(true);
    setFitPages(null);
    setShowSettings(false);
  }

  // Print
  function handlePrint() {
    window.print();
  }

  if (stageSyncMode) {
    return (
      <div className={className}>
        <ChordChartRenderer
          chartData={displayChart}
          columns={1}
          fontScale={fontScale}
          headingBold={headingBold}
          chordHighlight={chordHighlight}
          stageSyncMode
        />
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Song header */}
      <div className="mb-4">
        {title && (
          <h2 className="font-display text-2xl font-bold text-vc-indigo">
            {title || chartData.metadata.title}
          </h2>
        )}
        {(writers || chartData.metadata.writers) && (
          <p className="mt-0.5 text-sm text-vc-text-secondary">
            {writers || chartData.metadata.writers}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {activeKey && (
            <Badge variant="accent">Key: {activeKey}</Badge>
          )}
          {chartData.metadata.tempo && (
            <Badge variant="default">{chartData.metadata.tempo} BPM</Badge>
          )}
          {chartData.metadata.time_signature && (
            <Badge variant="default">{chartData.metadata.time_signature}</Badge>
          )}
          {(ccliNumber || chartData.metadata.ccli_number) && (
            <Badge variant="default">CCLI #{ccliNumber || chartData.metadata.ccli_number}</Badge>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-vc-border-light bg-vc-bg-warm p-3">
        {/* Transpose Key */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-vc-text-secondary">Key</label>
          <select
            value={activeKey}
            onChange={(e) => setActiveKey(e.target.value)}
            className="rounded-lg border border-vc-border-light bg-white px-2 py-1 text-sm text-vc-text focus:border-vc-indigo focus:outline-none focus:ring-1 focus:ring-vc-indigo"
          >
            {ALL_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}{k === originalKey ? " (Original)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Chart Type */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-vc-text-secondary">Type</label>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as ChartType)}
            className="rounded-lg border border-vc-border-light bg-white px-2 py-1 text-sm text-vc-text focus:border-vc-indigo focus:outline-none focus:ring-1 focus:ring-vc-indigo"
          >
            {Object.entries(CHART_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Columns toggle */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-vc-text-secondary">Columns</label>
          <div className="flex rounded-lg border border-vc-border-light overflow-hidden">
            <button
              onClick={() => setColumns(1)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                columns === 1
                  ? "bg-vc-indigo text-white"
                  : "bg-white text-vc-text hover:bg-vc-bg-warm"
              }`}
            >
              1
            </button>
            <button
              onClick={() => setColumns(2)}
              className={`px-2.5 py-1 text-xs font-medium border-l border-vc-border-light transition-colors ${
                columns === 2
                  ? "bg-vc-indigo text-white"
                  : "bg-white text-vc-text hover:bg-vc-bg-warm"
              }`}
            >
              2
            </button>
          </div>
        </div>

        {/* Scale slider */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-vc-text-secondary">Scale</label>
          <button
            onClick={() => setFontScale((s) => Math.max(0.5, s - 0.1))}
            className="flex h-6 w-6 items-center justify-center rounded border border-vc-border-light bg-white text-xs font-bold text-vc-text hover:bg-vc-bg-warm"
          >
            -
          </button>
          <span className="min-w-[3ch] text-center text-xs font-medium text-vc-text">
            {Math.round(fontScale * 100)}%
          </span>
          <button
            onClick={() => setFontScale((s) => Math.min(2.0, s + 0.1))}
            className="flex h-6 w-6 items-center justify-center rounded border border-vc-border-light bg-white text-xs font-bold text-vc-text hover:bg-vc-bg-warm"
          >
            +
          </button>
        </div>

        {/* Fit Pages */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-vc-text-secondary">Fit</label>
          <select
            value={fitPages === null ? "" : String(fitPages)}
            onChange={(e) => {
              const val = e.target.value;
              setFitPages(val === "" ? null : Number(val));
            }}
            className="rounded-lg border border-vc-border-light bg-white px-2 py-1 text-sm text-vc-text focus:border-vc-indigo focus:outline-none focus:ring-1 focus:ring-vc-indigo"
          >
            {FIT_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value === null ? "" : String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-vc-border-light bg-white text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-text"
          title="Font settings"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>

        {/* Reset + Print */}
        <div className="ml-auto flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            Print
          </Button>
        </div>
      </div>

      {/* Extended settings */}
      {showSettings && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-vc-border-light bg-white p-3">
          <label className="flex items-center gap-2 text-sm text-vc-text">
            <input
              type="checkbox"
              checked={headingBold}
              onChange={(e) => setHeadingBold(e.target.checked)}
              className="h-4 w-4 rounded border-vc-border accent-vc-indigo"
            />
            Bold headings
          </label>
          <label className="flex items-center gap-2 text-sm text-vc-text">
            <input
              type="checkbox"
              checked={chordHighlight}
              onChange={(e) => setChordHighlight(e.target.checked)}
              className="h-4 w-4 rounded border-vc-border accent-vc-indigo"
            />
            Highlight chords
          </label>
        </div>
      )}

      {/* Chart content */}
      <div ref={chartRef} className="print:p-0">
        <ChordChartRenderer
          chartData={displayChart}
          columns={columns}
          fontScale={fontScale}
          headingBold={headingBold}
          chordHighlight={chordHighlight}
        />
      </div>

      {/* Copyright footer */}
      {(copyright || chartData.metadata.copyright) && (
        <p className="mt-4 text-xs text-vc-text-muted">
          {copyright || chartData.metadata.copyright}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDisplayChart(
  chartData: SongChartData,
  originalKey: string,
  activeKey: string,
  chartType: ChartType,
): SongChartData {
  let chart = chartData;

  // Transpose if needed
  if (activeKey !== originalKey) {
    chart = transposeSongChart(chart, originalKey, activeKey);
  }

  // Convert notation if not standard
  if (chartType !== "standard") {
    chart = convertChartNotation(chart, activeKey, chartType);
  }

  return chart;
}

// ---------------------------------------------------------------------------
// Fit-to-N-pages hook
// ---------------------------------------------------------------------------

function useFitToPages(
  chartRef: React.RefObject<HTMLDivElement | null>,
  fitPages: number | null,
  currentScale: number,
  setScale: (scale: number) => void,
) {
  const fitInProgress = useRef(false);

  const adjustScale = useCallback(() => {
    if (fitPages === null || !chartRef.current || fitInProgress.current) return;

    fitInProgress.current = true;

    // Target height = N pages at ~96 DPI (letter paper ~1056px per page at 96dpi)
    const PAGE_HEIGHT_PX = 1056;
    const targetHeight = fitPages * PAGE_HEIGHT_PX;

    let lo = 0.3;
    let hi = 2.5;
    let best = currentScale;

    // Binary search for optimal scale (8 iterations)
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;

      // Temporarily set font-size to measure
      const baseFontSize = 16;
      chartRef.current.style.fontSize = `${baseFontSize * mid}px`;

      const contentHeight = chartRef.current.scrollHeight;

      if (contentHeight <= targetHeight) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    // Restore and apply best scale
    chartRef.current.style.fontSize = "";
    setScale(Math.round(best * 100) / 100);
    fitInProgress.current = false;
  }, [fitPages, chartRef, currentScale, setScale]);

  useEffect(() => {
    adjustScale();
  }, [fitPages, adjustScale]);
}
