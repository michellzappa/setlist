/**
 * Training session-types config def. Lets the user CRUD the day types
 * (Upper / Lower / Cardio / Yoga, plus their own additions) — label,
 * emoji, and the comma-separated list of exercises that prefills when
 * starting a session of that type.
 *
 * Mirrors lib/settings/sections/cannabis.ts. Wired into the Training
 * settings page alongside the exercises editor.
 */

import {
  addSessionType,
  deleteSessionType,
  getSessionTypes,
  type SessionTypeConfig,
  updateSessionType,
} from "@/lib/api";
import { group, stringField } from "../schema";
import { defineSectionConfig } from "../section-config";

// The section editor's schema only carries scalar string fields, so
// `exercises` is round-tripped as a comma-separated string. The API
// helpers split/join on the way through.
type SessionTypeFormItem = {
  id: string;
  label: string;
  emoji: string;
  exercises: string;
};

const itemSchema = group("Session type", {
  label: stringField({ label: "Label", placeholder: "Upper", width: "default", default: "" }),
  emoji: stringField({ label: "Emoji", placeholder: "💪", width: "narrow", default: "" }),
  exercises: stringField({
    label: "Exercises",
    placeholder: "comma, separated, list",
    width: "wide",
    default: "",
  }),
});

function joinExercises(list: readonly string[] | undefined): string {
  return (list ?? []).join(", ");
}

function splitExercises(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const sessionTypesDef = defineSectionConfig<SessionTypeFormItem>({
  swrKey: "session-types",
  fetcher: getSessionTypes,
  selectItems: (data) =>
    ((data as { session_types?: SessionTypeConfig[] }).session_types ?? []).map((t) => ({
      id: t.id,
      label: t.label ?? "",
      emoji: t.emoji ?? "",
      exercises: joinExercises(t.exercises),
    })),
  add: ({ label, emoji, exercises }) =>
    addSessionType(
      String(label ?? "New type"),
      String(emoji ?? ""),
      splitExercises(exercises),
    ).then((t) => ({
      id: t.id,
      label: t.label,
      emoji: t.emoji,
      exercises: joinExercises(t.exercises),
    })),
  update: (id, patch) =>
    updateSessionType(id, {
      label: patch.label as string | undefined,
      emoji: patch.emoji as string | undefined,
      exercises: "exercises" in patch ? splitExercises(patch.exercises) : undefined,
    }).then((t) => ({
      id: t.id,
      label: t.label,
      emoji: t.emoji,
      exercises: joinExercises(t.exercises),
    })),
  remove: (id) => deleteSessionType(id),
  itemSchema,
  emptyLabel: "No session types yet.",
  addLabel: "type",
  defaultNewItem: () => ({ label: "New type", emoji: "", exercises: "" }),
  invalidates: ["training-config", "next-workout"],
});
