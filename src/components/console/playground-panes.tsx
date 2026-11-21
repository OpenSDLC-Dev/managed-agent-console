import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";

export function PlaygroundPanes({
  children,
  onKeyDown,
}: {
  children: ReactNode;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
}) {
  const [percent, setPercent] = useState(50);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; percent: number } | null>(
    null,
  );
  const resize = (value: number) =>
    setPercent(Math.min(80, Math.max(20, value)));
  return (
    <div
      ref={grid}
      className="relative grid min-h-0 flex-1 lg:grid-cols-[var(--request-width)_minmax(0,1fr)]"
      style={{ "--request-width": `${percent}%` } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      {children}
      <div
        role="separator"
        aria-label="Resize the request and response panes"
        aria-orientation="vertical"
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(percent)}
        tabIndex={0}
        className="absolute inset-y-0 left-(--request-width) z-10 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none focus-visible:bg-ring/20 lg:block"
        onPointerDown={(event) => {
          const width = grid.current?.getBoundingClientRect().width;
          if (event.button !== 0 || !width) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, width, percent };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start && event.currentTarget.hasPointerCapture(event.pointerId))
            resize(
              start.percent + ((event.clientX - start.x) * 100) / start.width,
            );
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onDoubleClick={() => setPercent(50)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            resize(percent + (event.key === "ArrowLeft" ? -1 : 1));
          }
        }}
      />
    </div>
  );
}
