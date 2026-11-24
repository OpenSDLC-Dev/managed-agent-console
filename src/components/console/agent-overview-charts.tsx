"use client";

import { useState } from "react";
import Link from "next/link";
import { type AgentsOverviewReport } from "@/lib/platform/agents-overview";
import { niceScale } from "./cost-chart";

const colors = [
  "#257de0",
  "#f47230",
  "#00b894",
  "#f2a600",
  "#ee7fac",
  "#9b9a96",
];
export const chartCard =
  "min-w-0 rounded-xl border bg-card p-4 dark:bg-muted/60";
const dayFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
export const shortDay = (iso: string) => dayFormatter.format(new Date(iso));
function duration(seconds: number) {
  if (seconds < 60) return Math.round(seconds) + "s";
  if (seconds < 3600) return Math.round(seconds / 60) + "m";
  return (
    (seconds / 3600).toLocaleString(undefined, { maximumFractionDigits: 1 }) +
    "h"
  );
}
export function AgentOverviewCharts({
  report,
  agentId,
}: {
  report: AgentsOverviewReport;
  agentId?: string;
}) {
  const [day, setDay] = useState<number | null>(null);
  const [bar, setBar] = useState<number | null>(null);
  const sums = report.days.map((_, i) =>
    report.series.reduce((sum, series) => sum + series.counts[i], 0),
  );
  const max = Math.max(1, ...sums);
  const step = Math.max(1, Math.ceil(niceScale(max).step));
  const top = Math.ceil(max / step) * step;
  const longest = Math.max(
    1,
    ...report.active_time.map((x) => x.median_seconds ?? 0),
  );
  const selected = day === null ? null : report.days[day];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <figure className={chartCard} aria-label="Sessions over time">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-medium">Sessions over time</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Sessions started each day in the last 30 days, by agent.
            </p>
          </div>
          <Link
            className="text-[13px] text-link underline underline-offset-2"
            href={
              agentId
                ? "/sessions?agent=" + encodeURIComponent(agentId)
                : "/sessions"
            }
          >
            View sessions
          </Link>
        </div>
        {report.series.length ? (
          <>
            <div
              role="group"
              aria-label="Daily sessions, use the arrow keys to select a day"
              tabIndex={0}
              onFocus={() => setDay((d) => d ?? 0)}
              onBlur={() => setDay(null)}
              onMouseLeave={() => setDay(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDay(null);
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setDay((d) =>
                    Math.min(
                      report.days.length - 1,
                      Math.max(0, (d ?? 0) + (e.key === "ArrowLeft" ? -1 : 1)),
                    ),
                  );
                }
              }}
              className="relative mt-4 h-[200px] rounded-sm text-xs text-muted-foreground"
            >
              <div aria-hidden className="absolute inset-x-0 top-1 bottom-7">
                {Array.from({ length: top / step + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-0 left-7 border-t border-border/70"
                    style={{ bottom: ((i * step) / top) * 100 + "%" }}
                  >
                    <span className="absolute -left-7 -translate-y-1/2">
                      {i * step}
                    </span>
                  </div>
                ))}
                <div className="absolute inset-y-0 right-0 left-8 flex gap-[2px]">
                  {report.days.map((d, i) => (
                    <div
                      key={d}
                      className="flex min-w-0 flex-1 flex-col-reverse justify-start"
                      onPointerEnter={() => setDay(i)}
                      onClick={() => setDay(i)}
                    >
                      {report.series.map((s, j) => (
                        <i
                          key={s.id ?? "other"}
                          className="w-full rounded-[2px]"
                          style={{
                            height: (s.counts[i] / top) * 100 + "%",
                            background: colors[j],
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 ml-7 flex justify-between">
                {[0, 6, 12, 17, 23, 29].map(
                  (i) =>
                    report.days[i] && (
                      <span key={i}>{shortDay(report.days[i])}</span>
                    ),
                )}
              </div>
              {selected && day !== null && (
                <div
                  role="status"
                  className="pointer-events-none absolute top-0 z-10 max-w-[75%] rounded-lg border bg-popover p-2 text-popover-foreground shadow-md"
                  style={day < 15 ? { right: 0 } : { left: 24 }}
                >
                  <b>{shortDay(selected)}</b>
                  {report.series.map((s) => (
                    <div key={s.id ?? "other"}>
                      {s.name} · {s.counts[day]}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <figcaption className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {report.series.map((s, i) => (
                <span
                  key={s.id ?? "other"}
                  className="inline-flex items-center gap-1.5"
                >
                  <i
                    className="size-2 rounded-full"
                    style={{ background: colors[i] }}
                  />
                  {s.name}
                </span>
              ))}
            </figcaption>
          </>
        ) : (
          <p className="grid h-[218px] place-items-center text-sm text-muted-foreground">
            No session activity in the last 30 days
          </p>
        )}
      </figure>
      <figure className={chartCard} aria-label="Active time per session">
        <h2 className="text-[15px] font-medium">Active time per session</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Median time each agent spent working per session in the last 30 days,
          busiest agents first.
        </p>
        {report.active_time.length ? (
          <div
            className="relative mt-4 flex h-[200px] flex-col justify-center gap-1 rounded-sm"
            role="group"
            aria-label="Median active time, use the arrow keys to select an agent"
            tabIndex={0}
            onFocus={() => setBar(0)}
            onBlur={() => setBar(null)}
            onMouseLeave={() => setBar(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBar(null);
              if (["ArrowUp", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                setBar((i) =>
                  Math.max(
                    0,
                    Math.min(
                      report.active_time.length - 1,
                      (i ?? 0) + (e.key === "ArrowUp" ? -1 : 1),
                    ),
                  ),
                );
              }
            }}
          >
            {report.active_time.map((a, i) => (
              <div
                key={a.id}
                onPointerEnter={() => setBar(i)}
                onClick={() => setBar(i)}
                className="grid min-w-0 grid-cols-[minmax(65px,32%)_minmax(0,1fr)] items-center gap-2 text-xs"
              >
                <span className="truncate text-right text-muted-foreground">
                  {a.name}
                </span>
                <span className="flex min-w-0 items-center gap-1 pr-7">
                  <i
                    className="block h-4 shrink-0 rounded-r-sm bg-[#257de0]"
                    style={{
                      width: ((a.median_seconds ?? 0) / longest) * 100 + "%",
                    }}
                  />
                  <span>{duration(a.median_seconds ?? 0)}</span>
                </span>
              </div>
            ))}
            {bar !== null && report.active_time[bar] && (
              <div
                role="status"
                className="pointer-events-none absolute right-0 bottom-0 rounded-md border bg-popover px-2 py-1 text-xs"
              >
                {report.active_time[bar].name} ·{" "}
                {duration(report.active_time[bar].median_seconds ?? 0)}
              </div>
            )}
          </div>
        ) : (
          <p className="grid h-[218px] place-items-center text-sm text-muted-foreground">
            No active time in the last 30 days
          </p>
        )}
      </figure>
    </div>
  );
}
