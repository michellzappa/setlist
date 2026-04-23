import type { CSSProperties } from "react";

export const SECTION_ACCENT = "var(--section-accent)";
export const SECTION_ACCENT_SOFT = "var(--section-accent-soft)";
export const SECTION_ACCENT_STRONG = "var(--section-accent-strong)";
export const SECTION_ACCENT_SHADE_1 = "var(--section-accent-shade-1)";
export const SECTION_ACCENT_SHADE_2 = "var(--section-accent-shade-2)";
export const SECTION_ACCENT_SHADE_3 = "var(--section-accent-shade-3)";

export type ExerciseTone = "strength" | "cardio" | "mobility" | "core" | "unknown";

export const EXERCISE_TONE_COLOR: Record<ExerciseTone, string> = {
  strength: SECTION_ACCENT_SHADE_1,
  cardio: SECTION_ACCENT_SHADE_2,
  mobility: SECTION_ACCENT_SHADE_3,
  core: SECTION_ACCENT_SHADE_1,
  unknown: SECTION_ACCENT_SHADE_1,
};

export function exerciseToneColor(tone: ExerciseTone | null | undefined): string {
  if (!tone) return SECTION_ACCENT_SHADE_1;
  return EXERCISE_TONE_COLOR[tone] ?? SECTION_ACCENT_SHADE_1;
}

export function sectionAccentVars(color: string): CSSProperties {
  return {
    "--section-accent": color,
    // Custom properties resolve where they are defined, not where they are
    // consumed, so the full accent ramp has to live on the same element that
    // overrides the section accent. Leaving these at :root made every
    // exercise shade keep the neutral foreground color instead of the user's
    // chosen section color.
    "--section-accent-soft": `color-mix(in oklab, ${color} 14%, transparent)`,
    "--section-accent-strong": `oklch(from ${color} calc(l - 0.10) c h)`,
    "--section-accent-shade-1": color,
    "--section-accent-shade-2": `oklch(from ${color} calc(l + 0.06) c h)`,
    "--section-accent-shade-3": `oklch(from ${color} calc(l + 0.13) calc(c * 0.85) h)`,
  } as CSSProperties;
}
