"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

function subscribeViewport(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

export const SESSION_INSPECTORS = [
  ["session", "Session"],
  ["events", "Events"],
  ["tools", "Tools"],
  ["resources", "Resources"],
  ["thread", "Threads"],
] as const;
export type SessionInspectorTab = (typeof SESSION_INSPECTORS)[number][0];

/** The detail workspace keeps the transcript available beside its inspector. */
export function SessionWorkspacePanel({
  tab,
  onTab,
  onClose,
  children,
}: {
  tab: SessionInspectorTab;
  onTab: (tab: SessionInspectorTab) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [width, setWidth] = useState(440);
  const maxWidth = useSyncExternalStore(
    subscribeViewport,
    () =>
      Math.max(
        0,
        Math.min(
          800,
          window.innerWidth - (window.innerWidth >= 1024 ? 640 : 64),
        ),
      ),
    () => 800,
  );
  const minWidth = Math.min(320, maxWidth);
  const visibleWidth = Math.min(width, maxWidth);
  const resize = (value: number) =>
    setWidth(Math.max(minWidth, Math.min(maxWidth, value)));
  useEffect(() => {
    const trigger = document.activeElement;
    panel.current?.focus();
    return () => {
      if (
        trigger instanceof HTMLElement &&
        trigger.isConnected &&
        trigger !== document.body
      )
        trigger.focus();
    };
  }, []);
  return (
    <aside
      ref={panel}
      aria-label="Session inspector"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          event.currentTarget.contains(event.target as Node)
        ) {
          event.preventDefault();
          onClose();
        }
      }}
      className="fixed inset-y-20 right-2 z-30 flex max-w-[calc(100vw-64px)] shrink-0 flex-col rounded-lg border bg-background shadow-lg lg:static lg:z-auto lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none"
      style={{ width: visibleWidth }}
    >
      <div
        role="separator"
        aria-label="Resize session inspector"
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={visibleWidth}
        tabIndex={0}
        className="absolute inset-y-0 -ml-1 w-2 cursor-col-resize touch-none focus-visible:bg-ring/20"
        onDoubleClick={() => setWidth(440)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            width: panel.current!.getBoundingClientRect().width,
          };
        }}
        onPointerMove={(event) => {
          if (drag.current)
            resize(drag.current.width + drag.current.x - event.clientX);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            resize(visibleWidth + (event.key === "ArrowLeft" ? 32 : -32));
          } else if (event.key === "Home") {
            event.preventDefault();
            setWidth(440);
          }
        }}
      />
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
        <div
          role="tablist"
          aria-label="Session inspector views"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {SESSION_INSPECTORS.map(([key, label], index) => (
            <button
              key={key}
              role="tab"
              id={panelId + "-" + key}
              aria-controls={panelId}
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => onTab(key)}
              onKeyDown={(event) => {
                const target =
                  event.key === "ArrowRight"
                    ? (index + 1) % 5
                    : event.key === "ArrowLeft"
                      ? (index + 4) % 5
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 4
                          : null;
                if (target === null) return;
                event.preventDefault();
                onTab(SESSION_INSPECTORS[target][0]);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [target]?.focus();
              }}
              className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted-foreground aria-selected:bg-secondary aria-selected:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close session inspector"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={panelId + "-" + tab}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        {children}
      </div>
    </aside>
  );
}
