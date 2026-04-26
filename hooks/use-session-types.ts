"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { getSessionTypes, type SessionTypeConfig } from "@/lib/api";
import {
  SESSION_META,
  SESSION_TYPE_ORDER,
  applySessionTypesConfig,
} from "@/lib/session-templates";

/** Loads /api/training/session-types and overlays the result onto the
 *  module-level SESSION_META / TEMPLATES so synchronous consumers (start
 *  page, active page, session-draft, etc.) pick up the user's edits.
 *
 *  Returns the live list for callers that want to render type pickers
 *  dynamically (number of types is no longer fixed at four). */
export function useSessionTypes(): {
  types: SessionTypeConfig[];
  order: string[];
  meta: Record<string, { emoji: string; label: string }>;
  ready: boolean;
} {
  const { data } = useSWR("session-types", getSessionTypes, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (data?.session_types?.length) {
      applySessionTypesConfig(data.session_types);
    }
  }, [data]);

  return {
    types: data?.session_types ?? [],
    order: SESSION_TYPE_ORDER,
    meta: SESSION_META,
    ready: !!data,
  };
}
