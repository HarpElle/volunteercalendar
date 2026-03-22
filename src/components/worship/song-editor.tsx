"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ChordChartRenderer } from "./chord-chart-renderer";
import { useAuth } from "@/lib/context/auth-context";
import { ALL_KEYS } from "@/lib/music";
import type { Song, SongChartData, ChartSection, SectionType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SongEditorProps {
  song: Song;
  onSave: (updated: Partial<Song>) => void;
  saving?: boolean;
}

const SECTION_TYPES: SectionType[] = [
  "verse", "chorus", "pre-chorus", "bridge", "intro", "outro",
  "ending", "interlude", "tag", "instrumental", "vamp", "turnaround", "misc",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SongEditor({ song, onSave, saving = false }: SongEditorProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  // Metadata state
  const [title, setTitle] = useState(song.title);
  const [defaultKey, setDefaultKey] = useState(song.default_key || "");
  const [ccliNumber, setCcliNumber] = useState(song.ccli_number || "");
  const [writerCredit, setWriterCredit] = useState(song.writer_credit || "");
  const [copyright, setCopyright] = useState(song.copyright || "");
  const [tempo, setTempo] = useState(song.tempo?.toString() || "");
  const [timeSig, setTimeSig] = useState(song.time_signature || "");
  const [tags, setTags] = useState(song.tags.join(", "));
  const [notes, setNotes] = useState(song.notes || "");

  // Chart data state
  const [chartData, setChartData] = useState<SongChartData | null>(song.chart_data);

  // Debounced auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const parsedTempo = parseInt(tempo, 10);
      const updatedChartData = chartData ? {
        ...chartData,
        metadata: {
          ...chartData.metadata,
          title,
          original_key: defaultKey || null,
          ccli_number: ccliNumber || null,
          writers: writerCredit || null,
          copyright: copyright || null,
          tempo: isNaN(parsedTempo) ? null : parsedTempo,
          time_signature: timeSig || null,
        },
      } : null;

      onSave({
        title,
        default_key: defaultKey || null,
        ccli_number: ccliNumber || null,
        writer_credit: writerCredit || null,
        copyright: copyright || null,
        tempo: isNaN(parsedTempo) ? null : parsedTempo,
        time_signature: timeSig || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: notes || null,
        chart_data: updatedChartData,
      });
    }, 1500);
  }, [title, defaultKey, ccliNumber, writerCredit, copyright, tempo, timeSig, tags, notes, chartData, onSave]);

  // Trigger auto-save on changes
  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [scheduleSave]);

  // ---- Section management ----

  function addSection() {
    if (!chartData) return;
    const newSection: ChartSection = {
      id: `sec_${Date.now()}`,
      type: "verse",
      label: `Verse ${chartData.sections.filter((s) => s.type === "verse").length + 1}`,
      lines: [{ segments: [{ chord: null, lyrics: "" }] }],
    };
    setChartData({
      ...chartData,
      sections: [...chartData.sections, newSection],
    });
  }

  function updateSectionType(sectionId: string, type: SectionType) {
    if (!chartData) return;
    setChartData({
      ...chartData,
      sections: chartData.sections.map((s) =>
        s.id === sectionId
          ? { ...s, type, label: type.charAt(0).toUpperCase() + type.slice(1) }
          : s,
      ),
    });
  }

  function updateSectionLabel(sectionId: string, label: string) {
    if (!chartData) return;
    setChartData({
      ...chartData,
      sections: chartData.sections.map((s) =>
        s.id === sectionId ? { ...s, label } : s,
      ),
    });
  }

  function deleteSection(sectionId: string) {
    if (!chartData) return;
    setChartData({
      ...chartData,
      sections: chartData.sections.filter((s) => s.id !== sectionId),
    });
  }

  function moveSection(sectionId: string, direction: "up" | "down") {
    if (!chartData) return;
    const idx = chartData.sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= chartData.sections.length) return;
    const sections = [...chartData.sections];
    [sections[idx], sections[newIdx]] = [sections[newIdx], sections[idx]];
    setChartData({ ...chartData, sections });
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg border border-vc-border-light overflow-hidden">
          <button
            onClick={() => setMode("edit")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mode === "edit"
                ? "bg-vc-indigo text-white"
                : "bg-white text-vc-text hover:bg-vc-bg-warm"
            }`}
          >
            Edit
          </button>
          <button
            onClick={() => setMode("preview")}
            className={`px-4 py-2 text-sm font-medium border-l border-vc-border-light transition-colors ${
              mode === "preview"
                ? "bg-vc-indigo text-white"
                : "bg-white text-vc-text hover:bg-vc-bg-warm"
            }`}
          >
            Preview
          </button>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-sm text-vc-text-muted">
            <Spinner size="sm" /> Saving...
          </div>
        )}
      </div>

      {mode === "preview" && chartData ? (
        <div className="rounded-xl border border-vc-border-light bg-white p-6">
          <ChordChartRenderer chartData={chartData} />
        </div>
      ) : (
        <>
          {/* Metadata fields */}
          <div className="rounded-xl border border-vc-border-light bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold text-vc-indigo">Song Information</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-vc-text">Key</label>
                <select
                  value={defaultKey}
                  onChange={(e) => setDefaultKey(e.target.value)}
                  className="w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-indigo focus:outline-none focus:ring-1 focus:ring-vc-indigo"
                >
                  <option value="">No key</option>
                  {ALL_KEYS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <Input
                label="CCLI Number"
                value={ccliNumber}
                onChange={(e) => setCcliNumber(e.target.value)}
              />
              <Input
                label="Writer(s)"
                value={writerCredit}
                onChange={(e) => setWriterCredit(e.target.value)}
              />
              <Input
                label="Copyright"
                value={copyright}
                onChange={(e) => setCopyright(e.target.value)}
              />
              <Input
                label="Tempo (BPM)"
                type="number"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
              />
              <Input
                label="Time Signature"
                placeholder="4/4"
                value={timeSig}
                onChange={(e) => setTimeSig(e.target.value)}
              />
              <Input
                label="Tags (comma-separated)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-vc-text">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-indigo focus:outline-none focus:ring-1 focus:ring-vc-indigo"
              />
            </div>
          </div>

          {/* Sections editor */}
          {chartData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-vc-indigo">Chart Sections</h3>
                <Button variant="outline" size="sm" onClick={addSection}>
                  + Add Section
                </Button>
              </div>

              {chartData.sections.map((section, idx) => (
                <div
                  key={section.id}
                  className="rounded-xl border border-vc-border-light bg-white p-4"
                >
                  {/* Section header */}
                  <div className="mb-3 flex items-center gap-2">
                    <select
                      value={section.type}
                      onChange={(e) => updateSectionType(section.id, e.target.value as SectionType)}
                      className="rounded-md border border-vc-border-light bg-vc-bg-warm px-2 py-1 text-xs font-medium text-vc-text focus:border-vc-indigo focus:outline-none"
                    >
                      {SECTION_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      value={section.label}
                      onChange={(e) => updateSectionLabel(section.id, e.target.value)}
                      className="flex-1 rounded-md border border-vc-border-light bg-white px-2 py-1 text-sm font-medium text-vc-text focus:border-vc-indigo focus:outline-none"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => moveSection(section.id, "up")}
                        disabled={idx === 0}
                        className="rounded p-1 text-vc-text-muted hover:bg-vc-bg-warm disabled:opacity-30"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveSection(section.id, "down")}
                        disabled={idx === chartData.sections.length - 1}
                        className="rounded p-1 text-vc-text-muted hover:bg-vc-bg-warm disabled:opacity-30"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteSection(section.id)}
                        className="rounded p-1 text-vc-text-muted hover:bg-vc-danger/10 hover:text-vc-danger"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Lines display */}
                  <div className="rounded-lg bg-vc-bg-warm p-3">
                    {section.lines.map((line, li) => (
                      <div key={li} className="mb-1">
                        <div className="flex flex-wrap text-xs font-semibold text-vc-coral">
                          {line.segments.map((seg, si) => (
                            <span key={si} className="mr-1">
                              {seg.chord || "\u00A0"}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap text-sm text-vc-text">
                          {line.segments.map((seg, si) => (
                            <span key={si}>{seg.lyrics || "\u00A0"}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-2 text-xs text-vc-text-muted">
                    {section.lines.length} line{section.lines.length !== 1 ? "s" : ""} &middot;{" "}
                    {section.lines.reduce((c, l) => c + l.segments.filter((s) => s.chord).length, 0)} chords
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
