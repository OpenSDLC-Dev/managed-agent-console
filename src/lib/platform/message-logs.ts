"use client";

import {
  skipToken,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  messageLedgerPages,
  messageReadRefused,
  useMessageReportSession,
} from "./message-ledger";
import type { GatewayUsageRow } from "./types";

export { messageInputTokens } from "./message-ledger";

const pageSize = 50;
type Before = number | undefined;
type PageCursor = { before?: number; newer: Before[]; seek?: string };
type LogPage = {
  rows: GatewayUsageRow[];
  before: Before;
  newer: Before[];
  older: Before;
};
type Pages = InfiniteData<LogPage>;

/** Seek with the gateway's raw cursor, retaining only a display window and the
 * numeric boundaries needed to navigate back. A missing bookmark falls back to
 * the first window. The normal list returns as soon as fifty matches arrive.
 */
async function readWindow(
  cursor: PageCursor,
  signal: AbortSignal,
): Promise<LogPage> {
  let rows: GatewayUsageRow[] = [];
  let before = cursor.before;
  const newer = [...cursor.newer];
  let first: LogPage | undefined;
  let found = !cursor.seek;
  for await (const page of messageLedgerPages(signal, Date.now(), before)) {
    for (const [index, row] of page.rows.entries()) {
      rows.push(row);
      if (row.request_id === cursor.seek) found = true;
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
  return { rows, before, newer, older: undefined };
}

export function useMessageLogs(bookmark: string | null = null) {
  const session = useMessageReportSession();
  const client = useQueryClient();
  const scope = [
    "gateway",
    "usage",
    "message-logs",
    session?.id,
    session?.role,
  ];
  const key = [...scope, bookmark];
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: { newer: [], seek: bookmark ?? undefined } as PageCursor,
    queryFn: session
      ? async ({ signal, pageParam }) => {
          try {
            return await readWindow(pageParam, signal);
          } catch (error) {
            if (!signal.aborted && messageReadRefused(error))
              client.setQueriesData<Pages>(
                { queryKey: scope },
                { pages: [], pageParams: [] },
              );
            throw error;
          }
        }
      : skipToken,
    getNextPageParam: (last): PageCursor | undefined =>
      last.older === undefined
        ? undefined
        : {
            before: last.older,
            newer: bookmark ? [...last.newer, last.before] : [],
          },
    getPreviousPageParam: (first): PageCursor | undefined =>
      first.newer.length
        ? {
            before: first.newer.at(-1),
            newer: first.newer.slice(0, -1),
          }
        : undefined,
    // Explicit Load more appends to the recent list. A bookmark moves one window at a time.
    maxPages: bookmark ? 1 : undefined,
    gcTime: 0,
  });

  async function move(direction: "newer" | "older") {
    if (query.isFetching) return;
    const prior = query.data;
    const result =
      direction === "older"
        ? await query.fetchNextPage()
        : await query.fetchPreviousPage();
    if (
      result.error ||
      !result.data ||
      !prior ||
      result.data === prior ||
      !client.getQueryCache().find({ queryKey: key, exact: true })?.isActive()
    )
      return;
    const page =
      direction === "older" ? result.data.pages.at(-1) : result.data.pages[0];
    const adjacent = direction === "older" ? page?.rows[0] : page?.rows.at(-1);
    if (!adjacent && client.getQueryData(key) === result.data) {
      // The remaining raw ledger may contain only other endpoints. Keep the
      // displayed rows and retire the exhausted cursor instead of showing an empty window.
      const edge = direction === "older" ? prior.pages.length - 1 : 0;
      client.setQueryData<Pages>(key, {
        ...prior,
        pages: prior.pages.map((p, i) =>
          i !== edge
            ? p
            : direction === "older"
              ? { ...p, older: undefined }
              : { ...p, newer: [] },
        ),
      });
    }
    return adjacent?.request_id;
  }
  return { ...query, move };
}
