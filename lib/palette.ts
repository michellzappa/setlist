// Septena's curated palette — single source of truth for any user-facing
// color choice (section accents, macro colors, future categorical slots).
// Pulled from Tailwind's 500-shade row, trimmed to avoid near-duplicates so
// any two picks still read as clearly different.
//
// Storage: pick the `value` (hex). Settings YAML stores the hex directly,
// not the id — every downstream consumer already treats `section.color` as
// an opaque CSS color string, so hex drops in cleanly.

export type PaletteSwatch = {
  id: string;
  label: string;
  value: string;
};

export const PALETTE: PaletteSwatch[] = [
  // Bright row — Tailwind 500.
  { id: "red",     label: "Red",     value: "#ef4444" },
  { id: "orange",  label: "Orange",  value: "#f97316" },
  { id: "amber",   label: "Amber",   value: "#f59e0b" },
  { id: "yellow",  label: "Yellow",  value: "#eab308" },
  { id: "lime",    label: "Lime",    value: "#84cc16" },
  { id: "green",   label: "Green",   value: "#22c55e" },
  { id: "emerald", label: "Emerald", value: "#10b981" },
  { id: "teal",    label: "Teal",    value: "#14b8a6" },
  { id: "cyan",    label: "Cyan",    value: "#06b6d4" },
  { id: "sky",     label: "Sky",     value: "#0ea5e9" },
  { id: "blue",    label: "Blue",    value: "#3b82f6" },
  { id: "indigo",  label: "Indigo",  value: "#6366f1" },
  { id: "violet",  label: "Violet",  value: "#8b5cf6" },
  { id: "purple",  label: "Purple",  value: "#a855f7" },
  { id: "pink",    label: "Pink",    value: "#ec4899" },
  { id: "rose",    label: "Rose",    value: "#f43f5e" },
  // Earth row — Tailwind 700/800 of warm hues, plus stone for taupe.
  { id: "terracotta", label: "Terracotta", value: "#9a3412" }, // orange-800
  { id: "brown",      label: "Brown",      value: "#b45309" }, // amber-700
  { id: "mustard",    label: "Mustard",    value: "#854d0e" }, // yellow-800
  { id: "olive",      label: "Olive",      value: "#3f6212" }, // lime-800
  { id: "taupe",      label: "Taupe",      value: "#78716c" }, // stone-500
  { id: "espresso",   label: "Espresso",   value: "#44403c" }, // stone-700
];

const BY_VALUE = new Map(PALETTE.map((s) => [s.value.toLowerCase(), s]));
const BY_ID = new Map(PALETTE.map((s) => [s.id, s]));

export function findSwatchByValue(value: string | null | undefined): PaletteSwatch | null {
  if (!value) return null;
  return BY_VALUE.get(value.toLowerCase()) ?? null;
}

export function findSwatchById(id: string | null | undefined): PaletteSwatch | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function resolveSwatch(value: string | null | undefined): string {
  const match = findSwatchByValue(value);
  return match ? match.value : (value || PALETTE[0].value);
}
