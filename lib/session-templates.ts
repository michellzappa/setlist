// Session templates — one source of truth for what "upper" / "lower" /
// "cardio" / "yoga" day means. Cardio goes first as warmup, ab crunch last
// as finisher.
//
// This file is intentionally user-editable: the values below reflect one
// specific gym routine (Basic Fit machines, 2 cardio warmup + 8 strength
// machines per day). Change TEMPLATES / BASIC_FIT_MACHINES to match your
// own split and equipment.
//
// TODO(oss): move to a vault YAML (Exercise/templates-config.yaml) so
// users don't need to edit TypeScript to customize their routine. Blocked
// on a bigger refactor — this touches ~11 consumer files and would need
// SWR-backed loading everywhere. Tracked for a v0.2 quality-of-life pass.

// SessionType is just a string id now — Upper/Lower/Cardio/Yoga are seeded
// defaults but users can add/rename/remove via Settings → Training. The
// constants below stay as a fallback for synchronous reads (initial paint,
// SSR, tests). At runtime, applySessionTypesConfig() overlays the user's
// config from /api/training/session-types so renames + emoji edits show up
// without rewiring every consumer.
export type SessionType = string;

export type TemplateItem = {
  exercise: string;
  // For cardio/mobility exercises: the target duration in minutes. The user
  // still inputs actual values; this is a prompt only.
  target_duration_min?: number;
  // Override the per-exercise prefilled level. Used on the cardio (Z2) day
  // to force lower intensity than the user's usual working level, so the
  // session stays in zone 2.
  target_level?: number;
};

// Default templates. Mutated at runtime by applySessionTypesConfig() — when
// the API returns a session_types entry with `exercises`, that list replaces
// the default template (each entry becomes a bare {exercise: name}). Targets
// (target_duration_min, target_level) are preserved when the same exercise
// appears in both the default and the user's list.
//
// 10 items per strength day (2 cardio warmup + 8 strength machines) → ~50 min.
// Cardio day is the long Z2 day and stays at elliptical 30 + rowing 20 + core.
export const TEMPLATES: Record<string, TemplateItem[]> = {
  upper: [
    { exercise: "elliptical", target_duration_min: 10 },
    { exercise: "rowing", target_duration_min: 10 },
    { exercise: "chest press" },
    { exercise: "diverging seated row" },
    { exercise: "lat pull" },
    { exercise: "shoulder press" },
    { exercise: "triceps extension" },
    { exercise: "biceps" },
    { exercise: "rear delt" },
    { exercise: "ab crunch" },
  ],
  lower: [
    { exercise: "elliptical", target_duration_min: 10 },
    { exercise: "rowing", target_duration_min: 10 },
    { exercise: "leg press" },
    { exercise: "leg extension" },
    { exercise: "leg curl" },
    { exercise: "abduction" },
    { exercise: "adduction" },
    { exercise: "calf press" },
    { exercise: "squat" },
    { exercise: "ab crunch" },
  ],
  // Cardio (Z2) day: only the two machines at lower intensity. No strength.
  cardio: [
    { exercise: "elliptical", target_duration_min: 30, target_level: 4 },
    { exercise: "rowing", target_duration_min: 20, target_level: 1 },
  ],

  // Yoga day: sun salutations as a continuous flow.
  yoga: [{ exercise: "surya namaskar", target_duration_min: 45 }],
};

export const CARDIO_EXERCISES = new Set(["elliptical", "rowing", "stairs"]);
export const MOBILITY_EXERCISES = new Set(["surya namaskar", "pull up"]);

export function isCardio(exercise: string): boolean {
  return CARDIO_EXERCISES.has(exercise) || MOBILITY_EXERCISES.has(exercise);
}

export let SESSION_META: Record<string, { emoji: string; label: string }> = {
  upper: { emoji: "💪", label: "Upper" },
  lower: { emoji: "🦵", label: "Lower" },
  cardio: { emoji: "🫁", label: "Cardio" },
  yoga: { emoji: "🧘", label: "Yoga" },
};

// Ordered list of session-type ids — defaults to the four seeded types,
// replaced at runtime once the config loads.
export let SESSION_TYPE_ORDER: string[] = ["upper", "lower", "cardio", "yoga"];

/** Overlay user config onto the module-level SESSION_META / TEMPLATES /
 *  SESSION_TYPE_ORDER. Called by useSessionTypesSync() once the SWR fetch
 *  resolves. Idempotent — safe to call on every revalidation.
 *
 *  Why mutate module state instead of plumbing context everywhere? The
 *  existing consumer surface (start/active/done pages, session-draft,
 *  quick-log-forms, training-dashboard, timeline-events) reads these as
 *  plain imports. Wiring SWR through all of them would be a much bigger
 *  refactor; mutate-on-load gives the user-facing payoff immediately. */
export function applySessionTypesConfig(
  items: ReadonlyArray<{ id: string; label: string; emoji: string; exercises?: string[] }>,
): void {
  if (!items?.length) return;
  const nextOrder: string[] = [];
  const nextMeta: Record<string, { emoji: string; label: string }> = {};
  for (const it of items) {
    if (!it.id) continue;
    nextOrder.push(it.id);
    nextMeta[it.id] = { emoji: it.emoji || "", label: it.label || it.id };
    // Rebuild the template from the user's exercise list if they provided
    // one. Preserve duration/level targets from the default template when
    // the same exercise name reappears.
    if (Array.isArray(it.exercises) && it.exercises.length > 0) {
      const previous = TEMPLATES[it.id] ?? [];
      const targetByName = new Map<string, TemplateItem>(
        previous.map((t) => [t.exercise, t]),
      );
      TEMPLATES[it.id] = it.exercises.map((name) => {
        const prev = targetByName.get(name);
        return prev ? { ...prev } : { exercise: name };
      });
    }
  }
  SESSION_META = nextMeta;
  SESSION_TYPE_ORDER = nextOrder;
}

// Full list of machines available at the gym, mapped to canonical lowercase
// names. Used to populate the "Add missing exercise" dropdown so the user
// can add anything, not just exercises already in their history.
//
// Aliases used for uppercase machine names that map to existing canonical
// exercises in the vault: CROSSTRAINER→elliptical, ROWER→rowing,
// STAIRCLIMBER→stairs, LAT PULLDOWN→lat pull, ABDOMINAL CRUNCH→ab crunch.
export const BASIC_FIT_MACHINES: string[] = [
  // Cardio
  "elliptical",
  "rowing",
  "stairs",
  "treadmill",
  "stationary bike",
  "recumbent bike",
  // Chest
  "chest press",
  "converging chest press",
  "plate vertical chest press",
  "chest fly",
  // Back / pull
  "lat pull",
  "diverging lat pull",
  "plate lat pull",
  "seated row",
  "diverging seated row",
  "plate seated row",
  // Shoulders
  "shoulder press",
  "converging shoulder press",
  "plate shoulder press",
  "rear delt",
  // Arms
  "triceps extension",
  "triceps dips",
  "arm curl",
  // Legs — quads
  "leg press",
  "plate leg press",
  "leg extension",
  "hack squat",
  "perfect squat",
  // Legs — hams
  "leg curl",
  "prone leg curl",
  // Legs — glute
  "glute trainer",
  // Legs — abductors / calves
  "calf press",
  "plate calf",
  "abduction",
  "adduction",
  // Core
  "ab crunch",
  "abdominal",
  "back extension",
  "rotary torso",
  // Bodyweight / assisted
  "pull up",
  "assisted pull up",
  "chin assist",
  // Mobility
  "surya namaskar",
];
