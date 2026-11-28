"use client";

import { useState } from "react";
import { chartSeriesColor } from "@/lib/chart-colors";
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

export type CostSeries = { name: string; index: number | null };
type CostDay = { day: string; cost: number; parts: number[] };

export function CostChart({
  days,
  series,
}: {
  days: CostDay[];
  series: CostSeries[];
}) {
  const [hoveredDay, setHoveredDay] = useState<string>();
  const [focusedDay, setFocusedDay] = useState<string>();
  const active = days.findIndex((d) => d.day === (hoveredDay ?? focusedDay));
  const { top, step, decimals } = niceScale(
    Math.max(0, ...days.map((d) => d.cost)),
  );
  const ticks = Array.from(
    { length: Math.round(top / step) + 1 },
    (_, i) => i * step,
  );
  // At most five day labels, whole weeks apart: thirteen weekly labels
  // overlapped across a phone's 90 days (PR #223 review).
  const every = 7 * Math.ceil(days.length / 35);
  const label = (i: number) =>
    [
      `${dayLabel(days[i].day)}: ${costText(days[i].cost)}`,
      ...days[i].parts.flatMap((value, j) =>
        value > 0 ? [series[j].name + " " + costText(value)] : [],
      ),
    ].join(", ");
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
          onMouseLeave={() => setHoveredDay(undefined)}
        >
          {days.map((d, i) => (
            <div
              key={d.day}
              role="listitem"
              tabIndex={0}
              aria-label={label(i)}
              data-day={d.day}
              data-cost={d.cost}
              className="relative flex h-full flex-1 items-end focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring"
              onMouseEnter={() => setHoveredDay(d.day)}
              onFocus={() => {
                setFocusedDay(d.day);
                setHoveredDay(undefined);
              }}
              onBlur={() => setFocusedDay(undefined)}
            >
              <div
                className={cn(
                  "flex w-full flex-col-reverse overflow-hidden rounded-t-[4px]",
                  hoveredDay === d.day &&
                    "outline-2 outline-offset-1 outline-ring",
                )}
                style={{
                  height: d.cost > 0 ? `max(1px, ${(d.cost / top) * 100}%)` : 0,
                }}
              >
                {d.parts.map(
                  (cost, j) =>
                    cost > 0 && (
                      <span
                        key={j}
                        data-series={j}
                        data-series-cost={cost}
                        style={{
                          flexGrow: cost / d.cost,
                          backgroundColor: chartSeriesColor(series[j].index),
                        }}
                      />
                    ),
                )}
              </div>
              {i % every === 0 && (
                <span
                  className="absolute -bottom-[20px] left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground"
                  aria-hidden
                  data-axis-day={d.day}
                >
                  {dayLabel(d.day)}
                </span>
              )}
            </div>
          ))}
        </div>
        {active >= 0 && (
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
            {days[active].parts.map(
              (value, i) =>
                value > 0 && (
                  <div className="max-w-64 truncate" key={i}>
                    {series[i].name} · {costText(value)}
                  </div>
                ),
            )}
          </div>
        )}
      </div>
      {series.length > 0 && (
        <div
          aria-label="Cost series"
          className="my-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
        >
          {series.map((group, i) => (
            <span className="inline-flex min-w-0 items-center gap-1.5" key={i}>
              <i
                data-series={i}
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: chartSeriesColor(group.index) }}
              />
              <span className="break-all">{group.name}</span>
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
