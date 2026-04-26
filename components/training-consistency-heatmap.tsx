"use client";

import { useMemo } from "react";

import type { ExerciseEntry } from "@/lib/api";
import { addDaysISO, formatDateWeekday, relativeDayLabel } from "@/lib/date-utils";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  SECTION_ACCENT_SHADE_1,
  SECTION_ACCENT_SHADE_2,
  SECTION_ACCENT_SHADE_3,
  SECTION_ACCENT_SOFT,
} from "@/lib/section-colors";

const HEATMAP_WEEKS = 20;
const DAYS_PER_WEEK = 7;
const TOTAL_DAYS = HEATMAP_WEEKS * DAYS_PER_WEEK;
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

type DayCell = {
  iso: string;
  count: number;
  exerciseCount: number;
  sessionCount: number;
  isToday: boolean;
};

function mondayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return (day + 6) % 7;
}

function intensityStyle(count: number) {
  if (count <= 0) {
    return {
      backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)",
      borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
    };
  }
  if (count === 1) {
    return {
      backgroundColor: `color-mix(in oklab, ${SECTION_ACCENT_SOFT} 70%, var(--background))`,
      borderColor: `color-mix(in oklab, ${SECTION_ACCENT_SHADE_3} 55%, var(--border))`,
    };
  }
  if (count === 2) {
    return {
      backgroundColor: `color-mix(in oklab, ${SECTION_ACCENT_SHADE_3} 72%, var(--background))`,
      borderColor: `color-mix(in oklab, ${SECTION_ACCENT_SHADE_2} 55%, var(--border))`,
    };
  }
  if (count === 3) {
    return {
      backgroundColor: `color-mix(in oklab, ${SECTION_ACCENT_SHADE_2} 84%, var(--background))`,
      borderColor: `color-mix(in oklab, ${SECTION_ACCENT_SHADE_2} 78%, var(--border))`,
    };
  }
  return {
    backgroundColor: SECTION_ACCENT_SHADE_1,
    borderColor: SECTION_ACCENT_SHADE_1,
  };
}

function legendStyle(level: number) {
  return intensityStyle(level);
}

export function TrainingConsistencyHeatmap({
  entries,
  endDate,
}: {
  entries: ExerciseEntry[];
  endDate: string;
}) {
  const startDate = useMemo(() => addDaysISO(endDate, -(TOTAL_DAYS - 1)), [endDate]);

  const summary = useMemo(() => {
    const byDate = new Map<string, { entries: number; exercises: Set<string>; sessions: Set<string> }>();

    for (const entry of entries) {
      if (!entry.date || entry.date < startDate || entry.date > endDate) continue;
      const bucket = byDate.get(entry.date) ?? {
        entries: 0,
        exercises: new Set<string>(),
        sessions: new Set<string>(),
      };
      bucket.entries += 1;
      if (entry.exercise) bucket.exercises.add(entry.exercise);
      bucket.sessions.add(entry.concluded_at || `${entry.date}:${entry.session || "session"}`);
      byDate.set(entry.date, bucket);
    }

    const cells: DayCell[] = [];
    for (let index = 0; index < TOTAL_DAYS; index += 1) {
      const iso = addDaysISO(startDate, index);
      const bucket = byDate.get(iso);
      cells.push({
        iso,
        count: bucket?.entries ?? 0,
        exerciseCount: bucket?.exercises.size ?? 0,
        sessionCount: bucket?.sessions.size ?? 0,
        isToday: iso === endDate,
      });
    }

    const rows: DayCell[][] = Array.from({ length: DAYS_PER_WEEK }, () => []);
    for (const cell of cells) {
      rows[mondayIndex(cell.iso)]!.push(cell);
    }

    const activeDays = cells.filter((cell) => cell.count > 0).length;
    const totalEntries = cells.reduce((sum, cell) => sum + cell.count, 0);
    const longestStreak = (() => {
      let best = 0;
      let current = 0;
      for (const cell of cells) {
        if (cell.count > 0) {
          current += 1;
          best = Math.max(best, current);
        } else {
          current = 0;
        }
      }
      return best;
    })();
    const currentStreak = (() => {
      let streak = 0;
      for (let index = cells.length - 1; index >= 0; index -= 1) {
        if (cells[index]!.count > 0) streak += 1;
        else break;
      }
      return streak;
    })();

    return { rows, activeDays, totalEntries, longestStreak, currentStreak };
  }, [endDate, entries, startDate]);

  return (
    <>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Training consistency</CardTitle>
            <CardDescription>
              {summary.activeDays} active days over the last {HEATMAP_WEEKS} weeks
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums" style={{ color: SECTION_ACCENT_SHADE_1 }}>
              {Math.round((summary.activeDays / TOTAL_DAYS) * 100)}%
            </p>
            <p className="text-xs text-muted-foreground">days trained</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="grid items-start gap-x-2 gap-y-1.5 overflow-x-auto"
          style={{ gridTemplateColumns: `auto repeat(${HEATMAP_WEEKS}, 1rem)` }}
        >
          {WEEKDAY_LABELS.map((label, rowIndex) => (
            <div key={`label-${rowIndex}`} className="contents">
              <div className="flex h-4 items-center justify-end pr-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {label}
              </div>
              {summary.rows[rowIndex]!.map((cell) => {
                const style = intensityStyle(cell.count);
                const pluralEntries = cell.count === 1 ? "entry" : "entries";
                const pluralExercises = cell.exerciseCount === 1 ? "exercise" : "exercises";
                const pluralSessions = cell.sessionCount === 1 ? "session" : "sessions";
                return (
                  <div
                    key={cell.iso}
                    title={`${formatDateWeekday(cell.iso)} · ${cell.count} ${pluralEntries} · ${cell.exerciseCount} ${pluralExercises} · ${cell.sessionCount} ${pluralSessions}`}
                    className={cn(
                      "h-4 w-4 rounded-[4px] border transition-transform",
                      cell.isToday && "ring-2 ring-[color:var(--section-accent)] ring-offset-2 ring-offset-background",
                    )}
                    style={style}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-baseline gap-3">
            <span>{HEATMAP_WEEKS} weeks ago</span>
            <span className="tabular-nums" style={{ color: SECTION_ACCENT_SHADE_2 }}>
              {summary.totalEntries} entries
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <span
                key={level}
                className="h-3 w-3 rounded-[3px] border"
                style={legendStyle(level)}
              />
            ))}
            <span>more</span>
          </div>
          <span>{relativeDayLabel(endDate).toLowerCase()}</span>
        </div>

        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 px-3 py-2">
            <span className="block uppercase tracking-[0.2em]">Current streak</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums text-foreground">
              {summary.currentStreak} days
            </span>
          </div>
          <div className="rounded-xl border border-border/70 px-3 py-2">
            <span className="block uppercase tracking-[0.2em]">Best run</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums" style={{ color: SECTION_ACCENT_SHADE_1 }}>
              {summary.longestStreak} days
            </span>
          </div>
        </div>
      </CardContent>
    </>
  );
}
