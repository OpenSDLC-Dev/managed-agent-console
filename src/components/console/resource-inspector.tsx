"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyIdButton, IdCell } from "./copy-id";

function subscribeViewport(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

/** A non-modal inspector: the list remains available while details are open. */
export function ResourceInspector({
  kind,
  children,
  id,
  previous,
  next,
  onSelect,
  onClose,
  onPreviousPage,
  onNextPage,
  dismissOnOutsidePress,
  dialogLabel,
  returnFocus,
  fallbackFocus,
  restoreToFallback,
}: {
  kind:
    | "skill"
    | "environment"
    | "memory-store"
    | "agent"
    | "session"
    | "deployment"
    | "deployment-run"
    | "service-account"
    | "request"
    | "model";
  children: React.ReactNode;
  id: string;
  previous?: string;
  next?: string;
  onSelect?: (id: string) => void;
  onClose: () => void;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  dismissOnOutsidePress?: (target: Element) => boolean;
  dialogLabel?: string;
  returnFocus?: RefObject<HTMLElement | null>;
  fallbackFocus?: RefObject<HTMLElement | null>;
  restoreToFallback?: RefObject<boolean>;
}) {
  const label = {
    skill: "Skill",
    environment: "Environment",
    "memory-store": "Memory store",
    agent: "Agent",
    session: "Session",
    deployment: "Deployment",
    "deployment-run": "Deployment run",
    "service-account": "Service account",
    request: "Request",
    model: "Model",
  }[kind];
  const request = kind === "request";
  const PreviousIcon = request ? ChevronUp : ChevronLeft;
  const NextIcon = request ? ChevronDown : ChevronRight;
  const actionSize = request ? "icon-xs" : "icon";
  const panel = useRef<HTMLElement>(null);
  const outsideClose = useRef(false);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [width, setWidth] = useState(560);
  const maxWidth = useSyncExternalStore(
    subscribeViewport,
    () => Math.max(0, Math.min(1200, window.innerWidth - 64)),
    () => 1200,
  );
  const minWidth = Math.min(320, maxWidth);
  const visibleWidth = Math.min(width, maxWidth);
  const resize = (value: number) =>
    setWidth(Math.max(minWidth, Math.min(maxWidth, value)));

  useEffect(() => {
    const trigger = document.activeElement;
    const fallback = fallbackFocus?.current;
    const finalFocus = returnFocus;
    panel.current?.focus();
    return () => {
      if (outsideClose.current) return;
      // These are the requested focus target and close reason at dismissal.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const target = restoreToFallback?.current
        ? fallback
        : (finalFocus?.current ?? trigger);
      if (
        target instanceof HTMLElement &&
        target !== document.body &&
        target !== document.documentElement &&
        target.isConnected
      )
        target.focus();
      else if (fallback?.isConnected) fallback.focus();
    };
  }, [fallbackFocus, restoreToFallback, returnFocus]);

  useEffect(() => {
    if (!dismissOnOutsidePress) return;
    function outside(event: MouseEvent) {
      const target = event.target;
      if (
        event.button === 0 &&
        target instanceof Element &&
        !panel.current?.contains(target) &&
        dismissOnOutsidePress?.(target)
      ) {
        outsideClose.current = true;
        onClose();
      }
    }
    document.addEventListener("click", outside, true);
    return () => document.removeEventListener("click", outside, true);
  }, [dismissOnOutsidePress, onClose]);

  return (
    <aside
      ref={panel}
      role={dialogLabel ? "dialog" : "region"}
      aria-label={dialogLabel ?? label + " details"}
      tabIndex={-1}
      {...{ ["data-" + kind + "-id"]: id }}
      className={cn(
        "fixed right-2 bottom-2 flex max-w-[calc(100vw-64px)] flex-col rounded-xl border bg-background shadow-lg outline-none",
        request
          ? "top-2 z-40"
          : "top-[calc(var(--console-header-height,0px)+0.5rem)] z-30",
      )}
      style={{ width: visibleWidth }}
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
    >
      <div
        role="separator"
        aria-label="Resize panel"
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={visibleWidth}
        tabIndex={0}
        title="Drag to resize, double-click to reset"
        className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize touch-none rounded focus-visible:bg-ring/20"
        onDoubleClick={() => setWidth(560)}
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
            setWidth(560);
          }
        }}
      />
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 px-4 py-2",
          request && "min-h-12",
        )}
      >
        <span
          className={cn(
            kind !== "skill"
              ? "text-sm text-muted-foreground max-[480px]:sr-only"
              : "text-sm text-muted-foreground",
            request && "text-xs",
          )}
        >
          {label}
        </span>
        {request ? (
          <CopyIdButton key={id} id={id} showValue />
        ) : (
          <IdCell key={id} id={id} />
        )}
        <div className={cn("ml-auto flex gap-1", request && "shrink-0 gap-0")}>
          {onSelect && (
            <>
              <Button
                variant="ghost"
                size={actionSize}
                aria-label={"Previous " + label.toLowerCase()}
                disabled={!previous && !onPreviousPage}
                onClick={() =>
                  previous ? onSelect(previous) : onPreviousPage?.()
                }
              >
                <PreviousIcon />
              </Button>
              <Button
                variant="ghost"
                size={actionSize}
                aria-label={"Next " + label.toLowerCase()}
                disabled={!next && !onNextPage}
                onClick={() => (next ? onSelect(next) : onNextPage?.())}
              >
                <NextIcon />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size={actionSize}
            aria-label="Close details"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      <div
        className={cn(
          kind !== "skill"
            ? "min-h-0 flex-1 px-4 pb-4 pt-1"
            : "min-h-0 flex-1 p-4",
          request && "pt-0",
        )}
      >
        {children}
      </div>
    </aside>
  );
}
