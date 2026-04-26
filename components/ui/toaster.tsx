"use client";

import { useTheme } from "@/components/theme-provider";
import { useCurrentSectionColor } from "@/components/section-theme";
import { sectionAccentVars } from "@/lib/section-colors";
import { Toaster as SonnerToaster } from "sonner";
import type { CSSProperties } from "react";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  const sectionColor = useCurrentSectionColor();
  const wrapperStyle: CSSProperties | undefined = sectionColor ? sectionAccentVars(sectionColor) : undefined;

  return (
    <SonnerToaster
      theme={(resolvedTheme as "light" | "dark") ?? "system"}
      position="bottom-center"
      style={wrapperStyle}
      toastOptions={{
        style: {
          background: "var(--card)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          borderLeft: "3px solid var(--section-accent)",
          borderRadius: "0.75rem",
          fontFamily: "var(--font-sans)",
          boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        },
        classNames: {
          error: "[border-left-color:var(--destructive)]!",
        },
      }}
    />
  );
}
