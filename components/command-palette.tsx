"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavSections } from "@/hooks/use-sections";
import { useDemoHref } from "@/hooks/use-demo-href";

/** Global command palette + keyboard nav. Sections come from the registry
 *  (useNavSections) so there are no hardcoded routes — adding a section to
 *  the manifest automatically makes it searchable. ⌘K / Ctrl+K toggles.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sections = useNavSections();
  const toHref = useDemoHref();

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

  if (!open || typeof document === "undefined") return null;

  const go = (path: string) => {
    router.push(toHref(path));
    setOpen(false);
  };

  const items = [
    { key: "__home", label: "Home", emoji: "", color: "hsl(var(--muted-foreground))", path: "/septena" },
    ...sections.map((s) => ({ key: s.key, label: s.label, emoji: s.emoji, color: s.color, path: s.path })),
  ];

  return createPortal(
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
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-2xl animate-in fade-in slide-in-from-top-4"
      >
        <Command.Input
          autoFocus
          placeholder="Jump to…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
            No matches.
          </Command.Empty>
          <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
            {items.map((item) => (
              <Command.Item
                key={item.key}
                value={`${item.label} ${item.key}`}
                onSelect={() => go(item.path)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
              >
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-sm"
                  style={{ backgroundColor: `color-mix(in oklab, ${item.color} 15%, transparent)`, color: item.color }}
                >
                  {item.emoji || "·"}
                </span>
                <span className="flex-1">{item.label}</span>
                <span className="text-xs text-muted-foreground">{toHref(item.path)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>↑↓ to move · ↵ to select · esc to close</span>
          <span>⌘K</span>
        </div>
      </Command>
    </div>,
    document.body,
  );
}
