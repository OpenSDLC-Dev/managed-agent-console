"use client";

import { useEffect, useState } from "react";

/**
 * A clock that re-renders its consumer on an interval, so labels derived
 * from the current time (the relative-age chip) cannot go stale while a
 * page sits open with no data changes.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
