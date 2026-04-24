"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { getEntries, type ExerciseEntry } from "@/lib/api";
import { useExerciseTaxonomy, type ExerciseKind } from "@/hooks/use-exercise-taxonomy";
import {
  EXERCISE_TONE_COLOR,
  SECTION_ACCENT,
  SECTION_ACCENT_SHADE_1,
  SECTION_ACCENT_SHADE_2,
  SECTION_ACCENT_SHADE_3,
} from "@/lib/section-colors";
import { cn } from "@/lib/utils";
import { lastSevenDaysISO } from "@/lib/date-utils";
import { CardTitle, CardDescription, CardHeader, CardContent } from "@/components/ui/card";

/** Last-7-days streak strip. Today is the rightmost dot, six days ago the
 *  leftmost. Each day is classified by what was trained — strength wins over
 *  cardio wins over mobility, mirroring the live exercise taxonomy. When all
 *  7 days have any activity, a section-accent capsule connects the dots. */

type DayKind = "strength" | "cardio" | "mobility" | "rest";

function classify(exercises: string[], classifyKind: (name: string | undefined | null) => ExerciseKind): DayKind {
  const groups = new Set<DayKind>();
  for (const ex of exercises) {
    if (!ex) continue;
    const kind = classifyKind(ex);
    if (kind === "core") continue;
    if (kind === "cardio") groups.add("cardio");
    else if (kind === "mobility") groups.add("mobility");
    else groups.add("strength");
  }
  // Priority: strength > cardio > mobility > rest. A day with both a strength
  // session and a cardio warmup counts as strength.
  if (groups.has("strength")) return "strength";
  if (groups.has("cardio")) return "cardio";
  if (groups.has("mobility")) return "mobility";
  return "rest";
}

// Background + border colors come from --section-accent-shade-{1,2,3} so
// they recolor automatically with the user's exercise section accent. Rest
// stays neutral. The arbitrary `[color:var(--…)]` syntax is the Tailwind v4
// way to pull a custom property into a utility class.
const KIND_DOT_CLASS: Record<DayKind, string> = {
  strength: "",
  cardio: "",
  mobility: "",
  rest: "bg-transparent border-muted-foreground/30",
};

const KIND_DOT_STYLE: Record<DayKind, CSSProperties | undefined> = {
  strength: { backgroundColor: SECTION_ACCENT_SHADE_1, borderColor: SECTION_ACCENT_SHADE_1 },
  cardio: { backgroundColor: SECTION_ACCENT_SHADE_2, borderColor: SECTION_ACCENT_SHADE_2 },
  mobility: { backgroundColor: SECTION_ACCENT_SHADE_3, borderColor: SECTION_ACCENT_SHADE_3 },
  rest: undefined,
};

const KIND_LABEL: Record<DayKind, string> = {
  strength: "Strength",
  cardio: "Cardio",
  mobility: "Mobility",
  rest: "Rest day",
};

export function WeekStreak() {
  const [entries, setEntries] = useState<ExerciseEntry[] | null>(null);
  const { classify: classifyKind } = useExerciseTaxonomy();

  useEffect(() => {
    let cancelled = false;
    getEntries()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { days, kinds, perfect, z2Minutes } = useMemo(() => {
    const days = lastSevenDaysISO();
    if (!entries) {
      return {
        days,
        kinds: days.map(() => "rest" as DayKind),
        perfect: false,
        z2Minutes: 0,
      };
    }
    const byDate = new Map<string, string[]>();
    const z2ByDate = new Map<string, number>();
    for (const e of entries) {
      if (!e.date || !e.exercise) continue;
      const bucket = byDate.get(e.date) ?? [];
      bucket.push(e.exercise);
      byDate.set(e.date, bucket);
      if (classifyKind(e.exercise) === "cardio" && typeof e.duration_min === "number") {
        z2ByDate.set(e.date, (z2ByDate.get(e.date) ?? 0) + e.duration_min);
      }
    }
    const kinds = days.map(({ iso }) => classify(byDate.get(iso) ?? [], classifyKind));
    const perfect = kinds.every((k) => k !== "rest");
    let z2Minutes = 0;
    for (const { iso } of days) z2Minutes += z2ByDate.get(iso) ?? 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const isActive = (iso: string) => classify(byDate.get(iso) ?? [], classifyKind) !== "rest";
    let graceUsed = false;
    const cursor = new Date(today);
    if (!isActive(toIso(cursor))) cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      const iso = toIso(cursor);
      if (!isActive(iso)) {
        if (!graceUsed) graceUsed = true;
        else break;
      }
      cursor.setDate(cursor.getDate() - 1);
      if (cursor.getFullYear() < 2020) break;
    }
    return { days, kinds, perfect, z2Minutes };
  }, [classifyKind, entries]);

  const activeCount = kinds.filter((k) => k !== "rest").length;
  const Z2_TARGET = 150;
  const z2Pct = Math.min(100, Math.round((z2Minutes / Z2_TARGET) * 100));
  const z2Hit = z2Minutes >= Z2_TARGET;

  return (
    <>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">This week</CardTitle>
            <CardDescription>
              {perfect
                ? "Perfect week — every day trained."
                : `${activeCount}/7 days trained in the last week.`}
            </CardDescription>
          </div>
          <Legend />
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-4 flex flex-col flex-1">
        <div className="relative">
          {perfect ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-[calc(50%+8px)] h-12 rounded-full"
              style={{
                // Soft glow behind the dots on a perfect week. Section
                // accent at three alpha levels — fill, ring, outer glow —
                // all derived from the same accent so changing the user's
                // exercise color recolours every layer in one shot.
                backgroundColor:
                  `color-mix(in oklab, ${SECTION_ACCENT} 15%, transparent)`,
                boxShadow:
                  `0 0 0 2px color-mix(in oklab, ${SECTION_ACCENT} 60%, transparent), 0 0 20px color-mix(in oklab, ${SECTION_ACCENT} 35%, transparent)`,
              }}
            />
          ) : null}
          <div className="relative grid grid-cols-7 gap-2">
            {days.map((day, i) => {
              const kind = kinds[i];
              return (
                <div key={day.iso} className="flex flex-col items-center gap-1">
                  <span className={cn("text-xs font-medium", day.isToday ? "text-foreground" : "text-muted-foreground")}>
                    {day.weekday}
                  </span>
                  <div
                    title={`${day.iso} — ${KIND_LABEL[kind]}`}
                    className={cn("h-9 w-9 rounded-full border-2 transition-all", KIND_DOT_CLASS[kind], day.isToday && "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background")}
                    style={KIND_DOT_STYLE[kind]}
                  />
                  <span className={cn("text-[10px] tabular-nums", day.isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {Number(day.iso.slice(8, 10))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-4 border-t pt-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-sm font-semibold">Z2 cardio</p>
              <p className="text-sm text-muted-foreground">Target 150 min/week for mitochondrial biogenesis</p>
            </div>
            <p className="text-sm tabular-nums">
              <span
                className="font-semibold"
                style={{ color: z2Hit ? SECTION_ACCENT_SHADE_1 : "var(--foreground)" }}
              >{Math.round(z2Minutes)}</span>
              <span className="text-muted-foreground"> / {Z2_TARGET} min</span>
            </p>
          </div>
          <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${z2Pct}%`,
                backgroundColor: z2Hit
                  ? SECTION_ACCENT_SHADE_2
                  : SECTION_ACCENT_SHADE_3,
              }}
            />
          </div>
        </div>
      </CardContent>
    </>
  );
}


function Legend() {
  return (
    <div className="hidden gap-3 text-xs text-muted-foreground sm:flex">
      <LegendDot shade={EXERCISE_TONE_COLOR.strength} label="Strength" />
      <LegendDot shade={EXERCISE_TONE_COLOR.cardio} label="Cardio" />
      <LegendDot shade={EXERCISE_TONE_COLOR.mobility} label="Mobility" />
    </div>
  );
}

function LegendDot({ shade, label }: { shade: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: shade }} />
      {label}
    </span>
  );
}
