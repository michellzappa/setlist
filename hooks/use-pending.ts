"use client";

import { useCallback, useState } from "react";

/** Tracks a set of in-flight ids, e.g. for optimistic toggles in checklist
 *  UIs (habits, supplements, chores, groceries). `withPending(id, fn)` adds
 *  the id, awaits `fn()`, and removes the id even if `fn` throws. */
export function usePending<T = string>() {
  const [pending, setPending] = useState<Set<T>>(new Set());

  const withPending = useCallback(async (id: T, fn: () => Promise<void>) => {
    setPending((p) => {
      if (p.has(id)) return p;
      const next = new Set(p);
      next.add(id);
      return next;
    });
    try {
      await fn();
    } finally {
      setPending((p) => {
        if (!p.has(id)) return p;
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  }, []);

  return { pending, withPending };
}
