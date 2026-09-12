"use client";

import { createContext, useContext, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { useMemories } from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import { ErrorState } from "./bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TreeFocus = createContext<{
  path: string | null;
  setPath: (path: string | null) => void;
}>({ path: null, setPath: () => {} });

/** Prefix nodes are the platform's depth=1 rollups, never synthesized directories. */
export function MemoryTree({
  storeId,
  selectedId,
  revealPath,
  onSelect,
}: {
  storeId: string;
  selectedId?: string;
  revealPath?: string;
  onSelect: (id: string) => void;
}) {
  const [path, setPath] = useState<string | null>(null);
  return (
    <TreeFocus value={{ path, setPath }}>
      <div
        role="tree"
        aria-label="Memories"
        onKeyDown={(event) => {
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="treeitem"]',
            ),
          );
          const current = event.target as HTMLButtonElement;
          const index = items.indexOf(current);
          if (index < 0) return;
          let target: HTMLButtonElement | undefined;
          if (event.key === "ArrowDown")
            target = items[Math.min(index + 1, items.length - 1)];
          if (event.key === "ArrowUp") target = items[Math.max(index - 1, 0)];
          if (event.key === "Home") target = items[0];
          if (event.key === "End") target = items.at(-1);
          if (event.key === "ArrowLeft")
            target = current.closest('[role="group"]')
              ?.previousElementSibling as HTMLButtonElement | undefined;
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <MemoryLevel
          storeId={storeId}
          prefix="/"
          level={1}
          selectedId={selectedId}
          revealPath={revealPath}
          onSelect={onSelect}
        />
      </div>
    </TreeFocus>
  );
}

function MemoryLevel({
  storeId,
  prefix,
  level,
  selectedId,
  revealPath,
  onSelect,
}: {
  storeId: string;
  prefix: string;
  level: number;
  selectedId?: string;
  revealPath?: string;
  onSelect: (id: string) => void;
}) {
  const pager = useCursorPage(storeId + ":" + prefix);
  const query = useMemories(storeId, {
    path_prefix: prefix,
    depth: 1,
    page: pager.page,
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const focus = useContext(TreeFocus);
  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending)
    return (
      <p aria-busy="true" className="p-2 text-xs text-muted-foreground">
        Loading memories…
      </p>
    );
  const rows = query.data?.data ?? [];
  return (
    <>
      {rows.length === 0 && (
        <p className="p-2 text-sm text-muted-foreground">No memories</p>
      )}
      {rows.map((item, index) => {
        const folder = item.type === "memory_prefix";
        const open =
          folder &&
          (expanded[item.path] ?? revealPath?.startsWith(item.path) ?? false);
        const name = item.path.slice(prefix.length).replace(/\/$/, "");
        const active = !folder && selectedId === item.id;
        return (
          <div key={item.path}>
            <button
              type="button"
              role="treeitem"
              aria-level={level}
              aria-expanded={folder ? open : undefined}
              aria-selected={active}
              data-path={item.path}
              tabIndex={
                focus.path === item.path ||
                (!focus.path && level === 1 && index === 0)
                  ? 0
                  : -1
              }
              className={cn(
                "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring",
                active && "bg-secondary",
              )}
              onFocus={() => focus.setPath(item.path)}
              onClick={() =>
                folder
                  ? setExpanded({ ...expanded, [item.path]: !open })
                  : onSelect(item.id)
              }
              onKeyDown={(event) => {
                if (folder && event.key === "ArrowRight") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!open) setExpanded({ ...expanded, [item.path]: true });
                  else
                    (
                      event.currentTarget.nextElementSibling?.querySelector(
                        '[role="treeitem"]',
                      ) as HTMLElement | null
                    )?.focus();
                } else if (folder && open && event.key === "ArrowLeft") {
                  event.preventDefault();
                  event.stopPropagation();
                  setExpanded({ ...expanded, [item.path]: false });
                }
              }}
            >
              {folder ? (
                open ? (
                  <ChevronDown className="size-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0" />
                )
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              {folder ? (
                <Folder className="size-3.5 shrink-0" />
              ) : (
                <FileText className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate" title={item.path}>
                {name}
              </span>
              {!folder && (
                <span
                  className="text-xs text-muted-foreground"
                  data-size-bytes={item.content_size_bytes}
                >
                  {item.content_size_bytes.toLocaleString()} B
                </span>
              )}
            </button>
            {open && (
              <div role="group" className="pl-4">
                <MemoryLevel
                  storeId={storeId}
                  prefix={item.path}
                  level={level + 1}
                  selectedId={selectedId}
                  revealPath={revealPath}
                  onSelect={onSelect}
                />
              </div>
            )}
          </div>
        );
      })}
      {(pager.hasPrev || query.data?.next_page) && (
        <div className="flex gap-2 px-2 pt-2" aria-label={"Pages in " + prefix}>
          <Button
            size="sm"
            variant="ghost"
            disabled={!pager.hasPrev || query.isPlaceholderData}
            onClick={() => {
              focus.setPath(null);
              pager.goPrev();
            }}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!query.data?.next_page || query.isPlaceholderData}
            onClick={() => {
              focus.setPath(null);
              if (query.data?.next_page) pager.goNext(query.data.next_page);
            }}
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}
