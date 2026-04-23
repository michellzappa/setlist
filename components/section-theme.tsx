"use client";

import { usePathname } from "next/navigation";
import { type CSSProperties, type ReactNode } from "react";
import { useSectionColor, useSections } from "@/hooks/use-sections";
import { sectionAccentVars } from "@/lib/section-colors";
import type { SectionKey } from "@/lib/sections";

/** Sets `--section-accent` (and derived shade vars) on a wrapper div
 *  scoped to whichever section owns the current pathname. Descendants
 *  consume the accent via `var(--section-accent)` instead of passing a
 *  `color` prop through the tree.
 *
 *  Why this lives in the root layout: the sticky section header's action
 *  slot (`#section-header-action-slot`) and the page content must BOTH
 *  sit inside the scope so portaled buttons and the page itself see the
 *  same accent. Pathname matching is the same longest-prefix-wins rule
 *  used by SectionHeader, keeping the two sources consistent.
 *
 *  On `/` (launcher) no section matches — vars fall back to :root's
 *  `--app-accent` defaults. In e-ink mode, `.eink` rules override the
 *  vars with `!important`, so the inline style here is ignored. */
export function SectionThemeRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sections = useSections();

  const match = sections
    .filter((s) => s.path && (pathname === s.path || pathname.startsWith(s.path + "/")))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const color = match?.color;
  const style: CSSProperties | undefined = color ? sectionAccentVars(color) : undefined;

  return (
    <div style={style}>
      {children}
    </div>
  );
}

/** Explicit-key variant for places that need to scope the section accent
 *  to a region whose section ISN'T determined by pathname — e.g. each
 *  per-section tile on the overview launcher, or a settings preview card.
 *  Use SectionThemeRoot for the page-level wrapper instead. */
export function SectionTheme({
  sectionKey,
  className,
  children,
}: {
  sectionKey: SectionKey;
  className?: string;
  children: ReactNode;
}) {
  const color = useSectionColor(sectionKey);
  const style = sectionAccentVars(color);
  return (
    <div style={style} className={className ?? "contents"}>
      {children}
    </div>
  );
}
