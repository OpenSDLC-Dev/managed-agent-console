"use client";

import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLeaveConfirmation } from "./unsaved-changes";
import {
  switchDestination,
  useWorkspaceIndex,
  useWorkspaceSettingsAccess,
  workspaceSettings,
  workspaceSettingsHref,
} from "@/lib/platform/workspaces";
import { useRouter } from "next/navigation";
import { WorkspaceContext } from "./workspace-navigation";
import { workspaceHref } from "@/lib/platform/tenancy";
import {
  BookOpen,
  Bot,
  Boxes,
  CornerDownLeft,
  Database,
  FileText,
  KeyRound,
  MessagesSquare,
  Moon,
  Rocket,
  Search,
  Sparkles,
  SquareStack,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NAV_DESTINATIONS } from "@/lib/nav";
import { PALETTE_DOCS } from "@/lib/palette-docs";
import { surfacePaths, isReportPage, PLAYGROUND_ROUTE } from "@/lib/routes";
import { ConsoleSessionContext } from "./console-session";
import {
  useAgents,
  useDeployments,
  useDreams,
  useEnvironments,
  useFiles,
  useMemoryStores,
  useSessions,
  useSkills,
  useVaults,
} from "@/lib/platform/queries";
import {
  SURFACES,
  hasDeveloperSession,
  isSurfaceVisible,
  canOpenReport,
  useSurfaces,
  type Surface,
} from "@/lib/platform/surfaces";

interface Item {
  key: string;
  label: string;
  detail?: string;
  external?: boolean;
  href: string;
  group: string;
  icon: LucideIcon;
  /** Collection owning the shortcut or resource hit; absent for local pages. */
  surface?: Surface;
}

const matches = (query: string, ...fields: (string | null | undefined)[]) =>
  fields.some((f) => f?.toLowerCase().includes(query));

const matchesWords = (query: string, ...fields: (string | undefined)[]) =>
  query.split(/\s+/).every((word) => matches(word, ...fields));

/**
 * Search across the first page of every resource list (the wire has no
 * search endpoint, so this filters what the lists already serve).
 */
function useSearchItems(query: string): Item[] {
  const session = useContext(ConsoleSessionContext)?.data;
  const space = useContext(WorkspaceContext);
  const signedIn = Boolean(session?.signed_in && session.id);
  const workspaces = useWorkspaceIndex(signedIn && !!query.trim());
  const canViewWorkspaces = useWorkspaceSettingsAccess(session);
  const limit = 50;
  const agents = useAgents({ limit });
  const deployments = useDeployments({ limit });
  const dreams = useDreams({ limit });
  const environments = useEnvironments({ limit });
  const memoryStores = useMemoryStores({ limit });
  const sessions = useSessions({});
  const vaults = useVaults({ limit });
  const skills = useSkills({ limit });
  // Uploads only, each listed on /files: since platform #578 the unfiltered
  // list leaves out a session's copies and outputs, found from their session.
  const files = useFiles();
  // A failed list may retain cached rows. Apply the collection's read refusal
  // to both resource hits and page shortcuts.
  const surfaces = useSurfaces();

  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = (item: { surface?: Surface }) =>
      item.surface === undefined ||
      isSurfaceVisible(surfaces?.[item.surface], item.surface);
    const pages: Item[] = NAV_DESTINATIONS.filter(
      (s) =>
        visible(s) &&
        (s.href !== workspaceSettings || canViewWorkspaces) &&
        (!isReportPage(s.href) ||
          (hasDeveloperSession(session) && canOpenReport(s.href, surfaces))) &&
        (s.href !== PLAYGROUND_ROUTE || session?.playground_access === true) &&
        matchesWords(q, s.label, s.surface && SURFACES[s.surface].label),
    ).map((s) => ({
      ...s,
      group: "Pages",
      href: workspaceHref(s.href, space),
    }));
    const docs: Item[] = PALETTE_DOCS.filter((doc) =>
      q ? matchesWords(q, doc.label, doc.section, doc.topics) : doc.popular,
    ).map((doc) => ({
      key: doc.path,
      label: doc.label,
      detail: doc.section,
      group: q ? "Documentation" : "Popular docs",
      href: "https://platform.claude.com/docs/en/" + doc.path,
      icon: BookOpen,
      external: true,
    }));
    if (!q) return [...pages, ...docs];
    const spaces: Item[] = (
      signedIn && workspaces.isSuccess ? workspaces.data : []
    )
      .filter((w) => matches(q, w.name, w.id, w.public_id))
      .map((w) => ({
        key: w.id,
        label: w.name,
        group: "Workspaces",
        // The index reports the caller's effective role in this specific workspace.
        href:
          w.role === "admin"
            ? workspaceSettingsHref(w.id)
            : switchDestination(surfacePaths.agents, w),
        icon: SquareStack,
      }));
    const items: Item[] = [];
    for (const a of agents.data?.data ?? []) {
      if (matches(q, a.name, a.id))
        items.push({
          key: a.id,
          label: a.name,
          detail: a.id,
          href: `${surfacePaths.agents}/${a.id}`,
          group: "Agents",
          surface: "agents",
          icon: Bot,
        });
    }
    for (const s of sessions.data?.data ?? []) {
      if (matches(q, s.title, s.id))
        items.push({
          key: s.id,
          label: s.title || s.id,
          detail: s.id,
          href: `${surfacePaths.sessions}/${s.id}`,
          group: "Sessions",
          surface: "sessions",
          icon: MessagesSquare,
        });
    }
    for (const deployment of deployments.data?.data ?? []) {
      if (matches(q, deployment.name, deployment.id))
        items.push({
          key: deployment.id,
          label: deployment.name,
          detail: deployment.id,
          href: `${surfacePaths.deployments}/${deployment.id}`,
          group: "Deployments",
          surface: "deployments",
          icon: Rocket,
        });
    }
    for (const dream of dreams.data?.data ?? []) {
      if (matches(q, dream.id))
        items.push({
          key: dream.id,
          label: dream.id,
          href: `${surfacePaths.dreams}/${dream.id}`,
          group: "Dreams",
          surface: "dreams",
          icon: Moon,
        });
    }
    for (const e of environments.data?.data ?? []) {
      if (matches(q, e.name, e.id))
        items.push({
          key: e.id,
          label: e.name,
          detail: e.id,
          href: `${surfacePaths.environments}/${e.id}`,
          group: "Environments",
          surface: "environments",
          icon: Boxes,
        });
    }
    for (const store of memoryStores.data?.data ?? []) {
      if (matches(q, store.name, store.id))
        items.push({
          key: store.id,
          label: store.name,
          detail: store.id,
          href: `${surfacePaths["memory-stores"]}/${store.id}`,
          group: "Memory Stores",
          surface: "memory-stores",
          icon: Database,
        });
    }
    for (const v of vaults.data?.data ?? []) {
      if (matches(q, v.display_name, v.id))
        items.push({
          key: v.id,
          label: v.display_name,
          detail: v.id,
          href: `${surfacePaths.vaults}/${v.id}`,
          group: "Vaults",
          surface: "vaults",
          icon: KeyRound,
        });
    }
    for (const s of skills.data?.data ?? []) {
      if (matches(q, s.display_name, s.id))
        items.push({
          key: s.id,
          label: s.display_name,
          detail: s.id,
          href: `${surfacePaths.skills}?skill=${encodeURIComponent(s.id)}`,
          group: "Skills",
          surface: "skills",
          icon: Sparkles,
        });
    }
    for (const f of files.data?.data ?? []) {
      if (matches(q, f.filename, f.id))
        items.push({
          key: f.id,
          label: f.filename,
          detail: f.id,
          href: `${surfacePaths.files}?file=${encodeURIComponent(f.id)}`,
          group: "Files",
          surface: "files",
          icon: FileText,
        });
    }
    const resources = items.filter(visible).map((item) => ({
      ...item,
      href: workspaceHref(item.href, space),
    }));
    return [...pages, ...spaces, ...resources, ...docs];
  }, [
    query,
    session,
    signedIn,
    space,
    workspaces.data,
    workspaces.isSuccess,
    canViewWorkspaces,
    surfaces,
    agents.data,
    sessions.data,
    deployments.data,
    dreams.data,
    environments.data,
    memoryStores.data,
    vaults.data,
    skills.data,
    files.data,
  ]);
}

const listId = "command-palette-results";

function SearchDialog({
  shortcutModifier,
  onChoose,
}: {
  shortcutModifier: string;
  onChoose: () => void;
}) {
  const router = useRouter();
  const { requestLeave } = useLeaveConfirmation();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const items = useSearchItems(query);
  const activeIndex = Math.min(active, items.length - 1);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const selected = items[activeIndex];

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, selected?.key]);

  const groups = new Map<string, { item: Item; index: number }[]>();
  for (const [index, item] of items.entries()) {
    const rows = groups.get(item.group);
    if (rows) rows.push({ item, index });
    else groups.set(item.group, [{ item, index }]);
  }

  return (
    <>
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <div className="flex items-center gap-2 border-b py-2 pr-11 pl-3">
        <Search
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <Input
          autoFocus
          role="combobox"
          aria-label="Command palette"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={
            selected ? `${listId}-${activeIndex}` : undefined
          }
          placeholder="Search docs, pages, workspaces, agents"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const next = activeIndex + (e.key === "ArrowDown" ? 1 : -1);
              setActive(Math.max(0, Math.min(next, items.length - 1)));
            } else if (e.key === "Enter") {
              e.preventDefault();
              activeRef.current?.click();
            }
          }}
          className="border-none shadow-none"
        />
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        className="max-h-[min(28rem,60dvh)] overflow-y-auto px-2 pb-2"
      >
        {[...groups].map(([group, rows]) => (
          <div key={group} role="group" aria-label={group}>
            <div
              aria-hidden
              className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground"
            >
              {group}
            </div>
            {rows.map(({ item, index }) => (
              <a
                key={item.key}
                id={`${listId}-${index}`}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                data-managed-leave
                data-surface={item.surface}
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                ref={index === activeIndex ? activeRef : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.altKey ||
                    event.shiftKey
                  )
                    return;
                  if (!item.external) {
                    event.preventDefault();
                    requestLeave(() => router.push(item.href));
                  }
                  onChoose();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                  index === activeIndex && "bg-secondary",
                )}
              >
                <item.icon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <span className="truncate">{item.label}</span>
                {item.detail && (
                  <span
                    className={cn(
                      "ml-auto truncate text-xs text-muted-foreground",
                      !item.external && "font-mono text-[11px]",
                    )}
                  >
                    {item.detail}
                  </span>
                )}
                {index === activeIndex && (
                  <CornerDownLeft
                    aria-hidden
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground",
                      !item.detail && "ml-auto",
                    )}
                  />
                )}
              </a>
            ))}
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <p
          role="status"
          className="px-3 py-4 text-center text-sm text-muted-foreground"
        >
          No matches found.
        </p>
      )}
      <div className="flex items-center justify-end gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          Select <kbd>↑ ↓</kbd>
        </span>
        <span>
          Open menu <kbd>{shortcutModifier} K</kbd>
        </span>
      </div>
    </>
  );
}

/** Header trigger and keyboard access to Console search. */
export function CommandPalette({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const isMac = useSyncExternalStore(
    () => () => {},
    () => navigator.platform.startsWith("Mac"),
    () => false,
  );
  const shortcutModifier = isMac ? "⌘" : "Ctrl";
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          compact ? "Search Console" : `Search Console… ${shortcutModifier} K`
        }
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        title={compact ? "Search Console" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md border bg-background text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
          compact
            ? "size-8 justify-center border-transparent"
            : "h-7 w-full px-2.5",
        )}
      >
        <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {!compact && (
          <>
            <span className="truncate">Search Console…</span>{" "}
            <kbd
              aria-hidden
              className="ml-auto flex shrink-0 gap-0.5 font-mono text-[11px] [&>span]:rounded-sm [&>span]:border [&>span]:px-1 [&>span]:leading-4"
            >
              <span>{shortcutModifier}</span> <span>K</span>
            </kbd>
          </>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-[max(1rem,15dvh)] translate-y-0 gap-0 p-0 sm:max-w-[42rem]"
          aria-describedby={undefined}
        >
          {open && (
            <SearchDialog
              shortcutModifier={shortcutModifier}
              onChoose={() => {
                setOpen(false);
                onNavigate?.();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
