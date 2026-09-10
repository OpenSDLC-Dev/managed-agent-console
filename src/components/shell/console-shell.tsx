"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BookOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Nav } from "./nav";
import { CommandPalette } from "./command-palette";
import { cn } from "@/lib/utils";

const NARROW = "(max-width: 767px)";
function subscribeViewport(callback: () => void) {
  const media = window.matchMedia(NARROW);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** Keep navigation and its footer in the viewport while the page scrolls. */
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
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? !narrow;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setExpanded(false);
    toggleRef.current?.focus();
  };

  return (
    <div className="flex min-h-screen">
      <aside
        data-sidebar-state={open ? "expanded" : "collapsed"}
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            open &&
            !event.defaultPrevented &&
            event.currentTarget.contains(event.target as Node)
          ) {
            event.preventDefault();
            close();
          }
        }}
        className={cn(
          "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar",
          open ? "w-64" : "w-12",
          open && narrow && "w-full",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center",
            open ? "px-4" : "justify-center",
          )}
        >
          {open && (
            <Link
              href="/dashboard"
              onClick={() => {
                if (narrow) close();
              }}
              className="min-w-0 flex-1 font-serif text-lg font-medium"
            >
              Agent Console
            </Link>
          )}
          <Button
            ref={toggleRef}
            variant="ghost"
            size="icon"
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={open}
            aria-controls="console-navigation"
            onClick={() => setExpanded(!open)}
          >
            {open ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>
        </div>
        <CommandPalette
          compact={!open}
          onNavigate={narrow ? close : undefined}
        />
        <div
          id="console-navigation"
          className="min-h-0 flex-1 overflow-y-auto pb-3"
          onClick={(event) => {
            if (narrow && (event.target as Element).closest("a")) close();
          }}
        >
          <Nav
            compact={!open}
            onExpand={() => {
              setExpanded(true);
              toggleRef.current?.focus();
            }}
          />
        </div>
        <div hidden={!open} className="shrink-0">
          {footer}
        </div>
        {!open && (
          <a
            href="https://github.com/OpenSDLC-Dev/managed-agent-platform"
            target="_blank"
            rel="noreferrer"
            aria-label="Platform documentation"
            title="Platform documentation"
            className="mx-auto my-3 rounded-lg p-2 hover:bg-sidebar-accent"
          >
            <BookOpen className="size-4" />
          </a>
        )}
      </aside>
      <main
        hidden={open && narrow}
        className="min-w-0 flex-1 px-4 py-6 sm:px-8"
      >
        {children}
      </main>
    </div>
  );
}
