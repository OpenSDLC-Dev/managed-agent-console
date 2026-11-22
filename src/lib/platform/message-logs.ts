"use client";

import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { PlatformError, gatewayGet } from "./http";
import type { GatewayUsagePage, GatewayUsageRow } from "./types";

/** The gateway normalizes prompt tokens into three disjoint buckets (modelgateway/usage.go). */
export function messageInputTokens(row: GatewayUsageRow) {
  const {
    input_tokens: uncached,
    cache_read_tokens: read,
    cache_write_tokens: write,
  } = row;
  if (uncached == null || read == null || write == null) return null;
  return { total: uncached + read + write, read, write };
}

/** The gateway's ledger cursor orders by id, not time (store/usage.go ListUsage).
 * Walk raw pages: an old, agent-only or non-Messages page can precede a match.
 * Keep only rows that can actually appear on either Messages surface.
 */
async function readMessageLogs(signal: AbortSignal) {
  const now = Date.now();
  const since = now - 30 * 86_400_000;
  const rows: GatewayUsageRow[] = [];
  let before: number | undefined;
  for (;;) {
    const page: GatewayUsagePage = await gatewayGet(
      "usage/requests",
      { before, limit: 1000 },
      signal,
    );
    for (const row of page.data) {
      const created = Date.parse(row.created_at);
      if (
        row.endpoint === "messages" &&
        !row.session_id &&
        created >= since &&
        created <= now
      ) {
        rows.push(row);
      }
    }
    if (!page.has_more) return rows;
    const cursor = page.data.at(-1)?.id;
    if (!cursor || (before !== undefined && cursor >= before)) {
      throw new Error("The gateway returned an invalid request-log cursor.");
    }
    before = cursor;
  }
}

/** Direct Messages API and Playground traffic, newest first, for the last 30 days. */
export function useMessageLogs() {
  const account = useContext(ConsoleSessionContext);
  const session = account?.error ? undefined : account?.data;
  const principal =
    session?.signed_in === true &&
    typeof session.id === "string" &&
    (session.role === "admin" || session.role === "developer")
      ? session.id
      : undefined;
  const client = useQueryClient();
  const key = ["gateway", "usage", "message-logs", principal, session?.role];
  return useQuery({
    queryKey: key,
    queryFn: principal
      ? async ({ signal }) => {
          try {
            return await readMessageLogs(signal);
          } catch (error) {
            // A later network error must never revive rows from before a denial.
            if (
              !signal.aborted &&
              error instanceof PlatformError &&
              [401, 403, 404, 501].includes(error.status)
            )
              client.setQueryData<GatewayUsageRow[]>(key, []);
            throw error;
          }
        }
      : skipToken,
    gcTime: 0,
  });
}
