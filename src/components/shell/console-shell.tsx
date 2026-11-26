"use client";

import {
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Menu, Terminal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Nav } from "./nav";
import { CommandPalette } from "./command-palette";
import { cn } from "@/lib/utils";
import {
  surfacePaths,
  LANDING_ROUTE,
  PLAYGROUND_ROUTE,
  playgroundOnly,
} from "@/lib/routes";
import { ConsoleSessionContext } from "./console-session";

// The menu button and the sidebar must switch at the same Tailwind md breakpoint.
const NARROW = "(width < 48rem)";
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
  const limited = playgroundOnly(useContext(ConsoleSessionContext)?.data);
  const narrow = useSyncExternalStore(
    subscribeViewport,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
  const [mobile, setMobile] = useState({ narrow, expanded: false });
  if (mobile.narrow !== narrow) setMobile({ narrow, expanded: false });
  const mobileMenuOpen = narrow && mobile.expanded;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setMobile({ narrow, expanded: false });
    toggleRef.current?.focus({ preventScroll: true });
  };

  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (
      mobileMenuOpen &&
      event.key === "Escape" &&
      !event.defaultPrevented &&
      event.currentTarget.contains(event.target as Node)
    ) {
      event.preventDefault();
      close();
    }
  };

  const ToggleIcon = mobileMenuOpen ? X : Menu;
  const pathname = usePathname();
  const platformDocs = "https://github.com/OpenSDLC-Dev/managed-agent-platform";
  const documentation = (
    <a
      href={
        pathname?.startsWith(surfacePaths.skills)
          ? platformDocs + "/blob/main/docs/plan/06_skills.md#multipart-upload"
          : pathname === surfacePaths.files
            ? platformDocs + "/blob/main/docs/plan/08_files.md"
            : platformDocs
      }
      target="_blank"
      rel="noreferrer"
      aria-label="Platform documentation"
      className={cn(
        "flex items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        narrow ? "mx-2 h-9" : "col-start-3 h-7 justify-self-end",
      )}
    >
      <BookOpen aria-hidden className="size-4" />
      Documentation
    </a>
  );

  return (
    <div className="min-h-dvh">
      <header
        data-console-header
        onKeyDown={closeOnEscape}
        className="sticky top-0 z-30 grid h-(--console-header-height) grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b bg-background px-3 md:grid-cols-[minmax(0,1fr)_min(28rem,45vw)_minmax(0,1fr)]"
      >
        <Link
          href={limited ? PLAYGROUND_ROUTE : LANDING_ROUTE}
          onClick={() => {
            if (mobileMenuOpen) close();
          }}
          className="flex min-w-0 items-center gap-2 justify-self-start rounded-sm font-serif text-xl leading-none"
        >
          <Terminal aria-hidden className="size-5 shrink-0" />
          <span className="truncate">Agent Console</span>
        </Link>
        {!limited && (
          <CommandPalette
            compact={narrow}
            onNavigate={narrow ? close : undefined}
          />
        )}
        {narrow ? (
          <Button
            ref={toggleRef}
            variant="ghost"
            size="icon"
            className="col-start-3 size-7 shrink-0 text-muted-foreground"
            aria-label={mobileMenuOpen ? "Close menu" : "Menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="console-navigation"
            onClick={() => setMobile({ narrow, expanded: !mobileMenuOpen })}
          >
            <ToggleIcon />
          </Button>
        ) : (
          documentation
        )}
      </header>
      <div className="flex min-h-[calc(100dvh-var(--console-header-height))]">
        <aside
          data-sidebar-state={
            !narrow || mobileMenuOpen ? "expanded" : "collapsed"
          }
          data-console-menu-open={mobileMenuOpen || undefined}
          role={mobileMenuOpen ? "dialog" : undefined}
          aria-label={mobileMenuOpen ? "Menu" : undefined}
          onKeyDown={closeOnEscape}
          className={cn(
            "top-(--console-header-height) flex h-[calc(100dvh-var(--console-header-height))] shrink-0 flex-col border-r border-sidebar-border bg-sidebar",
            mobileMenuOpen
              ? "fixed inset-x-0 z-20 w-full"
              : "sticky hidden w-64 md:flex",
          )}
        >
          <div
            id="console-navigation"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
            onClick={(event) => {
              if (narrow && (event.target as Element).closest("a")) close();
            }}
          >
            {(!narrow || mobileMenuOpen) && <Nav mobile={narrow} />}
          </div>
          <div className="shrink-0">
            {narrow && documentation}
            {footer}
          </div>
        </aside>
        <main
          inert={mobileMenuOpen}
          className={cn(
            "min-w-0 flex-1 px-4 py-6 sm:px-8",
            mobileMenuOpen && "invisible",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
