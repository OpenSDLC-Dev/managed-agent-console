"use client";

import {
  isCancelledError,
  skipToken,
  useInfiniteQuery,
  useIsFetching,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  messageLedgerPages,
  messageReadRefused,
  useMessageReportSession,
} from "./message-ledger";
import type { GatewayUsageRow } from "./types";

export { messageInputTokens } from "./message-ledger";

const pageSize = 50;
type Cursor = { before?: number; newer: number[] };
type LogPage = Cursor & { rows: GatewayUsageRow[]; older?: number };
type Pages = InfiniteData<LogPage>;

/** The first matching ID pins the live head. Returning to that window excludes
 * later inserts, just as the gateway's ordinary before cursor does. */
async function readWindow(
  cursor: Cursor,
  signal: AbortSignal,
  seek?: string,
): Promise<LogPage> {
  let rows: GatewayUsageRow[] = [];
  let before = cursor.before;
  const newer = [...cursor.newer];
  let first: LogPage | undefined;
  let found = !seek;
  for await (const page of messageLedgerPages(signal, Date.now(), before)) {
    for (const [index, row] of page.rows.entries()) {
      before ??= row.id + 1;
      rows.push(row);
      if (row.request_id === seek) found = true;
      if (rows.length < pageSize) continue;
      const older = index + 1 < page.rows.length ? row.id : page.nextBefore;
      if (found) return { rows, before, newer, older };
      first ??= { rows, before, newer: [], older };
      newer.push(before);
      before = row.id;
      rows = [];
    }
  }
  if (!found && first) return first;
  return { rows, before, newer };
}

function listedWindow(pages: LogPage[] | undefined, id: string) {
  if (!pages) return;
  const index = pages.findIndex((page) =>
    page.rows.some((row) => row.request_id === id),
  );
  if (index < 0) return;
  return {
    ...pages[index],
    newer: pages
      .slice(0, index)
      .flatMap((page) => (page.before === undefined ? [] : [page.before])),
  };
}

export function useMessageLogs(request: string | null = null) {
  const account = useMessageReportSession();
  const client = useQueryClient();
  const scope = [
    "gateway",
    "usage",
    "message-logs",
    account?.id,
    account?.role,
  ];
  const listKey = [...scope, "list"];
  const selectionKey = [...scope, "request", request];
  const moveKey = useMemo(
    () => ["message-log-navigation", account?.id, account?.role, request],
    [account?.id, account?.role, request],
  );
  const moving = useIsFetching({ queryKey: moveKey }) > 0;
  const [navigationError, setNavigationError] = useState<{
    key: typeof moveKey;
    error: Error;
  } | null>(null);

  async function read(cursor: Cursor, signal: AbortSignal, seek?: string) {
    try {
      return await readWindow(cursor, signal, seek);
    } catch (error) {
      if (!signal.aborted && messageReadRefused(error)) {
        client.setQueryData<Pages>(listKey, { pages: [], pageParams: [] });
        client.setQueriesData<LogPage | null>(
          { queryKey: [...scope, "request"] },
          null,
        );
      }
      throw error;
    }
  }

  // Keep a manually expanded list mounted behind the drawer. A cold bookmark
  // needs no head fetch or list copy; the current request owns its window.
  const list = useInfiniteQuery({
    queryKey: listKey,
    initialPageParam: undefined as number | undefined,
    queryFn:
      account && !request
        ? ({ pageParam, signal }) =>
            read({ before: pageParam, newer: [] }, signal)
        : skipToken,
    getNextPageParam: (last) => last.older,
    gcTime: 0,
  });
  const detail = useQuery({
    queryKey: selectionKey,
    queryFn:
      account && request
        ? async ({ signal }) => {
            const known = client.getQueryData<LogPage>(selectionKey);
            if (known?.before !== undefined) {
              const page = await read(known, signal);
              if (page.rows.some((row) => row.request_id === request))
                return page;
            }
            // Retention or reclassification may have changed the window. Only a
            // complete seek for the current request can confirm that it is absent.
            return read({ newer: [] }, signal, request);
          }
        : skipToken,
    initialData: () =>
      request ? listedWindow(list.data?.pages, request) : undefined,
    initialDataUpdatedAt: list.dataUpdatedAt,
    refetchOnMount: false,
    gcTime: 0,
  });
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey: moveKey });
    },
    [client, moveKey],
  );

  const active = request ? detail : list;
  const error =
    active.error ??
    (navigationError?.key === moveKey ? navigationError.error : null);
  const rows = useMemo(
    () =>
      error
        ? []
        : request
          ? (detail.data?.rows ?? [])
          : (list.data?.pages.flatMap((p) => p.rows) ?? []),
    [request, detail.data, list.data, error],
  );

  function remember(id: string, page: LogPage, updatedAt: number) {
    client.setQueryData([...scope, "request", id], page, { updatedAt });
  }
  function select(id: string) {
    void client.cancelQueries({ queryKey: moveKey });
    const page = request ? detail.data : listedWindow(list.data?.pages, id);
    if (page?.rows.some((row) => row.request_id === id))
      remember(id, page, active.dataUpdatedAt);
  }
  async function loadMore() {
    if (!list.hasNextPage || list.isFetching) return;
    const prior = list.data;
    const result = await list.fetchNextPage();
    if (
      prior &&
      !result.error &&
      result.data &&
      !result.data.pages.at(-1)?.rows.length &&
      client.getQueryData(listKey) === result.data
    ) {
      client.setQueryData<Pages>(listKey, {
        ...prior,
        pages: prior.pages.map((page, index) =>
          index === prior.pages.length - 1
            ? { ...page, older: undefined }
            : page,
        ),
      });
    }
  }
  // A neighboring window is speculative until the UI changes the selected
  // request. It can never replace the current request's query data.
  async function move(direction: "older" | "newer") {
    const page = detail.data;
    if (!account || !request || !page || moving || detail.isFetching) return;
    const older = direction === "older";
    const before = older ? page.older : page.newer.at(-1);
    if (before === undefined || page.before === undefined) return;
    const cursor = {
      before,
      newer: older ? [...page.newer, page.before] : page.newer.slice(0, -1),
    };
    try {
      const neighbor = await client.fetchQuery({
        queryKey: [...moveKey, direction, before],
        queryFn: ({ signal }) => read(cursor, signal),
        gcTime: 0,
      });
      if (
        !client
          .getQueryCache()
          .find({ queryKey: selectionKey, exact: true })
          ?.isActive() ||
        client.getQueryData(selectionKey) !== page
      )
        return;
      const adjacent = older ? neighbor.rows[0] : neighbor.rows.at(-1);
      if (!adjacent) {
        client.setQueryData<LogPage>(
          selectionKey,
          older ? { ...page, older: undefined } : { ...page, newer: [] },
        );
        return;
      }
      remember(adjacent.request_id, neighbor, Date.now());
      return adjacent.request_id;
    } catch (error) {
      if (!isCancelledError(error) && error instanceof Error)
        setNavigationError({ key: moveKey, error });
    }
  }
  function refetch() {
    setNavigationError(null);
    if (request)
      void client.invalidateQueries({ queryKey: listKey, exact: true });
    return active.refetch();
  }
  return {
    rows,
    error,
    isPending: active.isPending,
    isFetching: active.isFetching || moving,
    dataUpdatedAt: active.dataUpdatedAt,
    hasPreviousPage: !!request && !!detail.data?.newer.length,
    hasNextPage: request ? detail.data?.older !== undefined : list.hasNextPage,
    loadMore,
    move,
    refetch,
    select,
  };
}
