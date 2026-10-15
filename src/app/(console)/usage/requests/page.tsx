"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  EmptyState,
  ErrorState,
  IdCode,
  Time,
  UnavailableSurface,
  WARNING_BOX,
} from "@/components/console/bits";
import {
  UsageFilters,
  UsageViews,
  costText,
  exactCount,
  duration,
  useUsageNames,
} from "@/components/console/usage-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useGatewayUsageRequests,
  type GatewayUsageFilter,
} from "@/lib/platform/gateway-queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import type { GatewayUsageRow } from "@/lib/platform/types";

export default function UsageRequestsPage() {
  return (
    <Suspense>
      <Ledger />
    </Suspense>
  );
}

/**
 * The per-request ledger, newest first. `?session_id=` filters it to one
 * session: the brain sends the platform's session id as X-MAP-Session-ID, so
 * a row links back to its session and a session can link here.
 */
function Ledger() {
  const urlSession = useSearchParams().get("session_id") ?? "";
  const [filter, setFilter] = useState<GatewayUsageFilter>({});
  const [session, setSession] = useState(urlSession);
  // A link that changes only the query string, such as the Requests tab,
  // keeps this page mounted, so a new URL session replaces the typed one.
  const [seeded, setSeeded] = useState(urlSession);
  if (seeded !== urlSession) {
    setSeeded(urlSession);
    setSession(urlSession);
  }
  const query = useGatewayUsageRequests({
    ...filter,
    session_id: session.trim() || undefined,
  });
  const names = useUsageNames();

  if (isUnimplemented(query.error))
    return <UnavailableSurface surface="usage" />;

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const columns: Column<GatewayUsageRow>[] = [
    {
      key: "time",
      header: "Time",
      cell: (r) => (
        <span className="whitespace-nowrap text-[13px]">
          <Time iso={r.created_at} />
        </span>
      ),
    },
    {
      key: "key",
      header: "Key",
      cell: (r) => (
        <span className="text-[13px]" data-api-key-id={r.api_key_id}>
          {names.keyName(r.api_key_id)}
        </span>
      ),
    },
    {
      key: "model",
      header: "Model → upstream",
      className: "w-full",
      cell: (r) => (
        <span className="grid text-[13px]">
          <span className="font-mono">{r.alias}</span>
          <span className="text-muted-foreground">
            → {names.upstreamName(r.deployment_id)}
          </span>
        </span>
      ),
    },
    {
      key: "session",
      header: "Session",
      cell: (r) =>
        r.session_id ? (
          <Link
            href={`/sessions/${encodeURIComponent(r.session_id)}`}
            className="hover:underline"
          >
            <IdCode id={r.session_id} />
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "route",
      header: "Route",
      cell: (r) => (
        <span className="font-mono text-[13px]" data-protocol={r.protocol}>
          {r.endpoint}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <span className="grid justify-items-start" data-status={r.status}>
          <Badge
            variant="outline"
            className={cn("font-normal", r.status >= 400 && WARNING_BOX)}
          >
            {r.status}
          </Badge>
          {r.error_type && (
            <span className="text-xs text-muted-foreground">
              {r.error_type}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "tokens",
      header: "Tokens in / out",
      className: "text-right whitespace-nowrap",
      // Cache tokens are counted and priced apart from input, so a cached
      // call shows them too: input alone cannot explain its cost.
      cell: (r) => (
        <span
          className="grid justify-items-end text-[13px] tabular-nums"
          data-input={r.input_tokens ?? ""}
          data-output={r.output_tokens ?? ""}
          data-cache-read={r.cache_read_tokens ?? ""}
          data-cache-write={r.cache_write_tokens ?? ""}
        >
          <span>
            {exactCount(r.input_tokens)} / {exactCount(r.output_tokens)}
          </span>
          {(r.cache_read_tokens ?? 0) + (r.cache_write_tokens ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground">
              cache {exactCount(r.cache_read_tokens)} read,{" "}
              {exactCount(r.cache_write_tokens)} write
            </span>
          )}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      className: "text-right",
      cell: (r) => (
        <span className="text-[13px] tabular-nums" data-cost={r.cost ?? ""}>
          {costText(r.cost)}
        </span>
      ),
    },
    {
      key: "latency",
      header: "Latency",
      className: "text-right",
      cell: (r) => (
        <span
          className="text-[13px] tabular-nums"
          data-latency-ms={r.latency_ms}
        >
          {duration(r.latency_ms)}
        </span>
      ),
    },
    {
      key: "ttft",
      header: "TTFT",
      className: "text-right",
      cell: (r) => (
        <span
          className="text-[13px] tabular-nums"
          data-ttft-ms={r.ttft_ms ?? ""}
        >
          {r.ttft_ms === null ? "—" : duration(r.ttft_ms)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Usage"
        subtitle={`${SURFACES.usage.blurb} Days are UTC.`}
      />
      <UsageViews />
      <UsageFilters filter={filter} onChange={setFilter} seen={rows}>
        <Input
          aria-label="Session ID"
          placeholder="Session ID"
          className="h-8 w-56 font-mono text-[13px]"
          value={session}
          onChange={(e) => setSession(e.target.value)}
        />
      </UsageFilters>
      {/* A failed older page keeps the rows already loaded, as the agent
          version list does, and Load older stays to try it again. */}
      {(rows.length > 0 || !query.error) && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.id)}
          loading={query.isPending}
          empty={
            <EmptyState
              title="No requests"
              hint="Calls appear here once an agent or application sends one through the gateway."
            />
          }
        />
      )}
      {query.error && <ErrorState error={query.error} />}
      <div className="flex flex-wrap items-center gap-3 pt-3">
        {query.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load older"}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          The gateway keeps request rows for 90 days by default, and daily
          totals for good.
        </span>
      </div>
    </div>
  );
}
