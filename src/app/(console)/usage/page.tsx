"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  UnavailableSurface,
} from "@/components/console/bits";
import { CostChart } from "@/components/console/cost-chart";
import {
  USAGE_SELECT,
  UsageFilters,
  UsageViews,
  costText,
  lastDays,
  tokenCount,
  useUsageNames,
} from "@/components/console/usage-bits";
import { cn } from "@/lib/utils";
import {
  useGatewayDailyUsage,
  type GatewayUsageFilter,
} from "@/lib/platform/gateway-queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import type { GatewayDailyUsage } from "@/lib/platform/types";

const PERIODS = [7, 30, 90] as const;

type Totals = Pick<
  GatewayDailyUsage,
  | "requests"
  | "errors"
  | "input_tokens"
  | "output_tokens"
  | "cache_read_tokens"
  | "cost"
>;

const ZERO: Totals = {
  requests: 0,
  errors: 0,
  input_tokens: 0,
  output_tokens: 0,
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
      cache_read_tokens: t.cache_read_tokens + r.cache_read_tokens,
      cost: t.cost + r.cost,
    }),
    ZERO,
  );
}

const BY = [
  ["api_key_id", "Key"],
  ["alias", "Model"],
  ["deployment_id", "Upstream model"],
] as const;
type By = (typeof BY)[number][0];

function Tile({
  label,
  value,
  note,
  data,
}: {
  label: string;
  value: string;
  note?: string;
  data: Record<string, number>;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
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

export default function UsagePage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [filter, setFilter] = useState<GatewayUsageFilter>({});
  const [by, setBy] = useState<By>("alias");
  const range = lastDays(days);
  const { data, error, isPending } = useGatewayDailyUsage(range, filter);
  const names = useUsageNames();

  if (isUnimplemented(error)) return <UnavailableSurface surface="usage" />;

  const rows = data?.data ?? [];
  const totals = sum(rows);
  // Every day in the span, a day without traffic drawn as zero.
  const perDay = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.parse(`${range.from}T00:00:00Z`) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return { day, cost: sum(rows.filter((r) => r.day === day)).cost };
  });
  const groups = [...new Set(rows.map((r) => r[by]))]
    .map((id) => ({ id, ...sum(rows.filter((r) => r[by] === id)) }))
    .sort((a, b) => b.cost - a.cost || b.requests - a.requests);
  const groupName = (id: string) =>
    by === "api_key_id"
      ? names.keyName(id)
      : by === "deployment_id"
        ? names.upstreamName(id)
        : id;

  return (
    <div>
      <PageHeader
        title="Usage"
        subtitle={`${SURFACES.usage.blurb} Days are UTC.`}
      />
      <UsageViews />
      <UsageFilters filter={filter} onChange={setFilter}>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="sr-only">Period</span>
          <select
            className={USAGE_SELECT}
            value={days}
            onChange={(e) =>
              setDays(Number(e.target.value) as (typeof PERIODS)[number])
            }
          >
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
              note={`last ${days} days`}
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
              label="Input tokens"
              value={tokenCount(totals.input_tokens)}
              note={`+ ${tokenCount(totals.cache_read_tokens)} cache read`}
              data={{
                input: totals.input_tokens,
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
          <CostChart days={perDay} />
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
          {groups.length === 0 ? (
            <EmptyState
              title="No model calls in this period"
              hint="Calls appear here once an agent or application sends one through the gateway."
            />
          ) : (
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
                    "Cost",
                  ].map((h) => (
                    <th key={h} className="py-2 pl-3 text-right font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-b" data-group={g.id}>
                    <td
                      className={cn(
                        "py-2 pr-3",
                        by !== "api_key_id" && "font-mono text-[13px]",
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
                    ].map((n, i) => (
                      <td key={i} className="py-2 pl-3 text-right tabular-nums">
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
          )}
        </>
      )}
    </div>
  );
}
