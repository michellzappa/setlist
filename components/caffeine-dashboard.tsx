"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { LogEntryModal, type FieldSpec } from "@/components/log-entry-modal";
import { QuickLogModal } from "@/components/quick-log-modal";
import { CaffeineQuickLog } from "@/components/quick-log-forms";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

import {
  getCaffeineConfig,
  getCaffeineDay,
  addCaffeineEntry,
  deleteCaffeineEntry,
  updateCaffeineEntry,
  getCaffeineHistory,
  getCaffeineSessions,
  type CaffeineMethod,
  type CaffeineSession,
  type CaffeineEntry,
} from "@/lib/api";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { StatCard } from "@/components/stat-card";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import { LogRow, type TaskRowAction } from "@/components/tasks";
import {
  todayLocalISO,
  nowHHMM as currentTime,
  HOUR_TICKS_2H,
  formatHourTick,
} from "@/lib/date-utils";
import { CHART_GRID, X_AXIS_DATE, Y_AXIS } from "@/lib/chart-defaults";
import { useSelectedDate } from "@/hooks/use-selected-date";

// 30-minute buckets → 48 slots covering the full day.
const BUCKET_MIN = 30;
const BUCKETS_PER_DAY = (24 * 60) / BUCKET_MIN;

const METHOD_LABEL: Record<CaffeineMethod, string> = {
  v60: "☕ V60",
  matcha: "🍵 Matcha",
  other: "· Other",
};

const METHOD_ORDER: CaffeineMethod[] = ["v60", "matcha", "other"];

function fmtHour(frac: number): string {
  const h = Math.floor(frac);
  const m = Math.round((frac % 1) * 60);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function CaffeineDashboard() {
  const caffeineColor = "var(--section-accent)";
  const chartConfig = {
    count: { label: "Sessions", color: caffeineColor },
  } satisfies ChartConfig;
  const [editor, setEditor] = useState<
    | { mode: "create" }
    | { mode: "edit"; entry: CaffeineEntry }
    | null
  >(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("log")) {
      return { mode: "create" };
    }
    return null;
  });
  const [saving, setSaving] = useState(false);
  const barAnim = useBarAnimation();
  const { date: selectedDate } = useSelectedDate();
  const today = todayLocalISO();

  const { data, error, isLoading, mutate } = useSWR(
    ["caffeine", selectedDate],
    async () => {
      const [d, c, s, h] = await Promise.all([
        getCaffeineDay(selectedDate),
        getCaffeineConfig(),
        getCaffeineSessions(90),
        getCaffeineHistory(30),
      ]);
      return { day: d, beans: c.beans, sessions: s.sessions, history: h.daily };
    },
    { refreshInterval: 60_000 },
  );

  const day = data?.day ?? null;
  const beans = data?.beans ?? [];
  const sessions = data?.sessions ?? [];
  const history = data?.history ?? [];
  const loading = isLoading && !data;

  // Most recent session (sessions are sorted oldest→newest by the backend).
  const lastSession: CaffeineSession | null = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  const handleSave = useCallback(
    async (values: Record<string, unknown>) => {
      if (saving) return;
      setSaving(true);
      try {
        const time = String(values.time ?? "");
        const method = (values.method as CaffeineMethod) ?? "v60";
        const beansRaw = String(values.beans ?? "").trim();
        const gramsRaw = String(values.grams ?? "").trim();
        const gramsNum = gramsRaw ? parseFloat(gramsRaw) : null;
        const grams = Number.isFinite(gramsNum as number) ? (gramsNum as number) : null;
        const beans = beansRaw || null;
        if (editor?.mode === "edit") {
          await updateCaffeineEntry(editor.entry.id, selectedDate, {
            time,
            method,
            beans,
            grams,
          });
        } else {
          await addCaffeineEntry({ date: today, time, method, beans, grams });
        }
        setEditor(null);
        await mutate();
      } finally {
        setSaving(false);
      }
    },
    [today, selectedDate, editor, saving, mutate],
  );

  const handleEdit = useCallback((entry: CaffeineEntry) => {
    setEditor({ mode: "edit", entry });
  }, []);

  const handleDelete = useCallback(
    async (entryId: string) => {
      try {
        await deleteCaffeineEntry(entryId, selectedDate);
        if (editor?.mode === "edit" && editor.entry.id === entryId) setEditor(null);
        await mutate();
      } catch {
        // surfaced via SWR
      }
    },
    [selectedDate, mutate, editor],
  );

  const fieldSchema: FieldSpec[] = useMemo(
    () => [
      { kind: "time", key: "time", label: "Time" },
      {
        kind: "chips",
        key: "method",
        label: "Method",
        options: [
          { value: "v60", label: "V60", emoji: "☕" },
          { value: "matcha", label: "Matcha", emoji: "🍵" },
          { value: "other", label: "Other" },
        ],
      },
      {
        kind: "row",
        fields: [
          {
            kind: "chips",
            key: "beans",
            label: "Beans",
            fill: false,
            options: [
              { value: "", label: "None" },
              ...beans.map((b) => ({ value: b.name, label: b.name })),
            ],
          },
          { kind: "number", key: "grams", label: "Grams", unit: "g", step: "0.1" },
        ],
      },
    ],
    [beans],
  );

  const editorOpen = editor !== null;
  const editorMode = editor?.mode ?? "create";
  const editorInitial = useMemo<Record<string, unknown>>(() => {
    if (editor?.mode === "edit") {
      const e = editor.entry;
      return {
        time: e.time.slice(0, 5),
        method: e.method,
        beans: e.beans ?? "",
        grams: e.grams != null ? String(e.grams) : "",
      };
    }
    return {
      time: currentTime(),
      method: lastSession?.method ?? "v60",
      beans: lastSession?.beans ?? "",
      grams: lastSession?.grams != null ? String(lastSession.grams) : "",
    };
  }, [editor, lastSession]);

  // 7-day time-of-day distribution, 30-min buckets.
  const histogram = useMemo(() => {
    const counts = new Array(BUCKETS_PER_DAY).fill(0) as number[];
    for (const s of sessions) {
      const bucket = Math.min(BUCKETS_PER_DAY - 1, Math.floor((s.hour * 60) / BUCKET_MIN));
      counts[bucket] += 1;
    }
    return counts.map((count, i) => {
      const hourFrac = (i * BUCKET_MIN) / 60;
      return {
        bucket: i,
        hourFrac,
        label: fmtHour(hourFrac),
        count,
      };
    });
  }, [sessions]);

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

  const hasAnySessions = sessions.length > 0;

  // 30-day daily totals. Backend returns oldest→newest; keep that order so
  // today sits on the right edge.
  const dailyTotals = useMemo(
    () => history.map((p) => ({ date: p.date.slice(5), count: p.sessions })),
    [history],
  );

  return (
    <>
      <SectionHeaderAction>
        <SectionHeaderActionButton color={caffeineColor} onClick={() => setEditor({ mode: "create" })}>
          + Log
        </SectionHeaderActionButton>
      </SectionHeaderAction>

      <QuickLogModal
        open={editor?.mode === "create"}
        onClose={() => setEditor(null)}
        title="Log Caffeine"
        accent="var(--section-accent)"
      >
        <CaffeineQuickLog
          onDone={() => {
            setEditor(null);
            mutate();
          }}
        />
      </QuickLogModal>

      <LogEntryModal
        open={editor?.mode === "edit"}
        mode="edit"
        title="Edit Caffeine"
        schema={fieldSchema}
        initialValues={editorInitial}
        saving={saving}
        onClose={() => setEditor(null)}
        onSubmit={handleSave}
        onDelete={editor?.mode === "edit" ? () => handleDelete(editor.entry.id) : undefined}
      />

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">
            {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      {/* Two-column: overview (stats + charts) on the left, today's log on the right. */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* Today's summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard
              label="Sessions"
              value={day ? day.session_count : null}
              color={caffeineColor}
            />
            <StatCard
              label="Grams"
              value={day && day.total_g != null ? `${day.total_g}g` : day ? "—" : null}
              color={caffeineColor}
            />
            <StatCard
              label="Method"
              value={
                day
                  ? METHOD_ORDER.map((m) =>
                      day.methods[m] > 0 ? `${METHOD_LABEL[m].split(" ")[0]} ${day.methods[m]}` : "",
                    )
                      .filter(Boolean)
                      .join(" ") || "—"
                  : null
              }
              color={caffeineColor}
            />
          </div>

        {/* 30-day daily totals */}
        {dailyTotals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Last 30 days</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={chartConfig} className="h-[140px] w-full">
                <BarChart data={dailyTotals} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...X_AXIS_DATE} interval={3} />
                  <YAxis {...Y_AXIS} width={32} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} {...barAnim} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Time-of-day · last 90 days */}
        {hasAnySessions && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Time-of-day · last 90 days</CardTitle>
              <p className="text-xs text-muted-foreground">
                30-min buckets across sessions from the last 90 days.
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

        {/* Today's session log */}
        <div className="min-w-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : day && day.entries.length > 0 ? (
            <div className="space-y-2">
              {day.entries.map((entry) => {
                const detailParts: string[] = [];
                if (entry.grams != null) detailParts.push(`${entry.grams}g`);
                if (entry.beans) detailParts.push(entry.beans);
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
                    accent={caffeineColor}
                    time={entry.time.slice(0, 5)}
                    title={METHOD_LABEL[entry.method]}
                    details={detailParts.length > 0 ? `· ${detailParts.join(" · ")}` : undefined}
                    onClick={() => handleEdit(entry)}
                    actions={actions}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No caffeine logged today.</p>
          )}
        </div>
      </div>

    </>
  );
}
