"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import {
  getNutritionEntries,
  getNutritionStats,
  getSettings,
  saveSettings,
  type AppSettings,
  saveNutritionEntry,
  updateNutritionEntry,
  deleteNutritionEntry,
  type FastingWindow,
  type NutritionEntry,
  type NutritionPayload,
  type NutritionStats,
  type ProgressMode,
} from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeInput } from "@/components/time-input";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CHART_GRID } from "@/lib/chart-defaults";
import { showToast, showError } from "@/lib/toast";
import { todayLocalISO, daysAgoLocalISO, addDaysISO, nowHHMM, shortDate, formatWeekdayTick } from "@/lib/date-utils";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { computeFastingState, isBreakingFast, useFastingConfig } from "@/lib/fasting";
import { useMacroTargets, useMacroColors, useFastingTarget, useFiberTarget, progressTowardRange, useProgressMode, macroTileNumbers, type MacroKey, type MacroTarget } from "@/lib/macro-targets";
import { StatCard } from "@/components/stat-card";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { QuickLogModal } from "@/components/quick-log-modal";
import { NutritionQuickLog } from "@/components/quick-log-forms";
import { LogRow, type TaskRowAction } from "@/components/tasks";
import { LogEntryModal, type FieldSpec } from "@/components/log-entry-modal";

const NUTRITION_COLOR = "var(--section-accent)";

export function NutritionDashboard() {
  return <NutritionDashboardInner />;
}

function NutritionDashboardInner() {
  const { date: selectedDate } = useSelectedDate();
  // Fetch a 7-day window ending at the selected date — covers both the day's
  // cards and the RecentEntries list.
  const since = useMemo(() => {
    const t = todayLocalISO();
    const windowStart = addDaysISO(selectedDate, -7);
    return windowStart < daysAgoLocalISO(7) ? windowStart : daysAgoLocalISO(7);
  }, [selectedDate]);
  const { data, error, isLoading, mutate } = useSWR(
    ["nutrition", since, selectedDate],
    async () => {
      const [entries, stats] = await Promise.all([getNutritionEntries(since), getNutritionStats(30, selectedDate)]);
      return { entries, stats };
    },
    { refreshInterval: 60_000 },
  );
  const targets = useMacroTargets();
  const fiberTarget = useFiberTarget();
  const entries = data?.entries ?? [];
  const stats = data?.stats ?? null;
  const loading = isLoading && !data;
  const [celebrating, setCelebrating] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const { data: settings } = useSWR("settings", getSettings);
  const firstMealAnimationEnabled = settings?.animations?.first_meal ?? true;
  const progressMode = useProgressMode();
  const toggleProgressMode = () => {
    const next: ProgressMode = progressMode === "used" ? "left" : "used";
    globalMutate(
      "settings",
      (cur: AppSettings | undefined) =>
        cur ? { ...cur, nutrition: { ...(cur.nutrition ?? { macro_colors: {} as never }), progress_mode: next } } : cur,
      { revalidate: false },
    );
    saveSettings({ nutrition: { progress_mode: next } as never }).then(() => globalMutate("settings"));
  };

  const todayEntries = useMemo(
    () => entries.filter((e) => e.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)),
    [entries, selectedDate],
  );
  const todayProtein = useMemo(() => todayEntries.reduce((s, e) => s + (e.protein_g || 0), 0), [todayEntries]);
  const todayFat = useMemo(() => todayEntries.reduce((s, e) => s + (e.fat_g || 0), 0), [todayEntries]);
  const todayCarbs = useMemo(() => todayEntries.reduce((s, e) => s + (e.carbs_g || 0), 0), [todayEntries]);
  const todayKcal = useMemo(() => todayEntries.reduce((s, e) => s + (e.kcal || 0), 0), [todayEntries]);
  const todayFiber = useMemo(() => todayEntries.reduce((s, e) => s + (e.fiber_g || 0), 0), [todayEntries]);
  const recentEntries = useMemo(
    () => [...entries].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
    [entries],
  );

  // Targets are fixed ranges now — no more adaptive rolling averages.
  // See lib/macro-targets.ts for the single source of truth.

  const chartData = useMemo(
    () =>
      (stats?.daily ?? []).map((d) => ({
        date: d.date,
        protein: d.protein_g,
        fat: d.fat_g,
        carbs: d.carbs_g,
        fiber: d.fiber_g ?? 0,
        kcal: d.kcal,
      })),
    [stats],
  );

  return (
    <>
      <SectionHeaderAction>
        <SectionHeaderActionButton color={NUTRITION_COLOR} onClick={() => setLogOpen(true)}>
          + Log
        </SectionHeaderActionButton>
      </SectionHeaderAction>

      <QuickLogModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="Log Meal"
        accent={NUTRITION_COLOR}
      >
        <NutritionQuickLog onDone={() => setLogOpen(false)} />
      </QuickLogModal>

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      <div className="xl:grid xl:grid-cols-2 xl:gap-6 xl:items-start">
      <div>
      {!loading && (() => {
        const mode = progressMode;
        const tile = (consumed: number, t: typeof targets.protein) =>
          macroTileNumbers(consumed, t, mode);
        const p = tile(todayProtein, targets.protein);
        const f = tile(todayFat, targets.fat);
        const c = tile(todayCarbs, targets.carbs);
        const fi = tile(todayFiber, fiberTarget);
        const k = tile(todayKcal, targets.kcal);
        const round = (v: number | null) => (v == null ? null : Math.round(v));
        return (
        <div
          className="mb-6 grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-3 cursor-pointer select-none"
          onClick={toggleProgressMode}
          title={`Tap to switch to "${mode === "used" ? "left" : "used"}"`}
        >
        <StatCard
          label={mode === "left" ? "Protein left" : "Protein"}
          value={round(p.value)}
          unit="g"
          progress={p.progress}
          color={targets.protein.color}
        />
        <StatCard
          label={mode === "left" ? "Fat left" : "Fat"}
          value={round(f.value)}
          unit="g"
          progress={f.progress}
          color={targets.fat.color}
        />
        <StatCard
          label={mode === "left" ? "Carbs left" : "Carbs"}
          value={round(c.value)}
          unit="g"
          progress={c.progress}
          color={targets.carbs.color}
        />
        <StatCard
          label={mode === "left" ? "Fiber left" : "Fiber"}
          value={round(fi.value)}
          unit="g"
          progress={fi.progress}
          color={fiberTarget.color}
        />
        <StatCard
          label={mode === "left" ? "Kcal left" : "Kcal"}
          value={round(k.value)}
          progress={k.progress}
          color={targets.kcal.color}
        />
        <FastingStatCard stats={stats} />
        </div>
        );
      })()}

      {/* Macro + fasting charts */}
      {!loading && (
        <div className="mb-6 grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-3">
        <MacroChartCard macroKey="protein" dataKey="protein" chartData={chartData} />
        <MacroChartCard macroKey="fat" dataKey="fat" chartData={chartData} />
        <MacroChartCard macroKey="carbs" dataKey="carbs" chartData={chartData} />
        <FiberChartCard dataKey="fiber" chartData={chartData} />
        <MacroChartCard macroKey="kcal" dataKey="kcal" chartData={chartData} />
        <FastingCard stats={stats} />
        </div>
      )}
      </div>

      <div>
      <RecentEntriesList
        entries={recentEntries}
        fasting={stats?.fasting ?? []}
        daily={stats?.daily ?? []}
        loading={loading}
        todayMealCount={todayEntries.length}
        onDuplicated={() => mutate()}
        onBreakFast={() => {
          if (firstMealAnimationEnabled) setCelebrating(true);
        }}
      />
      </div>
      </div>


      {celebrating && <BreakFastCelebration onDone={() => setCelebrating(false)} />}
    </>
  );
}

// ── Break-fast celebration ────────────────────────────────────────────────────
// Fires when the user logs today's first meal/snack. Mirrors the post-exercise
// confetti style but scoped to a local overlay (no full-page takeover) and
// tinted with the fasting-chart's purple-to-green palette.

function BreakFastCelebration({ onDone }: { onDone: () => void }) {
  const particles = useMemo(() => {
    const colors = [NUTRITION_COLOR, NUTRITION_COLOR, "hsl(45,90%,55%)", NUTRITION_COLOR, "#ffedd5"];
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 2.0 + Math.random() * 1.6,
      drift: (Math.random() - 0.5) * 140,
      rotate: (Math.random() - 0.5) * 720,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 6 + Math.random() * 8,
    }));
  }, []);

  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <>
      <style>{`
        @keyframes breakfast-fall {
          0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rot)); opacity: 0; }
        }
        @keyframes breakfast-pop {
          0%   { transform: scale(0.6) translateY(8px); opacity: 0; }
          20%  { transform: scale(1.08) translateY(0); opacity: 1; }
          80%  { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(0.95) translateY(-4px); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute block rounded-sm"
            style={{
              left: `${p.left}vw`,
              top: 0,
              width: `${p.size}px`,
              height: `${p.size * 0.4}px`,
              backgroundColor: p.color,
              animation: `breakfast-fall ${p.duration}s ${p.delay}s cubic-bezier(.2,.6,.3,1) forwards`,
              ["--drift" as string]: `${p.drift}px`,
              ["--rot" as string]: `${p.rotate}deg`,
            }}
          />
        ))}
        <div
          className="absolute left-1/2 top-[34%] -translate-x-1/2 rounded-full border border-border bg-background/95 px-6 py-3 shadow-xl backdrop-blur"
          style={{ animation: "breakfast-pop 3s cubic-bezier(.2,.6,.3,1) forwards" }}
        >
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.25em]" style={{ color: NUTRITION_COLOR }}>
            Fast broken
          </p>
          <p className="mt-0.5 text-center text-lg font-semibold">🍽️ First meal logged</p>
        </div>
      </div>
    </>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

// ── Recent entries list ───────────────────────────────────────────────────────



function MiniMacroBar({ protein, fat, carbs, fiber, kcal, maxKcal = 1 }: { protein: number; fat: number; carbs: number; fiber: number; kcal: number; maxKcal?: number }) {
  const targets = useMacroTargets();
  const fiberTarget = useFiberTarget();
  const P = targets.protein.color;
  const F = targets.fat.color;
  const C = targets.carbs.color;
  const FB = fiberTarget.color;
  const proteinCal = protein * 4;
  const fatCal = fat * 9;
  const carbsCal = carbs * 4;
  const fiberCal = fiber * 2; // fiber ~2kcal/g
  const total = kcal || (proteinCal + fatCal + carbsCal + fiberCal);
  const w = total > 0 ? Math.max(4, Math.round((total / maxKcal) * 100)) : 4;
  if (total === 0) return <div className="h-2.5 w-1 shrink-0 rounded-full bg-muted" />;
  const pw = (proteinCal / total) * 100;
  const fw = (fatCal / total) * 100;
  const cw = (carbsCal / total) * 100;
  const fbw = (fiberCal / total) * 100;
  // Ensure fiber always gets at least 2px so it's visible
  const fbPx = fiber > 0 ? Math.max(2, Math.round((fiberCal / total) * w)) : 0;
  const macroW = w - fbPx;
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full"
      style={{ width: w, height: 10, minWidth: 4 }}
      title={`${Math.round(pw)}%P ${Math.round(fw)}%F ${Math.round(cw)}%C ${Math.round(fbw)}%Fb · ${Math.round(total)}kcal`}
    >
      <div className="flex h-full w-full">
        <div style={{ width: macroW > 0 ? macroW : 0, backgroundColor: P }} className="overflow-hidden">
          <div className="flex h-full">
            <div style={{ width: `${pw}%`, backgroundColor: P }} />
            <div style={{ width: `${fw}%`, backgroundColor: F }} />
            <div style={{ width: `${cw}%`, backgroundColor: C }} />
          </div>
        </div>
        {fiber > 0 && <div style={{ width: fbPx, backgroundColor: FB, minWidth: 2 }} />}
      </div>
    </div>
  );
}

function RecentEntriesList({ entries, fasting, loading, todayMealCount, onDuplicated, onBreakFast, daily }: {
  entries: NutritionEntry[];
  fasting: FastingWindow[];
  loading: boolean;
  daily: { date: string; protein_g: number; fat_g: number; carbs_g: number; kcal: number }[];
  todayMealCount: number;
  onDuplicated: () => void;
  onBreakFast: () => void;
}) {
  const fastingByDate = useMemo(() => {
    const m = new Map<string, FastingWindow>();
    for (const f of fasting) m.set(f.date, f);
    return m;
  }, [fasting]);
  const totalsByDate = useMemo(() => {
    const m = new Map<string, { protein: number; fat: number; carbs: number; fiber: number; kcal: number }>();
    for (const e of entries) {
      const t = m.get(e.date) ?? { protein: 0, fat: 0, carbs: 0, fiber: 0, kcal: 0 };
      t.protein += e.protein_g || 0;
      t.fat += e.fat_g || 0;
      t.carbs += e.carbs_g || 0;
      t.fiber += e.fiber_g || 0;
      t.kcal += e.kcal || 0;
      m.set(e.date, t);
    }
    return m;
  }, [entries]);
  const maxMealKcal = entries.length > 0 ? Math.max(...entries.map(e => e.kcal || 0)) : 1;
  const targets = useMacroTargets();
  const fiberTarget = useFiberTarget();
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [editingEntry, setEditingEntry] = useState<NutritionEntry | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(e: NutritionEntry) {
    setEditingEntry(e);
  }

  function cancelEdit() {
    setEditingEntry(null);
  }

  const editorSchema: FieldSpec[] = useMemo(
    () => [
      {
        kind: "row",
        fields: [
          { kind: "time", key: "time", label: "Time" },
          { kind: "text", key: "emoji", label: "Emoji" },
        ],
      },
      {
        kind: "list",
        key: "foods",
        label: "Foods",
        rows: 4,
        hint: "First line is the title; following lines are ingredients/details.",
      },
      {
        kind: "row",
        fields: [
          { kind: "number", key: "protein_g", label: "Protein", unit: "g" },
          { kind: "number", key: "fat_g", label: "Fat", unit: "g" },
        ],
      },
      {
        kind: "row",
        fields: [
          { kind: "number", key: "carbs_g", label: "Carbs", unit: "g" },
          { kind: "number", key: "fiber_g", label: "Fiber", unit: "g" },
        ],
      },
      { kind: "number", key: "kcal", label: "Kcal" },
    ],
    [],
  );

  const editorInitial = useMemo<Record<string, unknown>>(() => {
    const e = editingEntry;
    if (!e) return {};
    return {
      time: e.time,
      emoji: e.emoji ?? "",
      foods: e.foods ?? [],
      protein_g: String(e.protein_g ?? 0),
      fat_g: String(e.fat_g ?? 0),
      carbs_g: String(e.carbs_g ?? 0),
      fiber_g: String(e.fiber_g ?? 0),
      kcal: String(e.kcal ?? 0),
    };
  }, [editingEntry]);

  async function saveEdit(values: Record<string, unknown>) {
    const e = editingEntry;
    if (!e) return;
    const file = e.file;
    setModalSaving(true);
    setSaving((p) => new Set(p).add(file));
    setError(null);
    try {
      const foods = (values.foods as string[]).map((s) => s.trim()).filter(Boolean);
      const num = (k: string) => Number(values[k] ?? 0) || 0;
      const payload: NutritionPayload & { file: string } = {
        date: e.date,
        time: String(values.time ?? ""),
        emoji: String(values.emoji ?? ""),
        foods,
        protein_g: num("protein_g"),
        fat_g: num("fat_g"),
        carbs_g: num("carbs_g"),
        fiber_g: num("fiber_g"),
        kcal: num("kcal"),
        file,
      };
      await updateNutritionEntry(payload);
      setEditingEntry(null);
      onDuplicated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setModalSaving(false);
      setSaving((p) => { const n = new Set(p); n.delete(file); return n; });
    }
  }

  async function deleteEntry(file: string) {
    setSaving((p) => new Set(p).add(file));
    setError(null);
    try {
      await deleteNutritionEntry(file);
      if (editingEntry?.file === file) cancelEdit();
      onDuplicated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving((p) => { const n = new Set(p); n.delete(file); return n; });
    }
  }

  async function duplicate(entry: NutritionEntry) {
    if (saving.has(entry.file)) return;
    // Capture BEFORE the save — after `onDuplicated()` the parent refetches
    // and todayMealCount will already include this new entry.
    const targetDate = todayLocalISO();
    const willBreakFast = isBreakingFast(todayMealCount, targetDate);
    setSaving((p) => new Set(p).add(entry.file));
    setError(null);
    try {
      await saveNutritionEntry({
        date: targetDate,
        time: nowHHMM(),
        emoji: entry.emoji || "",
        protein_g: entry.protein_g,
        fat_g: entry.fat_g ?? 0,
        carbs_g: entry.carbs_g ?? 0,
        fiber_g: entry.fiber_g ?? 0,
        kcal: entry.kcal ?? 0,
        foods: entry.foods,
      });
      onDuplicated();
      showToast("Logged again", { description: entry.foods[0] });
      if (willBreakFast) onBreakFast();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Duplicate failed";
      setError(msg);
      showError(msg);
    } finally {
      setSaving((p) => { const n = new Set(p); n.delete(entry.file); return n; });
    }
  }

  const today = todayLocalISO();
  return (
    <div>
        <LogEntryModal
          open={editingEntry !== null}
          mode="edit"
          title="Edit Entry"
          schema={editorSchema}
          initialValues={editorInitial}
          saving={modalSaving}
          canSubmit={(v) => Array.isArray(v.foods) && (v.foods as string[]).some((s) => s.trim())}
          onClose={cancelEdit}
          onSubmit={saveEdit}
          onDelete={editingEntry ? () => deleteEntry(editingEntry.file) : undefined}
        />
        {error && <p className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet — log a meal via chat to get started.</p>
        ) : (
          <>
          <ul className="space-y-2">
            {entries.reduce<React.ReactNode[]>((rows, e, i) => {
              const prev = entries[i - 1];
              if (prev && prev.date === today && e.date !== today) {
                const fast = fastingByDate.get(today);
                if (fast) rows.push(<FastingGap key={`fast-${today}`} fast={fast} />);
              }
              if (e.date !== today && !showAll) {
                return rows;
              }
              const isPending = saving.has(e.file);

              const actions: TaskRowAction[] = [
                { label: "Edit", onSelect: () => startEdit(e) },
                { label: "Duplicate to today", onSelect: () => duplicate(e) },
                {
                  label: "Delete",
                  tone: "destructive",
                  confirm: "Delete this entry?",
                  onSelect: () => deleteEntry(e.file),
                },
              ];

              rows.push(
                <li key={e.file} className="py-0">
                  {(
                    <LogRow
                      accent={NUTRITION_COLOR}
                      emoji={e.emoji?.trim()}
                      title={e.foods[0]}
                      time={e.time || e.date}
                      onClick={() => startEdit(e)}
                      pending={isPending}
                      actions={actions}
                      body={
                        <>
                          {e.foods.length > 1 && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{e.foods.slice(1).join(" · ")}</p>
                          )}
                          <div className="mt-1 flex items-center gap-2 text-sm font-semibold tabular-nums">
                            <MiniMacroBar protein={e.protein_g} fat={e.fat_g} carbs={e.carbs_g || 0} fiber={e.fiber_g || 0} kcal={e.kcal} maxKcal={maxMealKcal} />
                            <span style={{ color: targets.protein.color }}>{Math.round(e.protein_g)}P</span>
                            <span className="text-muted-foreground/50"> · </span>
                            <span style={{ color: targets.fat.color }}>{Math.round(e.fat_g)}F</span>
                            <span className="text-muted-foreground/50"> · </span>
                            <span style={{ color: targets.carbs.color }}>{Math.round(e.carbs_g || 0)}C</span>
                            <span className="text-muted-foreground/50"> · </span>
                            <span style={{ color: fiberTarget.color }}>{Math.round(e.fiber_g || 0)}Fb</span>
                            <span className="text-muted-foreground/50"> · </span>
                            <span style={{ color: targets.kcal.color }}>{Math.round(e.kcal)}kcal</span>
                          </div>
                        </>
                      }
                    />
                  )}
                </li>,
              );
              return rows;
            }, [])}
          </ul>
          {!showAll && entries.some((e) => e.date !== today) && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 w-full rounded-md py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              See all ({entries.length})
            </button>
          )}
          </>
        )}
    </div>
  );
}

// ── Fasting gap row ───────────────────────────────────────────────────────────
// Rendered between day separators in the entry list — the window from the
// previous day's last eating event to the current day's first one. Uses the
// same colour thresholds as the Fasting chart so the two agree visually.

function FastingGap({ fast }: { fast: FastingWindow }) {
  const macroColors = useMacroColors();
  const accent = macroColors.fasting;
  if (fast.hours == null) {
    if (fast.note === "gap") {
      return (
        <li className="py-0">
          <LogRow accent={accent} emoji="⏳" title={<span style={{ color: accent }}>Incomplete logs</span>} />
        </li>
      );
    }
    return null;
  }
  const totalMin = Math.round(fast.hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const label = m === 0 ? `${h}h fasted` : `${h}h ${m}m fasted`;
  return (
    <li className="py-0">
      <LogRow
        accent={accent}
        emoji="⏳"
        title={<span className="tabular-nums" style={{ color: accent }}>{label}</span>}
      />
    </li>
  );
}

// ── Macro chart card ──────────────────────────────────────────────────────────
// One card per macro (protein / fat / carbs / kcal). The dashed band between
// min and max is the target range; bars above the max are "over" rather than
// "wrong" — we don't penalise within-band variation.

function MacroChartCard({
  macroKey,
  dataKey,
  chartData,
}: {
  macroKey: MacroKey;
  dataKey: "protein" | "fat" | "carbs" | "kcal";
  chartData: { date: string; protein: number; fat: number; carbs: number; kcal: number }[];
}) {
  const targets = useMacroTargets();
  const target = targets[macroKey];
  const unit = target.unit;
  // Leave headroom above max so bars near the top of the range don't touch
  // the chart ceiling. 1.2× max covers typical overshoot.
  const yMax = Math.ceil(target.max * 1.2);
  const data = chartData.slice(-7);
  const barAnim = useBarAnimation();
  // Exclude today from the average — the day is incomplete (user may still
  // be fasting or mid-eating-window), so including it skews the mean low.
  const today = todayLocalISO();
  const avgData = data.filter((d) => d.date !== today);
  const avg = avgData.length > 0 ? Math.round(avgData.reduce((s, d) => s + (d[dataKey] as number), 0) / avgData.length) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{target.label}</CardTitle>
        <CardDescription>
          {avg > 0 && (() => {
            const mid = (target.min + target.max) / 2;
            const delta = avg - mid;
            const sign = delta > 0 ? "+" : "";
            return <span style={{ color: target.color }}>{sign}{delta}{unit} vs target</span>;
          })()}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ChartContainer
          config={{ [dataKey]: { label: `${target.label}${unit ? ` (${unit})` : ""}`, color: target.color } }}
          className="h-[130px] w-full overflow-hidden"
        >
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0} fontSize={11}
              tickFormatter={(v: string) => formatWeekdayTick(v).charAt(0)} />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, yMax]}
              width={unit === "g" ? 36 : 40}
              fontSize={11}
              tickFormatter={(v: number) => `${v}${unit}`}
            />
            <ReferenceArea y1={target.min} y2={target.max} fill={target.color} fillOpacity={0.12} stroke="none" />
            <ReferenceLine y={target.min} stroke={target.color} strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={target.max} stroke={target.color} strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={avg} stroke={target.color} strokeOpacity={0.8} strokeWidth={2} />

            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={22} {...barAnim}>
              {data.map((d, i) => {
                const v = d[dataKey] as number;
                // Under min → muted, in band → primary, over max → primary but
                // readable as "over".
                const color =
                  v === 0 ? "hsl(220,10%,88%)"
                  : v < target.min ? `${target.color}`
                  : target.color;
                const opacity = v === 0 ? 1 : v < target.min ? 0.55 : 1;
                return <Cell key={i} fill={color} fillOpacity={opacity} />;
              })}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ── Fasting window chart ──────────────────────────────────────────────────────



// ── Hours fasted stat card ───────────────────────────────────────────────────

function FastingStatCard({ stats }: { stats: NutritionStats | null }) {
  const fastingTarget = useFastingTarget();
  const fastingConfig = useFastingConfig();
  const macroColors = useMacroColors();
  const nutritionColor = macroColors.fasting;
  const today = todayLocalISO();
  const todayFast = (stats?.fasting ?? []).find((f) => f.date === today);
  const fastHours = todayFast?.hours;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const fastingState = useMemo(() => computeFastingState(stats ?? null, fastingConfig), [stats, tick, fastingConfig]);
  const liveHours = fastingState.state === "fasting" ? fastingState.totalMin / 60 : null;
  const displayHours = liveHours ?? fastHours;
  const midpoint = (fastingTarget.min + fastingTarget.max) / 2;
  const progress = displayHours != null ? Math.min(1, displayHours / midpoint) : undefined;

  return (
    <StatCard
      label="Fasting"
      value={displayHours != null ? displayHours.toFixed(1) : null}
      unit="h"
      progress={progress}
      color={nutritionColor}
    />
  );
}


function FiberChartCard({
  dataKey,
  chartData,
}: {
  dataKey: "fiber";
  chartData: { date: string; protein: number; fat: number; carbs: number; fiber: number; kcal: number }[];
}) {
  const target = useFiberTarget();
  const unit = target.unit;
  const yMax = Math.ceil(target.max * 1.2);
  const data = chartData.slice(-7);
  const barAnim = useBarAnimation();
  const today = todayLocalISO();
  const avgData = data.filter((d) => d.date !== today);
  const avg = avgData.length > 0 ? Math.round(avgData.reduce((s, d) => s + (d[dataKey] as number), 0) / avgData.length) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{target.label}</CardTitle>
        <CardDescription>
          {avg > 0 && (() => {
            const mid = (target.min + target.max) / 2;
            const delta = avg - mid;
            const sign = delta > 0 ? "+" : "";
            return <span style={{ color: target.color }}>{sign}{delta}{unit} vs target</span>;
          })()}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ChartContainer
          config={{ [dataKey]: { label: `${target.label} (${unit})`, color: target.color } }}
          className="h-[130px] w-full overflow-hidden"
        >
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0} fontSize={11}
              tickFormatter={(v: string) => formatWeekdayTick(v).charAt(0)} />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, yMax]}
              width={36}
              fontSize={11}
              tickFormatter={(v: number) => `${v}${unit}`}
            />
            <ReferenceArea y1={target.min} y2={target.max} fill={target.color} fillOpacity={0.12} stroke="none" />
            <ReferenceLine y={target.min} stroke={target.color} strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={target.max} stroke={target.color} strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={avg} stroke={target.color} strokeOpacity={0.8} strokeWidth={2} />

            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={22} {...barAnim}>
              {data.map((d, i) => {
                const v = d.fiber as number;
                const color =
                  v === 0 ? "hsl(220,10%,88%)"
                  : v < target.min ? `${target.color}`
                  : target.color;
                const opacity = v === 0 ? 1 : v < target.min ? 0.55 : 1;
                return <Cell key={i} fill={color} fillOpacity={opacity} />;
              })}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}


function FastingCard({ stats }: { stats: NutritionStats | null }) {
  const barAnim = useBarAnimation();
  const fastingTarget = useFastingTarget();
  const fastingConfig = useFastingConfig();
  const macroColors = useMacroColors();
  const nutritionColor = macroColors.fasting;
  const today = todayLocalISO();

  // Build chart data from historical fasting windows, tagging today's entry.
  const rawData = useMemo(
    () =>
      (stats?.fasting ?? []).map((f) => ({
        date: f.date,
        metric: f.hours ?? (f.note === "gap" ? 0.3 : 0),
        hasData: f.hours != null,
        isGap: f.note === "gap",
        rawHours: f.hours,
        isToday: f.date === today,
        isLive: false,
      })),
    [stats, today],
  );

  // Inject live creeping bar for today when actively fasting.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fastingState = useMemo(() => computeFastingState(stats ?? null, fastingConfig), [stats, tick, fastingConfig]);

  const chartData = useMemo(() => {
    const data = [...rawData];
    if (fastingState.state === "fasting") {
      const liveHours = fastingState.totalMin / 60;
      const todayIdx = data.findIndex((d) => d.date === today);
      if (todayIdx >= 0) {
        // Replace today's bar with live creeping value.
        data[todayIdx] = { ...data[todayIdx], metric: liveHours, hasData: true, isLive: true };
      } else {
        // Append today's live bar.
        data.push({ date: today, metric: liveHours, hasData: true, isGap: false, rawHours: null, isToday: true, isLive: true });
      }
    }
    return data;
  }, [rawData, fastingState, today]);

  const fastingChartConfig = { metric: { label: "Fasting hours", color: nutritionColor } } satisfies ChartConfig;
  const avg7d = useMemo(() => {
    const d = chartData.slice(-7).filter((x: any) => x.hasData && !x.isGap && !x.isToday && !x.isLive);
    return d.length ? +(d.reduce((s: number, x: any) => s + x.metric, 0) / d.length).toFixed(1) : 0;
  }, [chartData]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Fasting</CardTitle>
        <CardDescription>
          {avg7d > 0 && (() => {
            const mid = (fastingTarget.min + fastingTarget.max) / 2;
            const delta = +(avg7d - mid).toFixed(1);
            const sign = delta > 0 ? "+" : "";
            return <span style={{ color: nutritionColor }}>{sign}{delta}h vs target</span>;
          })()}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ChartContainer config={fastingChartConfig} className="h-[130px] w-full overflow-hidden">
          <BarChart data={chartData.slice(-7)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0} fontSize={11}
              tickFormatter={(v: string) => formatWeekdayTick(v).charAt(0)} />
            <YAxis tickLine={false} axisLine={false} domain={[0, Math.ceil(fastingTarget.max / 0.85)]} width={36} fontSize={11} tickFormatter={(v: number) => `${v}h`} />
            <ReferenceArea y1={fastingTarget.min} y2={fastingTarget.max} fill={nutritionColor} fillOpacity={0.12} stroke="none" />
            <ReferenceLine y={fastingTarget.min} stroke={nutritionColor} strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={fastingTarget.max} stroke={nutritionColor} strokeDasharray="4 4" strokeOpacity={0.6} />
            {avg7d > 0 && <ReferenceLine y={avg7d} stroke={nutritionColor} strokeOpacity={0.8} strokeWidth={2} />}
            <Tooltip
              cursor={false}
              contentStyle={{ fontSize: 12 }}
              formatter={(value, _name, item) => {
                const p = (item as { payload?: { rawHours: number | null; isGap: boolean; isLive: boolean; metric: number } }).payload;
                if (!p) return ["—", ""];
                if (p.isLive) return [`${Number(value).toFixed(1)}h`, "Live — creeping up"];
                if (p.isGap) return ["—", "Incomplete logs"];
                if (p.rawHours == null) return ["—", "No data"];
                return [`${Number(value).toFixed(1)}h`, `${p.rawHours}h fasted`];
              }}
            />
            <Bar dataKey="metric" radius={[4, 4, 0, 0]} maxBarSize={22} {...barAnim}>
              {chartData.slice(-7).map((d, i) => {
                const v = d.metric;
                const hasData = d.hasData && !d.isGap;
                const color = hasData ? nutritionColor : "hsl(220,10%,88%)";
                const opacity = !hasData ? 1 : v >= fastingTarget.min ? 1 : 0.55;
                return <Cell key={i} fill={color} fillOpacity={opacity} />;
              })}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export default NutritionDashboard;
