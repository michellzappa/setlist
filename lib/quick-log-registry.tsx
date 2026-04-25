"use client";

import type React from "react";
import {
  NutritionQuickLog,
  CaffeineQuickLog,
  CannabisQuickLog,
  HabitsQuickLog,
  SupplementsQuickLog,
  ChoresQuickLog,
  GutQuickLog,
  TasksQuickLog,
} from "@/components/quick-log-forms";
import type { SectionKey } from "@/lib/sections";

/** Single source of truth for "this section has a quick-log affordance".
 *  Both the homepage tile FABs (overview-dashboard) and the global ⌘K
 *  palette (command-palette) read from this map — adding a new section's
 *  quick-log here automatically wires both surfaces. */

export type QuickLogIcon = "plus" | "check" | "play";

/** A quick-log either opens a modal-form (`Component`) or routes to a
 *  full page (`href`). Sections like training don't fit a small modal —
 *  starting a workout deserves the full-page session UI. */
export type QuickLogEntry =
  | { title: string; Component: React.FC<{ onDone: () => void }>; icon: QuickLogIcon }
  | { title: string; href: string; icon: QuickLogIcon };

export const QUICK_LOG: Partial<Record<SectionKey, QuickLogEntry>> = {
  training:    { title: "Start session",  href: "/septena/training/session/start", icon: "play"  },
  nutrition:   { title: "Log meal",       Component: NutritionQuickLog,   icon: "plus"  },
  caffeine:    { title: "Log caffeine",   Component: CaffeineQuickLog,    icon: "plus"  },
  cannabis:    { title: "Log cannabis",   Component: CannabisQuickLog,    icon: "plus"  },
  habits:      { title: "Check habits",   Component: HabitsQuickLog,      icon: "check" },
  supplements: { title: "Supplements",    Component: SupplementsQuickLog, icon: "check" },
  chores:      { title: "Chores",         Component: ChoresQuickLog,      icon: "check" },
  tasks:       { title: "New task",       Component: TasksQuickLog,       icon: "plus"  },
  gut:         { title: "Log gut",        Component: GutQuickLog,         icon: "plus"  },
};
