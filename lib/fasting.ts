// Shared live-fasting state machine. The backend chart already uses a
// "prev day's last eating event → today's first eating event" rule — this
// module answers the *live* question: "am I fasting right now?"
//
// Three states:
//   - "fasting" (overnight): no food logged today yet, yesterday had a
//     plausible last meal. Timer runs from that last meal.
//   - "fasting" (new window):  it's past EVENING_HOUR, last eating event
//     was ≥ POST_MEAL_GRACE_MIN minutes ago. Timer runs from that event.
//   - "fed": in-between. Eaten today, pre-evening (or within grace). No
//     timer — the user is not fasting in the dashboard sense.
//
// The thresholds mirror main.py:_fasting_windows so live state and the
// chart agree on what a "last meal of the day" looks like.

import useSWR from "swr";
import { todayLocalISO } from "@/lib/date-utils";
import { getSettings, type AppSettings } from "@/lib/api";

// Defaults mirror api/routers/settings.py:DEFAULT_SETTINGS["targets"] — the
// backend is the source of truth; these are only used until settings load.
export const DEFAULT_EVENING_HOUR_24H = 19;
export const DEFAULT_POST_MEAL_GRACE_MIN = 30;
export const DEFAULT_FASTING_TARGET_MIN = 14;
export const DEFAULT_FASTING_TARGET_MAX = 16;

export type FastingConfig = {
  /** Hour of day (24h, local) after which a new fasting window starts post-dinner. */
  eveningHour: number;
  /** Minutes after last meal before the fasting timer kicks in. */
  graceMin: number;
};

/** SWR-backed live-fasting thresholds, read from settings.yaml targets. */
export function useFastingConfig(): FastingConfig {
  const { data } = useSWR<AppSettings>("settings", getSettings, {
    revalidateOnFocus: false,
  });
  return {
    eveningHour: data?.targets?.evening_hour_24h ?? DEFAULT_EVENING_HOUR_24H,
    graceMin: data?.targets?.post_meal_grace_min ?? DEFAULT_POST_MEAL_GRACE_MIN,
  };
}

export type FastingStateInputs = {
  today_latest_meal: string | null;
  today_meal_count: number;
  yesterday_last_meal: string | null;
};

export type FastingState =
  | { state: "fed" }
  | {
      state: "fasting";
      /** When the current fast started. */
      sinceDay: "today" | "yesterday";
      sinceTime: string; // HH:MM
      hours: number;
      mins: number;
      totalMin: number;
    };

/** Parse a local-time HH:MM into a Date anchored to `dayOffset` days ago. */
function parseHM(hm: string, dayOffset: 0 | 1, now: Date): Date {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(now);
  d.setDate(d.getDate() - dayOffset);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

export function computeFastingState(
  inputs: FastingStateInputs | null | undefined,
  config?: FastingConfig,
  now: Date = new Date(),
): FastingState {
  if (!inputs) return { state: "fed" };
  const eveningHour = config?.eveningHour ?? DEFAULT_EVENING_HOUR_24H;
  const graceMin = config?.graceMin ?? DEFAULT_POST_MEAL_GRACE_MIN;
  const { today_latest_meal, today_meal_count, yesterday_last_meal } = inputs;

  // Case A: overnight fast still running — nothing eaten today yet.
  if (today_meal_count === 0 && yesterday_last_meal) {
    const then = parseHM(yesterday_last_meal, 1, now);
    const diffMs = now.getTime() - then.getTime();
    if (diffMs > 0) {
      const totalMin = Math.floor(diffMs / 60000);
      return {
        state: "fasting",
        sinceDay: "yesterday",
        sinceTime: yesterday_last_meal,
        hours: Math.floor(totalMin / 60),
        mins: totalMin % 60,
        totalMin,
      };
    }
  }

  // Case B: post-dinner, new fast window beginning.
  if (now.getHours() >= eveningHour && today_latest_meal) {
    const then = parseHM(today_latest_meal, 0, now);
    const diffMs = now.getTime() - then.getTime();
    const totalMin = Math.floor(diffMs / 60000);
    if (totalMin >= graceMin) {
      return {
        state: "fasting",
        sinceDay: "today",
        sinceTime: today_latest_meal,
        hours: Math.floor(totalMin / 60),
        mins: totalMin % 60,
        totalMin,
      };
    }
  }

  return { state: "fed" };
}

/** True iff the given entry, saved now, would be the first eating event
 *  of the user's current day (i.e. "breaking the fast"). Pass in the
 *  count of today's meal+snack entries *before* the save. */
export function isBreakingFast(
  todayMealCountBeforeSave: number,
  savingForDate: string,
): boolean {
  return todayMealCountBeforeSave === 0 && savingForDate === todayLocalISO();
}
