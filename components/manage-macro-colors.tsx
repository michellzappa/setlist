"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSettings, saveSettings, type AppSettings, type MacroColorKey, type MacroColors } from "@/lib/api";
import { FALLBACK_MACRO_COLORS } from "@/lib/macro-targets";
import { PaletteSwatchGrid } from "@/components/palette-swatch-grid";

const ROWS: { key: MacroColorKey; label: string }[] = [
  { key: "protein", label: "Protein" },
  { key: "fat",     label: "Fat" },
  { key: "carbs",   label: "Carbs" },
  { key: "fiber",   label: "Fiber" },
  { key: "kcal",    label: "Kcal" },
  { key: "fasting", label: "Fasting" },
];

export function ManageMacroColorsCard() {
  const { data: settings } = useSWR("settings", getSettings);
  const [draft, setDraft] = useState<MacroColors>(FALLBACK_MACRO_COLORS);
  const dirtyRef = useRef(false);

  // Seed once settings arrive; later revalidations shouldn't clobber user edits.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !settings) return;
    setDraft({ ...FALLBACK_MACRO_COLORS, ...(settings.nutrition?.macro_colors ?? {}) });
    setSeeded(true);
  }, [settings, seeded]);

  useEffect(() => {
    if (!seeded || !dirtyRef.current) return;
    const handle = setTimeout(async () => {
      dirtyRef.current = false;
      await saveSettings({ nutrition: { macro_colors: draft } });
      touchedRef.current = false;
      globalMutate("settings");
    }, 400);
    return () => clearTimeout(handle);
  }, [draft, seeded]);

  const touchedRef = useRef(false);
  function setColor(key: MacroColorKey, value: string) {
    dirtyRef.current = true;
    setDraft((d) => {
      const next = { ...d, [key]: value };
      // Optimistic: patch the `settings` SWR cache so dashboards (charts,
      // stat tiles, mini bars) repaint this macro immediately.
      touchedRef.current = true;
      globalMutate(
        "settings",
        (current: AppSettings | undefined) => {
          if (!current) return current;
          return {
            ...current,
            nutrition: {
              ...(current.nutrition ?? { macro_colors: FALLBACK_MACRO_COLORS }),
              macro_colors: next,
            },
          };
        },
        { revalidate: false },
      );
      return next;
    });
  }

  // Drop optimistic tint on unmount if edit was never saved.
  useEffect(() => {
    return () => {
      if (!touchedRef.current) return;
      globalMutate("settings");
    };
  }, []);

  // Highlight when other macros have claimed a swatch — nudge, not a block.
  function othersFor(self: MacroColorKey) {
    return ROWS.filter((r) => r.key !== self).map((r) => ({
      label: r.label,
      value: draft[r.key],
    }));
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Macro Colors</CardTitle>
        <p className="text-xs text-muted-foreground">
          Each macro gets its own color on charts and stat tiles — independent of the Nutrition accent.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {ROWS.map((row) => (
          <div key={row.key} className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span
                className="h-3 w-3 rounded-full border border-border"
                style={{ backgroundColor: draft[row.key] }}
              />
              <span>{row.label}</span>
            </div>
            <PaletteSwatchGrid
              value={draft[row.key]}
              onChange={(v) => setColor(row.key, v)}
              others={othersFor(row.key)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
