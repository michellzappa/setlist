"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { useNavSections, useSections } from "@/hooks/use-sections";
import { useDemoHref } from "@/hooks/use-demo-href";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { Emoji } from "@/components/ui/emoji";
import { QUICK_LOG, type QuickLogEntry } from "@/lib/quick-log-registry";
import { QuickLogModal } from "@/components/quick-log-modal";
import { revalidateAfterLog } from "@/components/quick-log-forms";
import {
  getHabitDay,
  getSupplementDay,
  toggleHabit,
  toggleSupplement,
} from "@/lib/api";
import type { SectionKey } from "@/lib/sections";

/** Global ⌘K palette. Three groups, all sourced dynamically:
 *
 *  - **Navigate** — every nav-visible section from useNavSections().
 *  - **Log** — every section in the QUICK_LOG registry. Same registry the
 *    homepage tile FABs read from; adding a section there auto-wires here.
 *  - **Today** — the actual habit + supplement items for the selected date,
 *    fetched from the same SWR keys the dashboards use. Toggle in-line and
 *    the rest of the app revalidates via revalidateAfterLog().
 *
 *  Component-style log entries open in a QuickLogModal hoisted to this
 *  component (so the palette can be the universal launcher). Href-style
 *  entries (like training) just route. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [modalKey, setModalKey] = useState<SectionKey | null>(null);
  const router = useRouter();
  const navSections = useNavSections();
  const allSections = useSections();
  const toHref = useDemoHref();
  const { date } = useSelectedDate();

  // Only fetch today's items while the palette is open — keeps the palette
  // free on every page render. Reuses the dashboard's SWR keys so any
  // toggle here propagates everywhere.
  const habitsSWR = useSWR(
    open ? ["quicklog-habits", date] : null,
    () => getHabitDay(date),
    { revalidateOnFocus: false },
  );
  const suppsSWR = useSWR(
    open ? ["quicklog-supplements", date] : null,
    () => getSupplementDay(date),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const sectionMeta = (key: SectionKey) => allSections.find((s) => s.key === key);
  const accentFor = (key: SectionKey) =>
    sectionMeta(key)?.color ?? "hsl(var(--muted-foreground))";
  const emojiFor = (key: SectionKey) => sectionMeta(key)?.emoji ?? "";

  // ── Navigate items ────────────────────────────────────────────────────
  const navItems = [
    {
      key: "__home",
      label: "Home",
      emoji: "",
      color: "hsl(var(--muted-foreground))",
      path: "/septena",
    },
    ...navSections.map((s) => ({
      key: s.key,
      label: s.label,
      emoji: s.emoji,
      color: s.color,
      path: s.path,
    })),
  ];

  // ── Log items (sourced from QUICK_LOG) ────────────────────────────────
  const logItems = (Object.entries(QUICK_LOG) as Array<[SectionKey, QuickLogEntry]>).map(
    ([key, entry]) => ({
      key: `log-${key}`,
      sectionKey: key,
      label: entry.title,
      emoji: emojiFor(key),
      color: accentFor(key),
      entry,
    }),
  );

  // ── Today's habits + supplements ──────────────────────────────────────
  const habitItems =
    habitsSWR.data?.buckets.flatMap((b) =>
      (habitsSWR.data!.grouped[b] ?? []).map((h) => ({
        key: `habit-${h.id}`,
        id: h.id,
        label: h.name,
        emoji: emojiFor("habits"),
        color: accentFor("habits"),
        done: h.done,
      })),
    ) ?? [];

  const supplementItems =
    suppsSWR.data?.items.map((s) => ({
      key: `supp-${s.id}`,
      id: s.id,
      label: s.name,
      emoji: s.emoji || emojiFor("supplements"),
      color: accentFor("supplements"),
      done: s.done,
    })) ?? [];

  // ── Handlers ──────────────────────────────────────────────────────────
  const goPath = (path: string) => {
    router.push(toHref(path));
    setOpen(false);
  };

  const pickLog = (entry: QuickLogEntry, sectionKey: SectionKey) => {
    if ("href" in entry) {
      router.push(toHref(entry.href));
      setOpen(false);
      return;
    }
    setOpen(false);
    setModalKey(sectionKey);
  };

  const flipHabit = async (id: string, done: boolean) => {
    try {
      await toggleHabit(date, id, !done);
    } finally {
      revalidateAfterLog("habits");
    }
  };

  const flipSupplement = async (id: string, done: boolean) => {
    try {
      await toggleSupplement(date, id, !done);
    } finally {
      revalidateAfterLog("supplements");
    }
  };

  const modalEntry = modalKey ? QUICK_LOG[modalKey] : null;
  const modalSection = modalKey ? sectionMeta(modalKey) : null;
  const ModalComponent =
    modalEntry && "Component" in modalEntry ? modalEntry.Component : null;

  return (
    <>
      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
            />
            <Command
              label="Command palette"
              className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-2xl animate-in fade-in slide-in-from-top-4 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              <Command.Input
                autoFocus
                placeholder="Jump, log, or check off…"
                className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matches.
                </Command.Empty>

                <Command.Group heading="Navigate">
                  {navItems.map((item) => (
                    <PaletteItem
                      key={item.key}
                      value={`navigate ${item.label} ${item.key}`}
                      emoji={item.emoji}
                      color={item.color}
                      label={item.label}
                      onSelect={() => goPath(item.path)}
                    />
                  ))}
                </Command.Group>

                <Command.Group heading="Log">
                  {logItems.map((item) => (
                    <PaletteItem
                      key={item.key}
                      value={`log ${item.label} ${item.sectionKey}`}
                      emoji={item.emoji}
                      color={item.color}
                      label={item.label}
                      onSelect={() => pickLog(item.entry, item.sectionKey)}
                    />
                  ))}
                </Command.Group>

                {habitItems.length > 0 && (
                  <Command.Group heading="Today · habits">
                    {habitItems.map((h) => (
                      <PaletteItem
                        key={h.key}
                        value={`habit ${h.label}`}
                        emoji={h.emoji}
                        color={h.color}
                        label={h.label}
                        check={h.done}
                        onSelect={() => flipHabit(h.id, h.done)}
                      />
                    ))}
                  </Command.Group>
                )}

                {supplementItems.length > 0 && (
                  <Command.Group heading="Today · supplements">
                    {supplementItems.map((s) => (
                      <PaletteItem
                        key={s.key}
                        value={`supplement ${s.label}`}
                        emoji={s.emoji}
                        color={s.color}
                        label={s.label}
                        check={s.done}
                        onSelect={() => flipSupplement(s.id, s.done)}
                      />
                    ))}
                  </Command.Group>
                )}
              </Command.List>
              <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
                <span>↑↓ to move · ↵ to select · esc to close</span>
                <span>⌘K</span>
              </div>
            </Command>
          </div>,
          document.body,
        )}

      {modalKey && modalSection && ModalComponent && (
        <QuickLogModal
          open
          onClose={() => setModalKey(null)}
          title={modalEntry && "title" in modalEntry ? modalEntry.title : ""}
          accent={modalSection.color}
        >
          <ModalComponent onDone={() => setModalKey(null)} />
        </QuickLogModal>
      )}
    </>
  );
}

/** Single visual row. `check` shows a left-side state dot for toggleable
 *  items (habits, supplements) — undefined means non-toggleable (nav/log). */
function PaletteItem({
  value,
  emoji,
  color,
  label,
  check,
  onSelect,
}: {
  value: string;
  emoji: string;
  color: string;
  label: string;
  check?: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
    >
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded text-sm"
        style={{
          backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
          color,
        }}
      >
        <Emoji>{emoji || "·"}</Emoji>
      </span>
      <span className="flex-1">{label}</span>
      {typeof check === "boolean" && (
        <span
          aria-label={check ? "done" : "not done"}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border"
          style={{
            backgroundColor: check ? color : "transparent",
            borderColor: color,
            color: "white",
          }}
        >
          {check && (
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
      )}
    </Command.Item>
  );
}
