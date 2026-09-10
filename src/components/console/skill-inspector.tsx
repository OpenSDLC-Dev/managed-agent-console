"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdCell } from "./copy-id";
import { SkillDetail } from "./skill-detail";

/** A non-modal inspector: the list remains available while details are open. */
export function SkillInspector({
  id,
  previous,
  next,
  onSelect,
  onClose,
}: {
  id: string;
  previous?: string;
  next?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [width, setWidth] = useState(560);
  const resize = (value: number) =>
    setWidth(Math.max(320, Math.min(1200, window.innerWidth - 64, value)));

  useEffect(() => {
    const trigger = document.activeElement;
    panel.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);

  return (
    <aside
      ref={panel}
      role="region"
      aria-label="Skill details"
      tabIndex={-1}
      data-skill-id={id}
      className="fixed inset-y-2 right-2 z-30 flex max-w-[calc(100vw-64px)] flex-col rounded-xl border bg-background shadow-lg outline-none"
      style={{ width }}
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
        aria-valuemin={320}
        aria-valuemax={1200}
        aria-valuenow={width}
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
            resize(width + (event.key === "ArrowLeft" ? 32 : -32));
          } else if (event.key === "Home") {
            event.preventDefault();
            setWidth(560);
          }
        }}
      />
      <div className="flex shrink-0 items-center gap-2 px-4 py-2">
        <span className="text-sm text-muted-foreground">Skill</span>
        <IdCell id={id} />
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous skill"
            disabled={!previous}
            onClick={() => previous && onSelect(previous)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next skill"
            disabled={!next}
            onClick={() => next && onSelect(next)}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close details"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <SkillDetail key={id} id={id} inspector onDeleted={onClose} />
      </div>
    </aside>
  );
}
