"use client";

import { useContext } from "react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { hasDeveloperSession } from "./surfaces";
import { gatewayGet, PlatformError } from "./http";
import type { GatewayUsagePage, GatewayUsageRow } from "./types";

export function useMessageReportSession() {
  const account = useContext(ConsoleSessionContext);
  const session = account?.data;
  return !account?.error && hasDeveloperSession(session) ? session : undefined;
}

export function messageReadRefused(error: unknown) {
  return (
    error instanceof PlatformError &&
    [401, 403, 404, 501].includes(error.status)
  );
}

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

/** The ledger cursor orders by ID. Keep scanning after an old or non-Messages page. */
export async function* messageLedgerPages(
  signal: AbortSignal,
  now = Date.now(),
  before?: number,
) {
  const since = now - 30 * 86_400_000;
  for (;;) {
    const page: GatewayUsagePage = await gatewayGet(
      "usage/requests",
      { before, limit: 1000 },
      signal,
    );
    const nextBefore = page.has_more ? page.data.at(-1)?.id : undefined;
    if (
      page.has_more &&
      (!nextBefore || (before !== undefined && nextBefore >= before))
    )
      throw new Error("The gateway returned an invalid request-log cursor.");
    yield {
      rows: page.data.filter((row) => {
        const created = Date.parse(row.created_at);
        // Owned API keys may also specify a routing affinity. Delegated calls
        // have a session but no key id (modelgateway/auth.go and usage.go).
        return (
          row.endpoint === "messages" &&
          (row.api_key_id || !row.session_id) &&
          created >= since &&
          created <= now
        );
      }),
      nextBefore,
    };
    if (nextBefore === undefined) return;
    before = nextBefore;
  }
}
