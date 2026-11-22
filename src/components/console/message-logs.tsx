"use client";

import { useEffect, useRef } from "react";
import { Popover } from "@base-ui/react/popover";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  messageInputTokens,
  useMessageLogs,
} from "@/lib/platform/message-logs";
import { isUnimplemented } from "@/lib/platform/surfaces";
import type { GatewayUsageRow } from "@/lib/platform/types";
import { useListFilters } from "@/lib/use-list-filters";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, UnavailableSurface } from "./bits";
import { CopyIdButton } from "./copy-id";
import { DataTable, type Column } from "./data-table";
import { Field } from "./detail";
import { ResourceInspector } from "./resource-inspector";
import { duration, exactCount } from "./usage-bits";

const requestTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const asOfTime = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "shortOffset",
});

function RequestTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={iso}>
      {requestTime.format(new Date(iso))}
    </time>
  );
}

function RequestStatus({
  row,
  errorsOnly,
}: {
  row: GatewayUsageRow;
  errorsOnly?: boolean;
}) {
  const ok = row.status >= 200 && row.status < 300 && !row.error_type;
  if (ok && errorsOnly) return null;
  return (
    <span
      data-status={row.status}
      data-error-type={row.error_type ?? undefined}
      title={`HTTP ${row.status}${row.error_type ? " · " + row.error_type : ""}`}
      className="inline-flex items-center gap-2 text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          ok ? "bg-green-600 dark:bg-green-500" : "bg-destructive",
        )}
      />
      {ok ? "OK" : "Error"}
    </span>
  );
}

function RequestLatency({ ms, digits = 2 }: { ms: number; digits?: number }) {
  return (
    <span data-latency-ms={ms} title={`${ms} ms`}>
      {(ms / 1000).toFixed(digits)} s
    </span>
  );
}

function ServiceTier() {
  return (
    <span title="Service tier is unavailable in the gateway ledger.">—</span>
  );
}

const detailFields =
  "grid grid-cols-[min(7.75rem,46%)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-xs leading-[17px]";

function RequestDetail({ row }: { row: GatewayUsageRow }) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <div ref={content} className="h-full overflow-y-auto pb-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 break-all text-[15px] leading-5 font-medium">
          {row.model || "—"}
        </h2>
        <RequestStatus row={row} errorsOnly />
      </div>
      <dl className={cn(detailFields, "mt-5")}>
        <Field label="Time">
          <RequestTime iso={row.created_at} />
        </Field>
        <Field label="Model">{row.model || "—"}</Field>
        <Field label="Type">
          <span title="Streaming mode is unavailable in the gateway ledger.">
            —
          </span>
        </Field>
        <Field label="Service tier">
          <ServiceTier />
        </Field>
        <dt className="text-muted-foreground">
          <Popover.Root>
            <Popover.Trigger
              aria-label="About latency"
              className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              Latency
            </Popover.Trigger>
            <Popover.Portal container={content}>
              <Popover.Positioner align="start" sideOffset={6} className="z-50">
                <Popover.Popup
                  aria-label="Latency"
                  className="max-w-64 rounded-lg border bg-popover p-3 text-xs leading-5 text-popover-foreground shadow-md"
                >
                  Total gateway processing time.
                  {row.ttft_ms !== null && (
                    <span data-ttft-ms={row.ttft_ms}>
                      {" "}
                      Time to first token was {duration(row.ttft_ms)}.
                    </span>
                  )}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </dt>
        <dd>
          <RequestLatency ms={row.latency_ms} digits={3} />
        </dd>
        {row.error_type && <Field label="Error">{row.error_type}</Field>}
      </dl>
      <section aria-label="Authentication" className="mt-10">
        <h3 className="mb-2 font-medium">Authentication</h3>
        <dl className={detailFields}>
          {row.api_key_id && (
            <Field label="API key">
              <code className="break-all text-xs">{row.api_key_id}</code>
            </Field>
          )}
          {(row.principal_id || !row.api_key_id) && (
            <Field label="Principal">
              <code className="break-all text-xs">
                {row.principal_id || "—"}
              </code>
            </Field>
          )}
        </dl>
      </section>
      <section aria-label="Tokens" className="mt-10">
        <h3 className="mb-2 font-medium">Tokens</h3>
        <dl className={cn(detailFields, "tabular-nums")}>
          <Field label="Input (uncached)">
            <span data-input-tokens={row.input_tokens ?? ""}>
              {exactCount(row.input_tokens)}
            </span>
          </Field>
          <Field label="Cache read">
            <span data-cache-read-tokens={row.cache_read_tokens ?? ""}>
              {exactCount(row.cache_read_tokens)}
            </span>
          </Field>
          <Field label="Cache write">
            <span data-cache-write-tokens={row.cache_write_tokens ?? ""}>
              {exactCount(row.cache_write_tokens)}
            </span>
          </Field>
          <Field label="Output">
            <span data-output-tokens={row.output_tokens ?? ""}>
              {exactCount(row.output_tokens)}
            </span>
          </Field>
        </dl>
      </section>
    </div>
  );
}

export function MessageLogs() {
  const { params, update } = useListFilters();
  const request = params.get("request");
  const query = useMessageLogs(request);
  const logs = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const rows = query.rows;
  const index = request
    ? rows.findIndex((row) => row.request_id === request)
    : -1;
  const selected = rows[index];
  function select(id: string, mode: "push" | "replace" = "push") {
    query.select(id);
    update({ request: id }, mode);
  }
  async function move(direction: "newer" | "older") {
    const href = window.location.href;
    const id = await query.move(direction);
    if (id && window.location.href === href && logs.current)
      update({ request: id }, "replace");
  }
  const close = () => update({ request: null });
  // A different row can open the same inspector. At either end the focused
  // navigation button also becomes disabled. Keep the keyboard in the panel.
  useEffect(() => {
    if (!request) return;
    const panel = logs.current?.querySelector<HTMLElement>("[data-request-id]");
    const focused = document.activeElement;
    if (panel && (!panel.contains(focused) || focused?.matches(":disabled")))
      panel.focus();
  }, [request]);
  function openRow(row: GatewayUsageRow) {
    if (document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
    select(row.request_id);
    if (request === row.request_id)
      logs.current?.querySelector<HTMLElement>("[data-request-id]")?.focus();
  }
  const columns: Column<GatewayUsageRow>[] = [
    {
      key: "id",
      header: "ID",
      className: "w-[18%] pl-0",
      cell: (row) => (
        <span
          data-id={row.request_id}
          className="group inline-flex items-center gap-1"
        >
          <button
            type="button"
            aria-label={row.request_id}
            title={row.request_id}
            className="max-w-[32ch] truncate rounded font-mono text-[13px] hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              openRow(row);
            }}
          >
            {row.request_id}
          </button>
          <span className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <CopyIdButton id={row.request_id} />
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-[7%] min-w-[4.5rem]",
      cell: (row) => <RequestStatus row={row} />,
    },
    {
      key: "time",
      header: "Time",
      className: "w-[10%] text-muted-foreground",
      cell: (row) => <RequestTime iso={row.created_at} />,
    },
    {
      key: "model",
      header: "Model",
      cell: (row) => <span data-model={row.model}>{row.model || "—"}</span>,
    },
    {
      key: "input",
      header: "Input tokens",
      className: "w-[7.5rem] text-right tabular-nums",
      cell: (row) => {
        const input = messageInputTokens(row)?.total ?? null;
        return <span data-input-tokens={input ?? ""}>{exactCount(input)}</span>;
      },
    },
    {
      key: "output",
      header: "Output tokens",
      className: "w-[7.5rem] text-right tabular-nums",
      cell: (row) => (
        <span data-output-tokens={row.output_tokens ?? ""}>
          {exactCount(row.output_tokens)}
        </span>
      ),
    },
    {
      key: "latency",
      header: "Latency",
      className: "w-[5.5rem] text-right tabular-nums",
      cell: (row) => <RequestLatency ms={row.latency_ms} />,
    },
    {
      key: "tier",
      header: "Service tier",
      className: "w-[6rem] pl-4",
      cell: () => <ServiceTier />,
    },
  ];

  if (isUnimplemented(query.error))
    return <UnavailableSurface surface="usage" />;
  return (
    <div ref={logs} className="sm:-mx-2 [&_[data-slot=table-cell]]:py-3">
      <header className="pb-3">
        <h1 className="font-serif text-2xl font-medium leading-7">Logs</h1>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">
          Messages API requests and Playground runs retained by the gateway from
          the last 30 days. Managed Agent sessions are excluded.
        </p>
      </header>
      {query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          label="Logs"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.request_id}
          onRowClick={openRow}
          activeRowKey={request ?? undefined}
          loading={query.isPending}
          empty={<EmptyState title="No logs in the last 30 days." />}
        />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 text-xs text-muted-foreground">
        {query.hasNextPage && !request && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mr-auto"
            disabled={query.isFetching}
            onClick={() => void query.loadMore()}
          >
            Load more
          </Button>
        )}
        {!!query.dataUpdatedAt && !query.error && (
          <span>
            As of{" "}
            <time dateTime={new Date(query.dataUpdatedAt).toISOString()}>
              {asOfTime.format(query.dataUpdatedAt)}
            </time>
          </span>
        )}
        <Button
          ref={refreshButton}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh"
          title="Refresh"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RotateCw
            className={cn(
              "size-3.5",
              query.isFetching && "motion-safe:animate-spin",
            )}
          />
        </Button>
      </div>
      {request && !query.isPending && !query.error && (
        <ResourceInspector
          kind="request"
          id={request}
          dialogLabel="Request details"
          previous={rows[index - 1]?.request_id}
          next={selected ? rows[index + 1]?.request_id : undefined}
          onSelect={(id) => select(id, "replace")}
          onPreviousPage={
            selected && query.hasPreviousPage && !query.isFetching
              ? () => void move("newer")
              : undefined
          }
          onNextPage={
            selected && query.hasNextPage && !query.isFetching
              ? () => void move("older")
              : undefined
          }
          dismissOnOutsidePress={(target) =>
            !logs.current?.contains(target.closest("tbody tr"))
          }
          onClose={close}
          returnFocus={opener}
          fallbackFocus={refreshButton}
        >
          {selected ? (
            <RequestDetail key={selected.id} row={selected} />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Request not found in the last 30 days.
            </p>
          )}
        </ResourceInspector>
      )}
    </div>
  );
}
