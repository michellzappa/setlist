"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { LogEntryModal, type FieldSpec } from "@/components/log-entry-modal";
import { QuickLogModal } from "@/components/quick-log-modal";
import { GutQuickLog } from "@/components/quick-log-forms";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

import {
  addGutEntry,
  deleteGutEntry,
  getGutConfig,
  getGutDay,
  getGutHistory,
  updateGutEntry,
  type GutEntry,
} from "@/lib/api-gut";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { StatCard } from "@/components/stat-card";
import { LogRow, type TaskRowAction } from "@/components/tasks";
import {
  nowHHMM as currentTime,
} from "@/lib/date-utils";
import { CHART_GRID, WEEKDAY_X_AXIS, Y_AXIS } from "@/lib/chart-defaults";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { SECTION_ACCENT_STRONG } from "@/lib/section-colors";

const GUT_COLOR = "var(--section-accent)";
const BRISTOL_IDS = [1, 2, 3, 4, 5, 6, 7];
const BLOOD_IDS = [0, 1, 2];
const DISCOMFORT_LEVELS = [
  { id: "low", label: "Low" },
  { id: "med", label: "Med" },
  { id: "high", label: "High" },
] as const;

function discomfortLevelLabel(level: "low" | "med" | "high" | null | undefined): string | null {
  if (!level) return null;
  return DISCOMFORT_LEVELS.find((item) => item.id === level)?.label ?? level;
}

const chartConfig = {
  count: { label: "Count", color: GUT_COLOR },
  avg: { label: "Avg Bristol", color: GUT_COLOR },
  discomfort: { label: "Discomfort (h)", color: GUT_COLOR },
} satisfies ChartConfig;

function fmtDuration(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins === 0 ? `${whole}h` : `${whole}h ${mins}m`;
}

export function GutDashboard() {
  const [editor, setEditor] = useState<
    | { mode: "create" }
    | { mode: "edit"; entry: GutEntry }
    | null
  >(null);
  const [saving, setSaving] = useState(false);
  const { date: selectedDate } = useSelectedDate();

  const { data, error, isLoading, mutate } = useSWR(
    ["gut", selectedDate],
    async () => {
      const [d, c, h] = await Promise.all([
        getGutDay(selectedDate),
        getGutConfig(),
        getGutHistory(90),
      ]);
      return { day: d, config: c, history: h.daily };
    },
    { refreshInterval: 60_000 },
  );

  const day = data?.day ?? null;
  const config = data?.config ?? null;
  const history = data?.history ?? [];
  const loading = isLoading && !data;

  const bristolLabel = useCallback(
    (id: number) => config?.bristol.find((b) => b.id === id)?.label ?? `Type ${id}`,
    [config],
  );
  const bristolDesc = useCallback(
    (id: number) => config?.bristol.find((b) => b.id === id)?.description ?? "",
    [config],
  );
  const bloodLabel = useCallback(
    (id: number) => config?.blood.find((b) => b.id === id)?.label ?? `${id}`,
    [config],
  );

  const handleEdit = useCallback((entry: GutEntry) => {
    setEditor({ mode: "edit", entry });
  }, []);

  const handleSave = useCallback(
    async (values: Record<string, unknown>) => {
      if (saving) return;
      setSaving(true);
      try {
        const time = String(values.time ?? "");
        const bristol = Number(values.bristol ?? 4);
        const blood = Number(values.blood ?? 0);
        const levelRaw = values.discomfort_level;
        const discomfort_level: "low" | "med" | "high" | null =
          levelRaw === "low" || levelRaw === "med" || levelRaw === "high"
            ? levelRaw
            : null;
        const hoursRaw = String(values.discomfort_hours ?? "").trim();
        const hours = hoursRaw === "" ? null : Number(hoursRaw);
        const hoursPayload =
          hours == null || !Number.isFinite(hours) || hours < 0 ? null : hours;
        const noteRaw = String(values.note ?? "").trim();
        const payload = {
          time,
          bristol,
          blood,
          discomfort_level,
          discomfort_hours: hoursPayload,
          note: noteRaw || null,
        };
        if (editor?.mode === "edit") {
          await updateGutEntry(editor.entry.id, selectedDate, payload);
        } else {
          await addGutEntry({ date: selectedDate, ...payload });
        }
        setEditor(null);
        await mutate();
      } finally {
        setSaving(false);
      }
    },
    [selectedDate, editor, saving, mutate],
  );

  const handleDelete = useCallback(
    async (entryId: string) => {
      await deleteGutEntry(entryId, selectedDate);
      if (editor?.mode === "edit" && editor.entry.id === entryId) setEditor(null);
      await mutate();
    },
    [selectedDate, editor, mutate],
  );

  const fieldSchema: FieldSpec[] = useMemo(() => {
    const bristolOpts = BRISTOL_IDS.map((id) => ({
      value: id,
      label: `${id} ${config?.bristol.find((b) => b.id === id)?.label ?? `Type ${id}`}`,
      title: config?.bristol.find((b) => b.id === id)?.description ?? "",
    }));
    const bloodOpts = BLOOD_IDS.map((id) => ({
      value: id,
      label: `${id} · ${config?.blood.find((b) => b.id === id)?.label ?? id}`,
    }));
    return [
      { kind: "time", key: "time", label: "Time" },
      { kind: "chips", key: "bristol", label: "Bristol", options: bristolOpts, fill: false },
      { kind: "chips", key: "blood", label: "Blood", options: bloodOpts },
      {
        kind: "chips",
        key: "discomfort_level",
        label: "Discomfort amount",
        options: [
          { value: "", label: "None" },
          ...DISCOMFORT_LEVELS.map((l) => ({ value: l.id, label: l.label })),
        ],
      },
      {
        kind: "number",
        key: "discomfort_hours",
        label: "Discomfort (hours)",
        unit: "h",
        step: "0.25",
      },
      { kind: "textarea", key: "note", label: "Note", placeholder: "Note (optional)" },
    ];
  }, [config]);

  const editorOpen = editor !== null;
  const editorMode = editor?.mode ?? "create";
  const editorInitial = useMemo<Record<string, unknown>>(() => {
    if (editor?.mode === "edit") {
      const e = editor.entry;
      return {
        time: e.time.slice(0, 5),
        bristol: e.bristol,
        blood: e.blood,
        discomfort_level: e.discomfort_level ?? "",
        discomfort_hours:
          e.discomfort_hours != null && e.discomfort_hours > 0
            ? String(e.discomfort_hours)
            : "",
        note: e.note ?? "",
      };
    }
    return {
      time: currentTime(),
      bristol: 4,
      blood: 0,
      discomfort_level: "",
      discomfort_hours: "",
      note: "",
    };
  }, [editor]);

  // 90-day Bristol distribution. Aggregates bristol_counts across history if
  // available; falls back to today only when the backend hasn't backfilled
  // historical bristol_counts yet.
  const bristolHistogram = useMemo(() => {
    const counts = new Map<number, number>();
    for (const id of BRISTOL_IDS) counts.set(id, 0);
    let aggregated = false;
    for (const p of history) {
      const bc = p.bristol_counts;
      if (!bc) continue;
      aggregated = true;
      for (const [k, v] of Object.entries(bc)) {
        counts.set(Number(k), (counts.get(Number(k)) ?? 0) + v);
      }
    }
    if (!aggregated && day) {
      for (const [k, v] of Object.entries(day.bristol_counts)) {
        counts.set(Number(k), v);
      }
    }
    return BRISTOL_IDS.map((id) => ({
      id,
      label: `T${id}`,
      count: counts.get(id) ?? 0,
    }));
  }, [history, day]);

  const dailyMovements = useMemo(
    () => history.map((p) => ({ date: p.date, count: p.movements })),
    [history],
  );

  const avgBristolSeries = useMemo(
    () => history.filter((p) => p.avg_bristol != null).map((p) => ({ date: p.date, avg: p.avg_bristol! })),
    [history],
  );

  const discomfortSeries = useMemo(
    () => history.map((p) => ({ date: p.date, discomfort: p.discomfort_h })),
    [history],
  );

  const weeklyTotal = useMemo(() => {
    const last7 = history.slice(-7);
    return last7.reduce((s, p) => s + p.movements, 0);
  }, [history]);

  return (
    <>
      <SectionHeaderAction>
        <SectionHeaderActionButton color={GUT_COLOR} onClick={() => setEditor({ mode: "create" })}>
          + Log
        </SectionHeaderActionButton>
      </SectionHeaderAction>

      <QuickLogModal
        open={editor?.mode === "create"}
        onClose={() => setEditor(null)}
        title="Log Movement"
        accent="var(--section-accent)"
      >
        <GutQuickLog
          onDone={() => {
            setEditor(null);
            mutate();
          }}
        />
      </QuickLogModal>

      <LogEntryModal
        open={editor?.mode === "edit"}
        mode="edit"
        title="Edit Movement"
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


      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* Today's summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard
              label="Movements"
              value={day ? day.movement_count : null}
              color={GUT_COLOR}
            />
            <StatCard
              label="Blood"
              value={day ? bloodLabel(day.max_blood) : null}
              color={day && day.max_blood > 0 ? SECTION_ACCENT_STRONG : GUT_COLOR}
            />
            <StatCard
              label="Discomfort"
              value={day ? fmtDuration(day.total_discomfort_h || null) : null}
              color={GUT_COLOR}
            />
          </div>

          {/* Bristol distribution (today) */}
          <Card>
          <CardHeader className="pb-2">
            <CardTitle>Bristol Distribution · last 90 Days</CardTitle>
            <p className="text-xs text-muted-foreground">
              Count per Bristol type across the last 90 days.
            </p>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden px-4">
            <ChartContainer config={chartConfig} className="h-[140px] w-full">
              <BarChart data={bristolHistogram} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} allowDecimals={false} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* 30-day movements */}
        {dailyMovements.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Movements · last 30 Days</CardTitle>
              <p className="text-xs text-muted-foreground">
                Daily count. Last 7 days total{" "}
                <span className="font-semibold text-foreground">{weeklyTotal}</span>.
              </p>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={chartConfig} className="h-[140px] w-full">
                <BarChart data={dailyMovements} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={"preserveStartEnd" as const} />
                  <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Average Bristol over time */}
        {avgBristolSeries.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Average Bristol · last 90 Days</CardTitle>
              <p className="text-xs text-muted-foreground">
                Daily mean across movements. 4 is the ideal range.
              </p>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={chartConfig} className="h-[140px] w-full">
                <LineChart data={avgBristolSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={"preserveStartEnd" as const} />
                  <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} domain={[1, 7]} ticks={[1, 2, 3, 4, 5, 6, 7]} />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="var(--color-avg)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

          {/* Discomfort hours over time */}
          {discomfortSeries.some((p) => p.discomfort > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Discomfort · last 30 Days</CardTitle>
                <p className="text-xs text-muted-foreground">Daily discomfort hours.</p>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden px-4">
                <ChartContainer config={chartConfig} className="h-[140px] w-full">
                  <BarChart data={discomfortSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...CHART_GRID} />
                    <XAxis {...WEEKDAY_X_AXIS} interval={"preserveStartEnd" as const} />
                    <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} />
                    <Bar
                      dataKey="discomfort"
                      fill="var(--color-discomfort)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Today's log */}
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
                    confirm: "Delete this entry?",
                    onSelect: () => handleDelete(entry.id),
                  },
                ];
                const title = (
                  <span>
                    Bristol {entry.bristol}
                    <span className="ml-2 font-normal text-muted-foreground">
                      · {bristolLabel(entry.bristol)}
                    </span>
                    {entry.blood > 0 && (
                      <span className="ml-2 font-semibold" style={{ color: SECTION_ACCENT_STRONG }}>
                        · Blood: {bloodLabel(entry.blood)}
                      </span>
                    )}
                  </span>
                );
                const detailParts: string[] = [];
                if (entry.discomfort_hours != null && entry.discomfort_hours > 0) {
                  detailParts.push(`Discomfort ${fmtDuration(entry.discomfort_hours)}`);
                }
                if (entry.discomfort_level) {
                  detailParts.push(`Discomfort level: ${discomfortLevelLabel(entry.discomfort_level)}`);
                }
                return (
                  <LogRow
                    key={entry.id}
                    accent={GUT_COLOR}
                    time={entry.time.slice(0, 5)}
                    title={title}
                    details={detailParts.length > 0 ? `· ${detailParts.join(" · ")}` : undefined}
                    body={
                      entry.note ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{entry.note}</p>
                      ) : undefined
                    }
                    onClick={() => handleEdit(entry)}
                    actions={actions}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No movements logged today.</p>
          )}
        </div>
      </div>
    </>
  );
}
