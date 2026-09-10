"use client";

import { useState, useSyncExternalStore } from "react";

const CHANGED = "console-navigation-preference";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGED, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGED, callback);
  };
}

/** Presentation only. A blocked storage API must not disable navigation. */
export function useNavPreference(name: string) {
  const key = "managed-agent-console:nav:" + name;
  const [temporary, setTemporary] = useState<boolean | null>(null);
  const stored = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const value = window.localStorage.getItem(key);
        return value === "true" ? true : value === "false" ? false : null;
      } catch {
        return null;
      }
    },
    () => null,
  );
  const set = (value: boolean) => {
    try {
      window.localStorage.setItem(key, String(value));
      setTemporary(null);
    } catch {
      setTemporary(value);
    }
    window.dispatchEvent(new Event(CHANGED));
  };
  return [temporary ?? stored, set] as const;
}
