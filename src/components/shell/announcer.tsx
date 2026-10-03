"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useState,
} from "react";

type Announce = (key: string, message: string | null) => void;

const AnnouncerContext = createContext<Announce | null>(null);

/**
 * The console's one polite live region, mounted with the shell. A screen
 * reader announces a change to a region it already knows, not a region that
 * mounts holding its text, and a tab's own region mounts with the tab: so a
 * view says what it is doing through this one, which was in the document long
 * before. The latest message still held is the one it says.
 */
export function Announcer({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<[string, string][]>([]);
  const announce = useCallback<Announce>(
    (key, message) =>
      setMessages((current) => {
        const rest = current.filter(([held]) => held !== key);
        return message ? [...rest, [key, message]] : rest;
      }),
    [],
  );
  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <p role="status" className="sr-only" data-testid="announcer">
        {messages.at(-1)?.[1]}
      </p>
    </AnnouncerContext.Provider>
  );
}

/**
 * Says message through the Announcer while the caller is mounted, null saying
 * nothing, and takes it back on unmount. Written before the commit that
 * changed it is painted.
 */
export function useAnnouncement(message: string | null) {
  const announce = useContext(AnnouncerContext);
  const key = useId();
  useLayoutEffect(() => {
    if (!announce) return;
    announce(key, message);
    return () => announce(key, null);
  }, [announce, key, message]);
}
