"use client";

import { useEffect, useState } from "react";

import { readFragmentToken } from "@/lib/auth/fragment";

export type FragmentTokenState = { status: "reading" } | { status: "missing" } | { status: "found"; token: string };

/**
 * Reads a one-time token from the URL fragment once, then removes it from the address bar and
 * browser history so it cannot be copied, bookmarked or leaked later.
 */
export function useFragmentToken(key: "th" | "t"): FragmentTokenState {
  const [state, setState] = useState<FragmentTokenState>({ status: "reading" });
  useEffect(() => {
    const token = readFragmentToken(window.location.hash, key);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // Reading browser-only state after hydration is the purpose of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(token ? { status: "found", token } : { status: "missing" });
  }, [key]);
  return state;
}
