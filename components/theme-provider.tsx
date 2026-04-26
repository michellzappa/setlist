"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "system" | "light" | "dark";
type Resolved = "light" | "dark";

const THEME_KEY = "theme";
const EINK_KEY = "eink";

type Ctx = {
  theme: Theme;
  resolvedTheme: Resolved;
  eink: boolean;
  setTheme: (t: Theme) => void;
  setEink: (v: boolean) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function systemPref(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(resolved: Resolved, eink: boolean) {
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.classList.toggle("eink", eink);
  el.style.colorScheme = eink ? "light" : resolved === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolved] = useState<Resolved>("light");
  const [eink, setEinkState] = useState<boolean>(false);

  useEffect(() => {
    const storedTheme = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system";
    const storedEink = localStorage.getItem(EINK_KEY) === "1";
    setThemeState(storedTheme);
    setEinkState(storedEink);
    const r = storedTheme === "system" ? systemPref() : storedTheme;
    setResolved(r);
    apply(r, storedEink);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r: Resolved = mq.matches ? "dark" : "light";
      setResolved(r);
      apply(r, eink);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, eink]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (t === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
    const r = t === "system" ? systemPref() : t;
    setResolved(r);
    setEinkState((current) => {
      apply(r, current);
      return current;
    });
  }, []);

  const setEink = useCallback((v: boolean) => {
    setEinkState(v);
    if (v) localStorage.setItem(EINK_KEY, "1");
    else localStorage.removeItem(EINK_KEY);
    setResolved((r) => {
      apply(r, v);
      return r;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, eink, setTheme, setEink }),
    [theme, resolvedTheme, eink, setTheme, setEink],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx)
    return {
      theme: "system" as Theme,
      resolvedTheme: "light" as Resolved,
      eink: false,
      setTheme: () => {},
      setEink: () => {},
    };
  return ctx;
}
