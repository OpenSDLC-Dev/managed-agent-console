"use client";

import { Suspense, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  UnavailableSurface,
} from "@/components/console/bits";
import { chartSeriesLimit } from "@/lib/chart-colors";
import { CostChart, type CostSeries } from "@/components/console/cost-chart";
import {
  USAGE_SELECT,
  UsageFilters,
  UsageViews,
  costText,
  exactCount,
  lastDays,
  tokenCount,
  useUsageNames,
} from "@/components/console/usage-bits";
import { cn } from "@/lib/utils";
import { useListFilters } from "@/lib/use-list-filters";
import { useGatewayDailyUsage } from "@/lib/platform/gateway-queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import type { GatewayDailyUsage } from "@/lib/platform/types";

const PERIODS = [7, 30, 90] as const;
/**
 * The grouped table's rows, highest cost first. A read can name thousands of
 * keys or models, and a row for each would stall the page; the filters reach
 * the rest.
 */
const SHOWN_GROUPS = 100;

type Totals = Pick<
  GatewayDailyUsage,
  | "requests"
  | "errors"
  | "input_tokens"
  | "output_tokens"
  | "cache_write_tokens"
  | "cache_read_tokens"
  | "cost"
>;

const ZERO: Totals = {
  requests: 0,
  errors: 0,
  input_tokens: 0,
  output_tokens: 0,
  cache_write_tokens: 0,
  cache_read_tokens: 0,
  cost: 0,
};

/**
 * Sums of the rollups the gateway serves (plan 10 decision 8): presentation
 * of its rows, not a second count of its traffic.
 */
function sum(rows: GatewayDailyUsage[]): Totals {
  return rows.reduce(
    (t, r) => ({
      requests: t.requests + r.requests,
      errors: t.errors + r.errors,
      input_tokens: t.input_tokens + r.input_tokens,
      output_tokens: t.output_tokens + r.output_tokens,
      cache_write_tokens: t.cache_write_tokens + r.cache_write_tokens,
      cache_read_tokens: t.cache_read_tokens + r.cache_read_tokens,
      cost: t.cost + r.cost,
    }),
    ZERO,
  );
}

const BY = [
  ["principal_id", "Principal"],
  ["alias", "Model"],
  ["deployment_id", "Upstream model"],
] as const;
type By = (typeof BY)[number][0];

function revealUsageAnchor(element: HTMLDivElement | null) {
  if (element && window.location.hash === `#${element.id}`) {
    element.scrollIntoView({ block: "start" });
  }
}

function Tile({
  id,
  label,
  value,
  note,
  data,
}: {
  id?: string;
  label: string;
  value: string;
  note?: React.ReactNode;
  data: Record<string, number>;
}) {
  return (
    <div
      id={id}
      ref={id ? revealUsageAnchor : undefined}
      className="scroll-mt-16 rounded-lg border bg-card px-3 py-2.5"
    >
      <div className="text-[12.5px] text-muted-foreground">{label}</div>
      <div
        className="text-xl font-medium tabular-nums"
        {...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [`data-${k}`, v]),
        )}
      >
        {value}
      </div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

/**
 * The rows under each key, in one pass: a read can answer 50,000 rows
 * (usage.go maxDailyRows). Not Map.groupBy, which is newer than the
 * browsers Next.js supports (Chrome 117, Safari 17.4).
 */
function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

export default function UsagePage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <UsageOverview />
    </Suspense>
  );
}

function UsageOverview() {
  const { params, update } = useListFilters();
  const filter = {
    api_key_id: params.get("api_key") || undefined,
    principal_id: params.get("principal_id") || undefined,
    alias: params.get("alias") || undefined,
    deployment_id: params.get("deployment_id") || undefined,
  };
  const selectedRange = params.get("range");
  const period =
    selectedRange === "mtd"
      ? "mtd"
      : (PERIODS.find((n) => String(n) === selectedRange) ?? 30);
  const [by, setBy] = useState<By>("alias");
  // The gateway bills UTC days. The same instant fixes both ends at month rollover.
  const now = new Date();
  const days = period === "mtd" ? now.getUTCDate() : period;
  const range = lastDays(days, now);
  const { data, error, isPending } = useGatewayDailyUsage(range, filter);
  const names = useUsageNames();

  if (isUnimplemented(error)) return <UnavailableSurface surface="usage" />;

  const rows = data?.data ?? [];
  const totals = sum(rows);
  const groupKey = (row: GatewayDailyUsage) =>
    by === "principal_id" ? row.principal_id || row.api_key_id : row[by];
  const groups = [...groupBy(rows, groupKey)]
    .map(([id, group]) => ({ id, ...sum(group) }))
    .sort((a, b) => b.cost - a.cost || b.requests - a.requests);
  const groupName = (id: string) =>
    by === "principal_id"
      ? names.keyName(id)
      : by === "deployment_id"
        ? names.upstreamName(id)
        : id;

  const leading = groups
    .filter((group) => group.cost > 0)
    .slice(0, chartSeriesLimit);
  const rank = new Map(leading.map((group, i) => [group.id, i]));
  const series: CostSeries[] = leading.map((group, index) => ({
    name: groupName(group.id),
    index,
  }));
  // A group's costs can offset across days while individual days still need a segment.
  if (rows.some((row) => row.cost !== 0 && !rank.has(groupKey(row))))
    series.push({ name: "Other", index: null });
  const byDay = groupBy(rows, (row) => row.day);
  const perDay = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.parse(`${range.from}T00:00:00Z`) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const parts = Array<number>(series.length).fill(0);
    let cost = 0;
    for (const row of byDay.get(day) ?? []) {
      if (!row.cost) continue;
      parts[rank.get(groupKey(row)) ?? leading.length] += row.cost;
      cost += row.cost;
    }
    return { day, cost, parts };
  });

  return (
    <div>
      <PageHeader
        title="Usage"
        subtitle={`${SURFACES.usage.blurb} Days are UTC.`}
      />
      <UsageViews />
      <UsageFilters
        filter={filter}
        seen={rows}
        onChange={(next) =>
          update({
            api_key: next.api_key_id ?? null,
            principal_id: next.principal_id ?? null,
            alias: next.alias ?? null,
            deployment_id: next.deployment_id ?? null,
          })
        }
      >
        <label className="flex items-center gap-1.5 text-sm">
          <span className="sr-only">Period</span>
          <select
            className={USAGE_SELECT}
            value={period}
            onChange={(e) =>
              update({ range: e.target.value === "30" ? null : e.target.value })
            }
          >
            <option value="mtd">Month to date</option>
            {PERIODS.map((n) => (
              <option key={n} value={n}>
                Last {n} days
              </option>
            ))}
          </select>
        </label>
      </UsageFilters>
      {error ? (
        <ErrorState error={error} />
      ) : isPending ? (
        <ListSkeleton />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <Tile
              label="Requests"
              value={tokenCount(totals.requests)}
              note={period === "mtd" ? "month to date" : `last ${days} days`}
              data={{ requests: totals.requests }}
            />
            <Tile
              label="Errors"
              value={tokenCount(totals.errors)}
              note={
                totals.requests
                  ? `${((totals.errors / totals.requests) * 100).toFixed(1)}% of requests`
                  : undefined
              }
              data={{ errors: totals.errors }}
            />
            <Tile
              id="input-tokens"
              label="Input tokens"
              value={tokenCount(totals.input_tokens)}
              note={
                <>
                  + {tokenCount(totals.cache_read_tokens)} cache read
                  <br />+ {tokenCount(totals.cache_write_tokens)} cache write
                </>
              }
              data={{
                input: totals.input_tokens,
                "cache-write": totals.cache_write_tokens,
                "cache-read": totals.cache_read_tokens,
              }}
            />
            <Tile
              label="Output tokens"
              value={tokenCount(totals.output_tokens)}
              data={{ output: totals.output_tokens }}
            />
            <Tile
              label="Cost"
              value={costText(totals.cost)}
              note="at your upstream prices"
              data={{ cost: totals.cost }}
            />
          </div>
          <CostChart
            key={`${range.from}/${range.to}`}
            days={perDay}
            series={series}
          />
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-sm font-medium">By</span>
            <span className="inline-flex gap-0.5 rounded-lg border p-0.5">
              {BY.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={by === value}
                  className={cn(
                    "rounded-md px-2.5 py-0.5 text-[13px]",
                    by === value && "bg-secondary font-medium",
                  )}
                  onClick={() => setBy(value)}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
          {by === "principal_id" && (
            <p className="pb-2 text-xs text-muted-foreground">
              Owned keys share their principal&apos;s totals. Historical and
              unowned calls remain under their key.
            </p>
          )}
          {groups.length === 0 ? (
            <EmptyState
              title="No model calls in this period"
              hint="Calls appear here once an agent or application sends one through the gateway."
            />
          ) : (
            // A phone scrolls the table, not the page (PR #223 review).
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-by={by}>
                <thead>
                  <tr className="border-b text-left text-[13px] text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">
                      {BY.find(([v]) => v === by)![1]}
                    </th>
                    {[
                      "Requests",
                      "Errors",
                      "Input",
                      "Output",
                      "Cache read",
                      "Cache write",
                      "Cost",
                    ].map((h) => (
                      <th key={h} className="py-2 pl-3 text-right font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.slice(0, SHOWN_GROUPS).map((g) => (
                    <tr key={g.id} className="border-b" data-group={g.id}>
                      <td
                        className={cn(
                          "py-2 pr-3",
                          by !== "principal_id" && "font-mono text-[13px]",
                        )}
                      >
                        {groupName(g.id)}
                      </td>
                      {[
                        g.requests,
                        g.errors,
                        g.input_tokens,
                        g.output_tokens,
                        g.cache_read_tokens,
                        g.cache_write_tokens,
                      ].map((n, i) => (
                        <td
                          key={i}
                          className="py-2 pl-3 text-right tabular-nums"
                        >
                          {tokenCount(n)}
                        </td>
                      ))}
                      <td
                        className="py-2 pl-3 text-right tabular-nums"
                        data-cost={g.cost}
                      >
                        {costText(g.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {groups.length > SHOWN_GROUPS && (
            <p
              className="pt-2 text-xs text-muted-foreground"
              data-hidden-groups={groups.length - SHOWN_GROUPS}
            >
              {exactCount(groups.length - SHOWN_GROUPS)} more, each with a lower
              cost. Filter by key, model or upstream model to see one.
            </p>
          )}
        </>
      )}
    </div>
  );
}
