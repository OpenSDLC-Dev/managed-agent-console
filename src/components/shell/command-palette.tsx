"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Boxes,
  FileText,
  KeyRound,
  MessagesSquare,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NAV_DESTINATIONS } from "@/lib/nav";
import {
  useAgents,
  useEnvironments,
  useFiles,
  useSessions,
  useSkills,
  useVaults,
} from "@/lib/platform/queries";
import { useSurfaces, type Surface } from "@/lib/platform/surfaces";

interface Item {
  key: string;
  label: string;
  detail?: string;
  href: string;
  group: string;
  icon: LucideIcon;
  /** Set on the section shortcuts; resource hits carry no surface. */
  surface?: Surface;
}

// Order, labels and icons all come from `lib/nav.ts` — the sidebar's own
// source. The palette used to keep its own copy of the list, which meant the
// two could list the same destinations in different orders and neither was
// wrong. A group contributes its children, so this is flat where the nav nests.
//
// `surface` is absent for a console-local destination like Dashboard, which no
// probe can take away.
const SECTIONS: (Item & { surface?: Surface })[] = NAV_DESTINATIONS.map(
  ({ key, label, href, icon, surface }) => ({
    key,
    label,
    href,
    group: "Go to",
    icon,
    surface,
  }),
);

const matches = (query: string, ...fields: (string | null | undefined)[]) =>
  fields.some((f) => f?.toLowerCase().includes(query));

/**
 * Search across the first page of every resource list (the wire has no
 * search endpoint, so this filters what the lists already serve).
 */
function useSearchItems(query: string): Item[] {
  const limit = 50;
  const agents = useAgents({ limit });
  const environments = useEnvironments({ limit });
  const sessions = useSessions({});
  const vaults = useVaults({ limit });
  const skills = useSkills({ limit });
  const files = useFiles();
  // The resource groups below need no gating — an unimplemented surface's
  // query errors, so its list is simply empty. Only the "Go to" entries would
  // still offer a dead page.
  const surfaces = useSurfaces();

  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: Item[] = SECTIONS.filter(
      (s) =>
        (s.surface === undefined || surfaces?.[s.surface] !== false) &&
        (!q || s.label.toLowerCase().includes(q)),
    );
    if (!q) return items;
    for (const a of agents.data?.data ?? []) {
      if (matches(q, a.name, a.id))
        items.push({
          key: a.id,
          label: a.name,
          detail: a.id,
          href: `/agents/${a.id}`,
          group: "Agents",
          icon: Bot,
        });
    }
    for (const s of sessions.data?.data ?? []) {
      if (matches(q, s.title, s.id))
        items.push({
          key: s.id,
          label: s.title || s.id,
          detail: s.id,
          href: `/sessions/${s.id}`,
          group: "Sessions",
          icon: MessagesSquare,
        });
    }
    for (const e of environments.data?.data ?? []) {
      if (matches(q, e.name, e.id))
        items.push({
          key: e.id,
          label: e.name,
          detail: e.id,
          href: `/environments/${e.id}`,
          group: "Environments",
          icon: Boxes,
        });
    }
    for (const v of vaults.data?.data ?? []) {
      if (matches(q, v.display_name, v.id))
        items.push({
          key: v.id,
          label: v.display_name,
          detail: v.id,
          href: `/vaults/${v.id}`,
          group: "Vaults",
          icon: KeyRound,
        });
    }
    for (const s of skills.data?.data ?? []) {
      if (matches(q, s.display_title, s.id))
        items.push({
          key: s.id,
          label: s.display_title,
          detail: s.id,
          href: `/skills/${s.id}`,
          group: "Skills",
          icon: Sparkles,
        });
    }
    for (const f of files.data?.data ?? []) {
      if (matches(q, f.filename, f.id))
        items.push({
          key: f.id,
          label: f.filename,
          detail: f.id,
          href: "/files",
          group: "Files",
          icon: FileText,
        });
    }
    return items;
  }, [
    query,
    surfaces,
    agents.data,
    sessions.data,
    environments.data,
    vaults.data,
    skills.data,
    files.data,
  ]);
}

function PaletteResults({
  query,
  onNavigate,
  active,
  setActive,
  listId,
}: {
  query: string;
  onNavigate: (href: string) => void;
  active: number;
  setActive: (i: number) => void;
  listId: string;
}) {
  const items = useSearchItems(query);
  const clamped = Math.min(active, Math.max(0, items.length - 1));
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Keep the parent's index (and aria-activedescendant) on a real item.
  useEffect(() => {
    if (active !== clamped) setActive(clamped);
  }, [active, clamped, setActive]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [clamped]);

  return (
    <div id={listId} role="listbox" className="max-h-72 overflow-y-auto pb-1">
      {items.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          No matches in the loaded lists.
        </p>
      )}
      {items.map((item, i) => {
        const header =
          i === 0 || items[i - 1].group !== item.group ? item.group : null;
        return (
          <div key={`${item.group}:${item.key}`}>
            {header && (
              <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {header}
              </div>
            )}
            <button
              type="button"
              role="option"
              aria-selected={i === clamped}
              id={`${listId}-${i}`}
              data-surface={item.surface}
              ref={i === clamped ? activeRef : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => onNavigate(item.href)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm",
                i === clamped && "bg-secondary",
              )}
            >
              <item.icon
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
              <span className="truncate">{item.label}</span>
              {item.detail && (
                <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
                  {item.detail}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Ctrl+K resource search: sidebar trigger + global-shortcut dialog. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Item count lives in PaletteResults; track the pressed key here and let
  // the results clamp. Arrow handling just moves within a generous bound.
  const listId = "command-palette-results";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-2 flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
      >
        <Search className="size-4" strokeWidth={1.75} />
        Search
        <kbd className="ml-auto rounded border px-1 font-mono text-[10px]">
          Ctrl K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="gap-0 p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Search resources</DialogTitle>
          <div className="border-b p-2">
            <Input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={`${listId}-${active}`}
              placeholder="Search agents, sessions, environments…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => i + 1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  document
                    .querySelector<HTMLButtonElement>(
                      `#${listId} [aria-selected="true"]`,
                    )
                    ?.click();
                }
              }}
              className="border-none shadow-none focus-visible:ring-0"
            />
          </div>
          {open && (
            <PaletteResults
              query={query}
              onNavigate={navigate}
              active={active}
              setActive={setActive}
              listId={listId}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
