"use client";

import {
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import {
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Nav } from "./nav";
import { useNavPreference } from "./nav-preference";
import { CommandPalette } from "./command-palette";
import { cn } from "@/lib/utils";

const NARROW = "(max-width: 767px)";
function subscribeViewport(callback: () => void) {
  const media = window.matchMedia(NARROW);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/**
 * Keep navigation and its footer in the viewport while the page scrolls.
 */
export function ConsoleShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const narrow = useSyncExternalStore(
    subscribeViewport,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
  const [desktopExpanded, setDesktopExpanded] = useNavPreference("sidebar");
  const [mobile, setMobile] = useState({ narrow, expanded: false });
  // Opening navigation on a phone is temporary, independent of desktop preference.
  if (mobile.narrow !== narrow) setMobile({ narrow, expanded: false });
  const open = narrow
    ? mobile.narrow === narrow && mobile.expanded
    : (desktopExpanded ?? true);
  const setExpanded = (expanded: boolean) => {
    if (narrow) setMobile({ narrow, expanded });
    else setDesktopExpanded(expanded);
  };
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setExpanded(false);
    toggleRef.current?.focus();
  };

  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (
      open &&
      event.key === "Escape" &&
      !event.defaultPrevented &&
      event.currentTarget.contains(event.target as Node)
    ) {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="min-h-dvh">
      <header
        data-console-header
        className="sticky top-0 z-30 grid h-(--console-header-height) grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b bg-background px-3 md:grid-cols-[minmax(0,1fr)_min(28rem,45vw)_minmax(0,1fr)]"
      >
        <div
          className="flex min-w-0 max-w-[14.5rem] items-center gap-2"
          onKeyDown={closeOnEscape}
        >
          {open && (
            <Link
              href="/dashboard"
              onClick={() => {
                if (narrow) close();
              }}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm font-serif text-xl leading-none"
            >
              <Terminal aria-hidden className="size-5 shrink-0" />
              <span className="truncate">Agent Console</span>
            </Link>
          )}
          <Button
            ref={toggleRef}
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={open}
            aria-controls="console-navigation"
            onClick={() => setExpanded(!open)}
          >
            {open ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>
        </div>
        <CommandPalette
          compact={narrow}
          onNavigate={narrow ? close : undefined}
        />
        <a
          href="https://github.com/OpenSDLC-Dev/managed-agent-platform"
          target="_blank"
          rel="noreferrer"
          aria-label="Platform documentation"
          title="Platform documentation"
          className="flex h-7 items-center gap-2 rounded-md px-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:justify-self-end md:px-2"
        >
          <BookOpen aria-hidden className="size-4" />
          <span className="hidden md:inline">Documentation</span>
        </a>
      </header>
      <div className="flex min-h-[calc(100dvh-var(--console-header-height))]">
        <aside
          data-sidebar-state={open ? "expanded" : "collapsed"}
          onKeyDown={closeOnEscape}
          className={cn(
            "group/sidebar sticky top-(--console-header-height) flex h-[calc(100dvh-var(--console-header-height))] shrink-0 flex-col border-r border-sidebar-border bg-sidebar",
            open ? "w-64" : "w-12",
            open && narrow && "w-full",
          )}
        >
          <div
            id="console-navigation"
            className="min-h-0 flex-1 overflow-y-auto pb-2"
            onClick={(event) => {
              if (narrow && (event.target as Element).closest("a")) close();
            }}
          >
            <Nav compact={!open} />
          </div>
          <div className="shrink-0">{footer}</div>
        </aside>
        <main
          hidden={open && narrow}
          className="min-w-0 flex-1 px-4 py-6 sm:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
