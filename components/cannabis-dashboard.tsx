"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { LogEntryModal, type FieldSpec } from "@/components/log-entry-modal";
import { QuickLogModal } from "@/components/quick-log-modal";
import { CannabisQuickLog } from "@/components/quick-log-forms";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CHART_GRID, X_AXIS_DATE, Y_AXIS } from "@/lib/chart-defaults";

import {
  getCannabisConfig,
  getCannabisDay,
  addCannabisEntry,
  deleteCannabisEntry,
  updateCannabisEntry,
  getCannabisHistory,
  getCannabisSessions,
  getCannabisActiveCapsule,
  startCannabisCapsule,
  endCannabisCapsule,
  type CannabisEntry,
} from "@/lib/api";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { haptic } from "@/lib/haptics";
import { StatCard } from "@/components/stat-card";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import { LogRow, type TaskRowAction } from "@/components/tasks";

// 30-minute buckets → 48 slots covering the full day (matches caffeine).
const BUCKET_MIN = 30;
const BUCKETS_PER_DAY = (24 * 60) / BUCKET_MIN;

function fmtHour(frac: number): string {
  const h = Math.floor(frac);
  const m = Math.round((frac % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

import {
  todayLocalISO,
  nowHHMM as currentTime,
  HOUR_TICKS_2H,
  formatHourTick,
} from "@/lib/date-utils";
import { useSelectedDate } from "@/hooks/use-selected-date";

function CannabisExtras({
  mode,
  hasActiveCapsule,
  activeCapsuleStrain,
  strains,
  newCapsuleStrain,
  onNewCapsuleStrainChange,
}: {
  mode: "create" | "edit";
  hasActiveCapsule: boolean;
  activeCapsuleStrain: string | null;
  strains: string[];
  newCapsuleStrain: string;
  onNewCapsuleStrainChange: (v: string) => void;
}) {
  if (mode === "edit") return null;
  if (!hasActiveCapsule) {
    return (
      <>
        <input
          type="text"
          value={newCapsuleStrain}
          onChange={(e) => onNewCapsuleStrainChange(e.target.value)}
          placeholder="Strain (optional) — starts a new capsule on vape"
          list="cannabis-strain-options"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        {strains.length > 0 && (
          <datalist id="cannabis-strain-options">
            {strains.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      Strain: <span className="font-medium text-foreground">{activeCapsuleStrain ?? "None"}</span> · from active capsule
    </p>
  );
}

export function CannabisDashboard() {
  const cannabisColor = "var(--section-accent)";
  const chartConfig = {
    grams: { label: "Grams", color: cannabisColor },
    count: { label: "Sessions", color: cannabisColor },
  } satisfies ChartConfig;
  const [editor, setEditor] = useState<
    | { mode: "create" }
    | { mode: "edit"; entry: CannabisEntry }
    | null
  >(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("log")) {
      return { mode: "create" };
    }
    return null;
  });
  const [saving, setSaving] = useState(false);
  const [newCapsuleStrain, setNewCapsuleStrain] = useState("");
  const barAnim = useBarAnimation();
  const { date: selectedDate } = useSelectedDate();
  const today = todayLocalISO();

  const { data, error, isLoading, mutate } = useSWR(
    ["cannabis", selectedDate],
    async () => {
      const [d, h, c, s, cap] = await Promise.all([
        getCannabisDay(selectedDate),
        getCannabisHistory(30),
        getCannabisConfig(),
        getCannabisSessions(90),
        getCannabisActiveCapsule(),
      ]);
      return {
        day: d,
        history: h,
        strains: c.strains,
        sessions: s.sessions,
        capsule: cap,
      };
    },
    { refreshInterval: 60_000 },
  );

  const day = data?.day ?? null;
  const history = data?.history ?? null;
  const strains = data?.strains ?? [];
  const sessions = data?.sessions ?? [];
  const activeCapsule = data?.capsule?.active ?? null;
  const usesPerCapsule = data?.capsule?.uses_per_capsule ?? 3;
  const capsulePosition = useMemo(() => {
    const positions = new Map<string, number>();
    if (!day) return positions;
    const byCapsule = new Map<string, CannabisEntry[]>();
    for (const e of day.entries) {
      if (e.method !== "vape" || !e.capsule_id) continue;
      const arr = byCapsule.get(e.capsule_id) ?? [];
      arr.push(e);
      byCapsule.set(e.capsule_id, arr);
    }
    for (const arr of byCapsule.values()) {
      arr.sort((a, b) => a.time.localeCompare(b.time));
      arr.forEach((e, i) => positions.set(e.id, i + 1));
    }
    return positions;
  }, [day]);
  const loading = isLoading && !data;

  // Seed the new-capsule strain from the most recent historical session that
  // had one. Users usually reorder the same strain, and retyping it on every
  // fresh capsule is the kind of friction we're trying to eliminate.
  const lastStrain = useMemo(() => {
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].strain) return sessions[i].strain ?? "";
    }
    return "";
  }, [sessions]);

  const handleSave = useCallback(
    async (values: Record<string, unknown>) => {
      if (saving) return;
      const time = String(values.time ?? "");
      const method = (values.method as "vape" | "edible") ?? "vape";
      const needsNewCapsule = !activeCapsule && method === "vape";
      setSaving(true);
      try {
        if (editor?.mode === "edit") {
          await updateCannabisEntry(editor.entry.id, selectedDate, { time, method });
        } else {
          if (needsNewCapsule) {
            await startCannabisCapsule(newCapsuleStrain || lastStrain || null);
          }
          await addCannabisEntry({ date: today, time, method });
        }
        setEditor(null);
        setNewCapsuleStrain("");
        await mutate();
      } finally {
        setSaving(false);
      }
    },
    [today, selectedDate, editor, saving, activeCapsule, newCapsuleStrain, lastStrain, mutate],
  );

  const handleEdit = useCallback((entry: CannabisEntry) => {
    setEditor({ mode: "edit", entry });
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditor(null);
    setNewCapsuleStrain("");
  }, []);

  const handleEndCapsule = useCallback(async () => {
    haptic("medium");
    await endCannabisCapsule();
    await mutate();
  }, [mutate]);

  const handleStartCapsule = useCallback(async () => {
    haptic("medium");
    await startCannabisCapsule(lastStrain || null);
    await mutate();
  }, [mutate, lastStrain]);

  const handleDelete = useCallback(async (entryId: string) => {
    try {
      await deleteCannabisEntry(entryId, selectedDate);
      if (editor?.mode === "edit" && editor.entry.id === entryId) setEditor(null);
      await mutate();
    } catch {
      // error surfaced via SWR
    }
  }, [selectedDate, mutate, editor]);

  const fieldSchema: FieldSpec[] = useMemo(
    () => [
      {
        kind: "row",
        fields: [
          { kind: "time", key: "time", label: "Time" },
          {
            kind: "chips",
            key: "method",
            label: "Method",
            options: [
              { value: "vape", label: "Vape" },
              { value: "edible", label: "Edible", emoji: "🍬" },
            ],
          },
        ],
      },
    ],
    [],
  );

  const editorOpen = editor !== null;
  const editorMode = editor?.mode ?? "create";
  const editorInitial = useMemo<Record<string, unknown>>(() => {
    if (editor?.mode === "edit") {
      return { time: editor.entry.time.slice(0, 5), method: editor.entry.method };
    }
    return { time: currentTime(), method: "vape" };
  }, [editor]);

  const chartData = (history?.daily ?? []).map((p) => ({
    date: p.date.slice(5),
    sessions: p.sessions,
    grams: p.total_g,
  }));

  // Time-of-day charts — vape only, since that's the thing you actually
  // care about seeing the distribution of. Edibles are too infrequent.
  const vapeSessions = sessions.filter((s) => s.method === "vape");

  // Histogram: full 90-day window bucketed into 30-min slots.
  const histogram = useMemo(() => {
    const counts = new Array(BUCKETS_PER_DAY).fill(0) as number[];
    for (const s of vapeSessions) {
      const bucket = Math.min(BUCKETS_PER_DAY - 1, Math.floor((s.hour * 60) / BUCKET_MIN));
      counts[bucket] += 1;
    }
    return counts.map((count, i) => {
      const hourFrac = (i * BUCKET_MIN) / 60;
      return { bucket: i, hourFrac, label: fmtHour(hourFrac), count };
    });
  }, [vapeSessions]);

  const peakBucket = useMemo(() => {
    let best = -1;
    let max = 0;
    for (const h of histogram) {
      if (h.count > max) {
        max = h.count;
        best = h.bucket;
      }
    }
    if (best < 0) return null;
    const start = (best * BUCKET_MIN) / 60;
    const end = ((best + 1) * BUCKET_MIN) / 60;
    return { range: `${fmtHour(start)}–${fmtHour(end)}`, count: max };
  }, [histogram]);

  return (
    <>
      <SectionHeaderAction>
        <SectionHeaderActionButton
          color={cannabisColor}
          onClick={() => setEditor({ mode: "create" })}
        >
          + Log
        </SectionHeaderActionButton>
      </SectionHeaderAction>

      <QuickLogModal
        open={editor?.mode === "create"}
        onClose={handleCloseEditor}
        title="Log Session"
        accent="var(--section-accent)"
      >
        <CannabisQuickLog
          onDone={() => {
            setEditor(null);
            mutate();
          }}
        />
      </QuickLogModal>

      <LogEntryModal
        open={editor?.mode === "edit"}
        mode="edit"
        title="Edit Session"
        schema={fieldSchema}
        initialValues={editorInitial}
        saving={saving}
        onClose={handleCloseEditor}
        onSubmit={handleSave}
        onDelete={editor?.mode === "edit" ? () => handleDelete(editor.entry.id) : undefined}
        extra={
          <CannabisExtras
            mode="edit"
            activeCapsuleStrain={activeCapsule?.strain ?? null}
            hasActiveCapsule={!!activeCapsule}
            strains={strains.map((s) => s.name)}
            newCapsuleStrain={newCapsuleStrain || lastStrain}
            onNewCapsuleStrainChange={setNewCapsuleStrain}
          />
        }
      />

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* Today's summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Active capsule</p>
          {activeCapsule ? (
            <>
              <p className="mt-1 truncate text-2xl font-semibold" style={{ color: cannabisColor }}>
                {activeCapsule.strain ?? "No strain"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeCapsule.use_count}/{usesPerCapsule} uses
                {activeCapsule.use_count > usesPerCapsule && " (extra)"}
              </p>
              <button
                type="button"
                onClick={handleEndCapsule}
                className="mt-2 w-full rounded-lg px-2 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: cannabisColor }}
              >
                End capsule
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-2xl font-semibold" style={{ color: cannabisColor }}>None</p>
              <button
                type="button"
                onClick={handleStartCapsule}
                className="mt-2 w-full rounded-lg px-2 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: cannabisColor }}
              >
                Start capsule
              </button>
            </>
          )}
        </div>
        <StatCard label="Sessions" value={day ? day.session_count : null} color={cannabisColor} />
        <StatCard label="Total" value={day ? `${day.total_g}g` : null} color={cannabisColor} />
          </div>

          {/* 30-day chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Last 30 days (g)</CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden px-4">
                <ChartContainer config={chartConfig} className="h-[140px] w-full">
                  <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid {...CHART_GRID} />
                    <XAxis {...X_AXIS_DATE} interval={3} />
                    <YAxis {...Y_AXIS} width={32} />
                    <Bar dataKey="grams" fill="var(--color-grams)" radius={[4, 4, 0, 0]} {...barAnim} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Aggregated time-of-day distribution (vape only, 7 days) */}
          {vapeSessions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Vape time-of-day · last 90 days</CardTitle>
                <p className="text-xs text-muted-foreground">
                  30-min buckets across vape sessions from the last 90 days.
                  {peakBucket && (
                    <>
                      {" "}Peak{" "}
                      <span className="font-semibold text-foreground">{peakBucket.range}</span>
                      {" "}
                      <span className="text-muted-foreground/70">({peakBucket.count})</span>
                    </>
                  )}
                </p>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden px-4">
                <ChartContainer config={chartConfig} className="h-[140px] w-full">
                  <BarChart data={histogram} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...CHART_GRID} />
                    <XAxis
                      dataKey="hourFrac"
                      type="number"
                      domain={[0, 24]}
                      ticks={HOUR_TICKS_2H}
                      interval={0}
                      tickFormatter={formatHourTick}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} {...barAnim} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Session log */}
        <div className="min-w-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : day && day.entries.length > 0 ? (
            <div className="space-y-2">
              {day.entries.map((entry) => {
                const actions: TaskRowAction[] = [
                  { label: "Edit", onSelect: () => handleEdit(entry) },
                  {
                    label: "Delete",
                    tone: "destructive",
                    confirm: "Delete this session?",
                    onSelect: () => handleDelete(entry.id),
                  },
                ];
                return (
                  <LogRow
                    key={entry.id}
                    accent={cannabisColor}
                    time={entry.time.slice(0, 5)}
                    title={entry.method === "vape" ? "Vape" : "🍬 Edible"}
                    details={(() => {
                      const strainText =
                        entry.strain && entry.strain !== "None" ? `· ${entry.strain}` : null;
                      const pos = capsulePosition.get(entry.id);
                      if (!strainText && !pos) return undefined;
                      return (
                        <span className="inline-flex items-center gap-2">
                          {strainText}
                          {pos && (
                            <span
                              className="inline-flex items-center gap-0.5"
                              title={`Capsule use ${pos} of ${usesPerCapsule}`}
                              aria-hidden
                            >
                              {Array.from({ length: usesPerCapsule }, (_, i) => (
                                <span
                                  key={i}
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: "50%",
                                    backgroundColor: i < pos ? cannabisColor : "transparent",
                                    border: i < pos ? "none" : `1px solid ${cannabisColor}`,
                                    opacity: i < pos ? 1 : 0.5,
                                  }}
                                />
                              ))}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    onClick={() => handleEdit(entry)}
                    actions={actions}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sessions logged today.</p>
          )}
        </div>
      </div>

    </>
  );
}
