"use client";

import Link from "next/link";
import useSWR from "swr";
import { useSections } from "@/hooks/use-sections";
import {
  getCardioHistory,
  getNutritionStats,
  getHabitHistory,
  getSupplementHistory,
  getCannabisHistory,
  getCaffeineHistory,
  getChoreHistory,
  getTaskHistory,
  getGroceryHistory,
  getAirHistory,
} from "@/lib/api";
import { getGutHistory } from "@/lib/api-gut";
import type { SectionMeta } from "@/lib/api";
import type { SectionKey } from "@/lib/sections";

type StripRow = {
  headline: string;
  bars: number[]; // length 7, padded with zeros for missing days
};

type Adapter = () => Promise<StripRow>;
type StripSectionKey = Extract<
  SectionKey,
  | "training"
  | "nutrition"
  | "habits"
  | "supplements"
  | "cannabis"
  | "caffeine"
  | "chores"
  | "tasks"
  | "groceries"
  | "gut"
  | "air"
>;

function tail7<T>(arr: T[] | undefined): T[] {
  return (arr ?? []).slice(-7);
}

function pad7(values: number[]): number[] {
  if (values.length >= 7) return values.slice(-7);
  return [...Array(7 - values.length).fill(0), ...values];
}

const ADAPTERS: Partial<Record<StripSectionKey, Adapter>> = {
  training: async () => {
    const r = await getCardioHistory(7);
    const daily = tail7(r.daily);
    const total = daily.reduce((a, d) => a + (d.minutes ?? 0), 0);
    return { headline: `${Math.round(total)} min`, bars: pad7(daily.map((d) => d.minutes ?? 0)) };
  },
  nutrition: async () => {
    const r = await getNutritionStats(7);
    const daily = tail7(r.daily);
    return {
      headline: `${Math.round(r.avg_kcal ?? 0).toLocaleString()} kcal`,
      bars: pad7(daily.map((d) => d.kcal ?? 0)),
    };
  },
  habits: async () => {
    const r = await getHabitHistory(7);
    const daily = tail7(r.daily);
    const avg = daily.length ? daily.reduce((a, d) => a + (d.percent ?? 0), 0) / daily.length : 0;
    return { headline: `${Math.round(avg)}%`, bars: pad7(daily.map((d) => d.percent ?? 0)) };
  },
  supplements: async () => {
    const r = await getSupplementHistory(7);
    const daily = tail7(r.daily);
    const sum = daily.reduce((a, d) => a + (d.done ?? 0), 0);
    return { headline: `${sum} taken`, bars: pad7(daily.map((d) => d.done ?? 0)) };
  },
  cannabis: async () => {
    const r = await getCannabisHistory(7);
    const daily = tail7(r.daily);
    const sum = daily.reduce((a, d) => a + (d.sessions ?? 0), 0);
    return { headline: `${sum} sessions`, bars: pad7(daily.map((d) => d.sessions ?? 0)) };
  },
  caffeine: async () => {
    const r = await getCaffeineHistory(7);
    const daily = tail7(r.daily);
    const sum = daily.reduce((a, d) => a + (d.sessions ?? 0), 0);
    return { headline: `${sum} sessions`, bars: pad7(daily.map((d) => d.sessions ?? 0)) };
  },
  chores: async () => {
    const r = await getChoreHistory(7);
    const daily = tail7(r.daily);
    const sum = daily.reduce((a, d) => a + (d.completed ?? 0), 0);
    return { headline: `${sum} done`, bars: pad7(daily.map((d) => d.completed ?? 0)) };
  },
  tasks: async () => {
    const r = await getTaskHistory(7);
    const daily = tail7(r.daily);
    const sum = daily.reduce((a, d) => a + (d.done ?? 0), 0);
    return { headline: `${sum} done`, bars: pad7(daily.map((d) => d.done ?? 0)) };
  },
  groceries: async () => {
    const r = await getGroceryHistory(7);
    const daily = tail7(r.daily);
    const sum = daily.reduce((a, d) => a + (d.bought ?? 0), 0);
    return { headline: `${sum} bought`, bars: pad7(daily.map((d) => d.bought ?? 0)) };
  },
  gut: async () => {
    const r = await getGutHistory(7);
    const daily = tail7(r.daily);
    const sum = daily.reduce((a, d) => a + (d.movements ?? 0), 0);
    return { headline: `${sum} mov`, bars: pad7(daily.map((d) => d.movements ?? 0)) };
  },
  air: async () => {
    const r = await getAirHistory(7);
    const daily = tail7(r.daily);
    const last = daily.length ? daily[daily.length - 1] : null;
    const co2 = last?.co2_avg ?? null;
    return {
      headline: co2 != null ? `${Math.round(co2)} ppm` : "—",
      bars: pad7(daily.map((d) => d.co2_avg ?? 0)),
    };
  },
};

function isStripSectionKey(key: string): key is StripSectionKey {
  return key in ADAPTERS;
}

function Sparkline({ bars, color }: { bars: number[]; color: string }) {
  const max = Math.max(1, ...bars);
  const w = 96;
  const h = 24;
  const gap = 2;
  const barW = (w - gap * (bars.length - 1)) / bars.length;
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      {bars.map((v, i) => {
        const bh = max > 0 ? Math.max(1, (v / max) * h) : 1;
        const x = i * (barW + gap);
        const y = h - bh;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={bh}
            rx={1}
            fill={color}
            opacity={v > 0 ? 0.85 : 0.2}
          />
        );
      })}
    </svg>
  );
}

function StripRowView({ section }: { section: SectionMeta }) {
  const adapter = isStripSectionKey(section.key) ? ADAPTERS[section.key] : undefined;
  const { data, error } = useSWR(
    adapter ? ["week-strip", section.key] : null,
    () => adapter!(),
    { revalidateOnFocus: false },
  );

  const headline = !adapter ? "—" : error ? "—" : data?.headline ?? "…";
  const bars = data?.bars ?? Array(7).fill(0);

  return (
    <Link
      href={section.path}
      className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted/60 transition-colors"
    >
      <span className="w-5 text-center text-base shrink-0">{section.emoji || "•"}</span>
      <span className="text-xs text-muted-foreground w-20 shrink-0 truncate">{section.label}</span>
      <span
        className="text-xs font-mono tabular-nums flex-1 truncate"
        style={{ color: data ? section.color : undefined }}
      >
        {headline}
      </span>
      <Sparkline bars={bars} color={section.color} />
    </Link>
  );
}

export function WeekStrip() {
  const sections = useSections().filter((s) => s.enabled && isStripSectionKey(s.key));
  if (sections.length === 0) return null;
  return (
    <div className="mb-6 flex flex-col gap-0.5 border border-border rounded-lg p-2 bg-card">
      {sections.map((s) => (
        <StripRowView key={s.key} section={s} />
      ))}
    </div>
  );
}
