"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

type PageHeaderContextValue = {
  setRefreshing: (section: string, refreshing: boolean) => void;
  isRefreshing: (section: string) => boolean;
  setSubtitle: (section: string, subtitle: string | null) => void;
  getSubtitle: (section: string) => string | null;
};

const PageHeaderContext = createContext<PageHeaderContextValue>({
  setRefreshing: () => {},
  isRefreshing: () => false,
  setSubtitle: () => {},
  getSubtitle: () => null,
});

export function PageHeaderContextProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, boolean>>({});
  const [subtitles, setSubtitles] = useState<Record<string, string | null>>({});

  const setRefreshing = useCallback((section: string, refreshing: boolean) => {
    setStates((prev) => ({ ...prev, [section]: refreshing }));
  }, []);

  const isRefreshing = useCallback(
    (section: string) => !!states[section],
    [states]
  );

  const setSubtitle = useCallback((section: string, subtitle: string | null) => {
    setSubtitles((prev) => (prev[section] === subtitle ? prev : { ...prev, [section]: subtitle }));
  }, []);

  const getSubtitle = useCallback(
    (section: string) => subtitles[section] ?? null,
    [subtitles]
  );

  return (
    <PageHeaderContext.Provider value={{ setRefreshing, isRefreshing, setSubtitle, getSubtitle }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

/** Call this in a dashboard to register its refreshing state with the global header. */
export function usePageHeader(section: string, isLoading: boolean) {
  const { setRefreshing } = useContext(PageHeaderContext);

  useEffect(() => {
    setRefreshing(section, isLoading);
  }, [section, isLoading, setRefreshing]);
}

/** Override the global SectionHeader's subtitle for the current section.
 *  Pass null to clear and fall back to the section's static tagline. */
export function usePageHeaderSubtitle(section: string, subtitle: string | null) {
  const { setSubtitle } = useContext(PageHeaderContext);

  useEffect(() => {
    setSubtitle(section, subtitle);
    return () => setSubtitle(section, null);
  }, [section, subtitle, setSubtitle]);
}

export function usePageHeaderContext() {
  return useContext(PageHeaderContext);
}
