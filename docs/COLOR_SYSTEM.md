# Septena Color System

Septena separates product identity from in-app information color.

## Layers

### 1. Brand layer (fixed)

Use this for the product itself, not for section meaning.

- `--brand-1` through `--brand-7`
- `--brand-accent`
- `--brand-accent-soft`
- `--brand-accent-strong`

Current fixed spectrum:

| Token | Value | Role |
|---|---|---|
| `--brand-1` | `#ef4444` | red |
| `--brand-2` | `#f97316` | orange |
| `--brand-3` | `#eab308` | yellow |
| `--brand-4` | `#22c55e` | green |
| `--brand-5` | `#06b6d4` | cyan |
| `--brand-6` | `#3b82f6` | blue |
| `--brand-7` | `#8b5cf6` | violet |
| `--brand-accent` | `#3b82f6` | generic non-section accent |

Brand values come from the curated palette in `lib/palette.ts` — seven hues spaced across the spectrum. Update both lists together.

Where it belongs:

- Septena mark / logo
- marketing pages
- onboarding
- app icon fallback
- generic shell surfaces that are not inside a specific section

### 2. Section layer (user-defined)

Use this for navigation and working context inside the app.

- section color in Settings
- `/api/sections`
- `SectionThemeRoot` / `SectionTheme`
- `lib/section-colors.ts`
- `--section-accent`
- `--section-accent-soft`
- `--section-accent-strong`
- `--section-accent-shade-1/2/3`

The section layer is functional, not decorative. It tells the user where
they are.

### 3. Training type tones (derived from the section)

Training subtype colors are not a separate palette anymore. They derive
from the active Training section accent:

- strength -> `--section-accent-shade-1`
- cardio -> `--section-accent-shade-2`
- mobility -> `--section-accent-shade-3`

That keeps the training page coherent even when the user changes the
Training section color.

### 4. Semantic colors (separate)

Success, warning, danger, and other status colors should stay separate
from both brand and section colors. If a semantic literal is needed, it
should become a named token instead of borrowing the brand or section
palette.

## Rules

- Never make the Septena brand palette depend on live section settings.
- Never treat raw orange as a global fallback accent.
- On non-section routes, prefer brand tokens over section tokens.
- On section routes, prefer section tokens over brand tokens.
- On training views, prefer derived training tones over hardcoded subtype
  colors.

## Current code touchpoints

- `app/globals.css`
- `components/septena-mark.tsx`
- `components/section-theme.tsx`
- `lib/section-colors.ts`
- `components/marketing-page.tsx`
- `components/onboarding-gate.tsx`
- `app/icon.svg/route.ts`
- `app/manifest.json/route.ts`
