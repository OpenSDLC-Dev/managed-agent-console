"use client";

import Link from "@/components/shell/workspace-navigation";
import { useId, useMemo, type ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isPermissionDenied } from "@/lib/platform/denied";
import { useGatewayDailyUsage } from "@/lib/platform/gateway-queries";
import { PlatformError } from "@/lib/platform/http";
import type { GatewayDailyUsage } from "@/lib/platform/types";
import { useNow } from "@/lib/session-trace/use-now";
import { cn } from "@/lib/utils";
import {
  costText,
  dayLabel,
  exactCount,
  lastDays,
  tokenCount,
} from "./usage-bits";

function reportedTokens(row: GatewayDailyUsage) {
  // Gateway input excludes both cache buckets (modelgateway/usage.go).
  return (
    row.input_tokens +
    row.output_tokens +
    row.cache_write_tokens +
    row.cache_read_tokens
  );
}

type Day = { day: string; requests: number; tokens: number; cacheRead: number };

function weeklyVolume(rows: GatewayDailyUsage[], from: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const days: Day[] = Array.from({ length: 7 }, (_, i) => ({
    day: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    requests: 0,
    tokens: 0,
    cacheRead: 0,
  }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  let requests = 0;
  let tokens = 0;
  for (const row of rows) {
    const day = byDay.get(row.day);
    if (!day) continue;
    const count = reportedTokens(row);
    day.requests += row.requests;
    day.tokens += count;
    day.cacheRead += row.cache_read_tokens;
    requests += row.requests;
    tokens += count;
  }
  return { days, requests, tokens };
}

function WeeklyTrend({
  days,
  metric,
}: {
  days: Day[];
  metric: "tokens" | "cacheRead";
}) {
  const peak = Math.max(...days.map((d) => d[metric]));
  if (!peak) return null;
  // An active day with no reported tokens has unknown usage, not a measured zero.
  const points = days.map((d, i) => {
    const value = d.requests && !d.tokens ? null : d[metric];
    const height = value === null ? 0 : (value / peak) * 35;
    return { day: d.day, value, x: 11 + 23 * i, y: 38 - height, height };
  });
  const description = points
    .map(
      (p) =>
        dayLabel(p.day) +
        ": " +
        (p.value === null ? "no tokens recorded" : exactCount(p.value)),
    )
    .join(", ");
  const tokens = metric === "tokens";
  const label = tokens
    ? "Reported tokens per UTC day"
    : "Cache read tokens per UTC day, last 7 days";
  return (
    <svg
      role="img"
      aria-label={label + ". " + description + "."}
      viewBox="0 0 160 42"
      className={cn(
        "h-10 w-24 shrink-0",
        tokens ? "text-chart-volume @min-[36rem]:w-40" : "text-chart-1",
      )}
    >
      {!tokens && (
        <path
          d={points
            .map((p, i) =>
              p.value === null
                ? ""
                : `${i === 0 || points[i - 1].value === null ? "M" : "L"}${p.x},${p.y}`,
            )
            .join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      )}
      {points.map(
        (p) =>
          p.value !== null &&
          (tokens ? (
            <rect
              key={p.day}
              x={p.x - 5}
              y={p.y}
              width="10"
              height={p.height}
              rx="1"
              fill="currentColor"
              data-day={p.day}
              data-tokens={p.value}
            />
          ) : (
            <circle
              key={p.day}
              cx={p.x}
              cy={p.y}
              r="1.5"
              fill="currentColor"
              data-day={p.day}
              data-cache-read={p.value}
            />
          )),
      )}
    </svg>
  );
}

function MetricCard({
  title,
  metric,
  amount,
  note,
  help,
  week,
  children,
}: {
  title: string;
  metric: "requests" | "spend" | "cache-read" | "tokens";
  amount?: number;
  note: string;
  help?: string;
  week?: boolean;
  children?: ReactNode;
}) {
  const format = metric === "spend" ? costText : tokenCount;
  const summaryId = useId();
  const helpId = useId();
  return (
    <div
      data-dashboard-metric={metric}
      className={cn(
        "relative flex min-h-[136px] min-w-0 flex-col justify-between rounded-xl bg-muted/55 p-4 transition-colors hover:bg-muted",
        week && "@min-[36rem]:col-span-3",
      )}
    >
      <div className="flex min-h-7 items-center gap-1 text-sm text-muted-foreground">
        <h3>
          <Link
            href={week ? "/usage?range=7" : "/usage?range=mtd"}
            aria-describedby={summaryId}
            className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {title}
          </Link>
        </h3>
        {help && (
          <Tooltip>
            <TooltipTrigger
              aria-label={`About ${title.toLowerCase()}`}
              render={(props, state) => (
                <button
                  {...props}
                  aria-describedby={state.open ? helpId : undefined}
                />
              )}
              className="relative flex size-6 items-center justify-center rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="size-4" strokeWidth={1.5} aria-hidden />
            </TooltipTrigger>
            <TooltipContent role="tooltip" id={helpId}>
              {help}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div id={summaryId} className="min-w-0">
          <div
            data-value={amount}
            className="text-[22px] leading-7 font-medium tabular-nums"
          >
            {format(amount ?? null)}
          </div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{note}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Mount only after the shell's usage probe has admitted this session. */
export function DashboardUsage() {
  const now = new Date(useNow(60_000));
  const monthRead = useGatewayDailyUsage(lastDays(now.getUTCDate(), now), {});
  const weekRange = lastDays(7, now);
  const weekRead = useGatewayDailyUsage(weekRange, {});
  const monthlyRows = monthRead.error ? undefined : monthRead.data?.data;
  const weeklyRows = weekRead.error ? undefined : weekRead.data?.data;
  const month = useMemo(() => {
    if (!monthlyRows) return undefined;
    const totals = { requests: 0, spend: 0, cacheRead: 0, tokens: 0 };
    for (const row of monthlyRows) {
      totals.requests += row.requests;
      totals.spend += row.cost;
      totals.cacheRead += row.cache_read_tokens;
      totals.tokens += reportedTokens(row);
    }
    return totals;
  }, [monthlyRows]);
  const week = useMemo(
    () => weeklyRows && weeklyVolume(weeklyRows, weekRange.from),
    [weeklyRows, weekRange.from],
  );

  if (
    [monthRead.error, weekRead.error].some(
      (error) =>
        isPermissionDenied(error) ||
        (error instanceof PlatformError && error.status === 401),
    )
  ) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        You do not have access to usage.
      </p>
    );
  }
  const monthStatus = monthRead.error ? "Usage unavailable" : "Loading usage…";
  const weekStatus = weekRead.error ? "Usage unavailable" : "Loading usage…";
  // Missing prices and upstream counts contribute zero to a rollup. It can
  // show the recorded subtotal, but never pricing coverage or a cache hit rate.
  const priceUnknown = !!month?.requests && !month.spend;
  const monthTokensUnknown = !!month?.requests && !month.tokens;
  const weekTokensUnknown = !!week?.requests && !week.tokens;

  return (
    <TooltipProvider>
      <section
        aria-labelledby="dashboard-usage-heading"
        className="grid grid-cols-1 gap-3 @min-[36rem]:grid-cols-3"
      >
        <h2 id="dashboard-usage-heading" className="sr-only">
          Usage overview
        </h2>
        <MetricCard
          title="Requests this month"
          metric="requests"
          amount={month?.requests}
          note={month ? "month to date" : monthStatus}
          help="Requests recorded by the gateway since the start of the UTC month."
        />
        <MetricCard
          title="Spend this month"
          metric="spend"
          amount={priceUnknown ? undefined : month?.spend}
          note={
            !month
              ? monthStatus
              : priceUnknown
                ? "No cost recorded"
                : "Priced usage only"
          }
        />
        <MetricCard
          title="Prompt caching"
          metric="cache-read"
          amount={monthTokensUnknown ? undefined : month?.cacheRead}
          note={
            !month
              ? monthStatus
              : monthTokensUnknown
                ? "No tokens recorded"
                : "tokens reused this month"
          }
          help="Cache read tokens since the start of the UTC month. The trend shows the last seven UTC days."
        >
          {week && <WeeklyTrend days={week.days} metric="cacheRead" />}
        </MetricCard>
        <MetricCard
          title="Token volume"
          metric="tokens"
          week
          amount={weekTokensUnknown ? undefined : week?.tokens}
          note={
            !week
              ? weekStatus
              : weekTokensUnknown
                ? "No tokens recorded in the last 7 days"
                : "last 7 days"
          }
          help="Input, output, cache write and cache read tokens reported over the last seven UTC days."
        >
          {week && <WeeklyTrend days={week.days} metric="tokens" />}
        </MetricCard>
      </section>
    </TooltipProvider>
  );
}
