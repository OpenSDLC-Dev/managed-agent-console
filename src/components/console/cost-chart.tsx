"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { costText, dayLabel } from "./usage-bits";

/**
 * A round axis top and step: 1, 2, 2.5 or 5 times a power of ten, ≤ 4 steps.
 * A tick has the decimals a multiple of the step needs, and below a step of 1
 * at least a cost's two: a 0.025 step is not labelled "0.03".
 */
export function niceScale(max: number): {
  top: number;
  step: number;
  decimals: number;
} {
  if (max <= 0) return { top: 1, step: 0.25, decimals: 2 };
  const raw = max / 4;
  const exp = Math.floor(Math.log10(raw));
  const m = [1, 2, 2.5, 5].find((m) => m * 10 ** exp >= raw) ?? 10;
  const step = m * 10 ** exp;
  // toPrecision drops the binary residue: 3 × 0.2 is 0.6000000000000001.
  const top = Number((Math.ceil(max / step) * step).toPrecision(12));
  const decimals = Math.max(
    step < 1 ? 2 : 0,
    -exp + (m === 2.5 ? 1 : m === 10 ? -1 : 0),
  );
  return { top, step, decimals };
}

/**
 * Cost per UTC day, one bar a day. A single series in one neutral hue, so no
 * legend: the title names it. Each bar answers hover and focus with its day
 * and value; the grouped table under the chart is its table view.
 */
export function CostChart({ days }: { days: { day: string; cost: number }[] }) {
  const [active, setActive] = useState<number>();
  const { top, step, decimals } = niceScale(
    Math.max(0, ...days.map((d) => d.cost)),
  );
  const ticks = Array.from(
    { length: Math.round(top / step) + 1 },
    (_, i) => i * step,
  );
  const label = (i: number) =>
    `${dayLabel(days[i].day)}: ${costText(days[i].cost)}`;
  return (
    <figure className="mb-4 rounded-lg border bg-card px-3.5 pt-3 pb-1.5">
      <figcaption className="pb-1 text-[13px] font-medium">
        Cost per day
      </figcaption>
      <div className="relative mt-2 h-[170px] pl-10">
        {/* Recessive grid: hairlines and muted labels behind the bars. */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute right-0 left-10 border-t border-border/60"
            style={{
              bottom: `calc(22px + ${(t / top) * 100}% - ${(t / top) * 22}px)`,
            }}
            aria-hidden
          >
            <span className="absolute -top-2 -left-10 w-8 text-right text-[11px] text-muted-foreground tabular-nums">
              {t.toFixed(decimals)}
            </span>
          </div>
        ))}
        <div
          role="list"
          aria-label="Cost per day"
          className="absolute inset-0 bottom-[22px] left-10 flex items-end gap-[2px]"
          onMouseLeave={() => setActive(undefined)}
        >
          {days.map((d, i) => (
            <div
              key={d.day}
              role="listitem"
              tabIndex={0}
              aria-label={label(i)}
              data-day={d.day}
              data-cost={d.cost}
              className="group relative flex h-full flex-1 items-end outline-none"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(undefined)}
            >
              <div
                className={cn(
                  "w-full rounded-t-[4px] bg-muted-foreground/70",
                  active === i && "bg-foreground",
                  "group-focus-visible:ring-2 group-focus-visible:ring-ring",
                )}
                style={{
                  height: d.cost > 0 ? `max(1px, ${(d.cost / top) * 100}%)` : 0,
                }}
              />
              {i % 7 === 0 && (
                <span
                  className="absolute -bottom-[20px] left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground"
                  aria-hidden
                >
                  {dayLabel(d.day)}
                </span>
              )}
            </div>
          ))}
        </div>
        {active !== undefined && (
          <div
            role="tooltip"
            className={cn(
              "pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm tabular-nums",
              // Centred on its bar, but held inside the card at either edge.
              active / days.length < 0.15
                ? "translate-x-0"
                : active / days.length > 0.85
                  ? "-translate-x-full"
                  : "-translate-x-1/2",
            )}
            style={{
              left: `calc(40px + (100% - 40px) * ${(active + 0.5) / days.length})`,
              top: -6,
            }}
          >
            {dayLabel(days[active].day)} ·{" "}
            <b className="font-medium">{costText(days[active].cost)}</b>
          </div>
        )}
      </div>
    </figure>
  );
}
