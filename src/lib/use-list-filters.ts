"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

/** URL state for list controls; native history updates keep Next's router in sync. */
export function useListFilters() {
  const key = useSearchParams().toString();
  const params = useMemo(() => new URLSearchParams(key), [key]);
  function update(changes: Record<string, string | null>) {
    const url = new URL(window.location.href);
    for (const [name, value] of Object.entries(changes)) {
      if (value === null) url.searchParams.delete(name);
      else url.searchParams.set(name, value);
    }
    if (url.href !== window.location.href) {
      window.history.pushState(null, "", url.pathname + url.search + url.hash);
    }
  }
  return { key, params, update };
}
