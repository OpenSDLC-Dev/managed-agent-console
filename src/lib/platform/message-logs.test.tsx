import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import { TEST_SESSION } from "../../../test/session-fixture";
import { useMessageLogs } from "./message-logs";
import type { GatewayUsageRow } from "./types";

const now = Date.parse("2026-11-22T10:15:00Z");
const day = 86_400_000;
const row = (id: number, changes: Partial<GatewayUsageRow> = {}) => ({
  id,
  request_id: "req_" + id,
  endpoint: "messages",
  session_id: null,
  created_at: new Date(now - 1000).toISOString(),
  ...changes,
});

function openQuery() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(useMessageLogs, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <ConsoleSessionContext.Provider
          value={{ data: TEST_SESSION } as ReturnType<typeof useConsoleSession>}
        >
          {children}
        </ConsoleSessionContext.Provider>
      </QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("reads past agent, other-protocol and older pages and includes the 30-day boundary", async () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        data: [
          row(9, { endpoint: "chat_completions" }),
          row(8, { session_id: "sesn_agent" }),
          row(7, { endpoint: "count_tokens" }),
          row(6, { created_at: new Date(now - 30 * day - 1).toISOString() }),
        ],
        has_more: true,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        data: [
          row(5),
          row(4, { created_at: new Date(now - 30 * day).toISOString() }),
        ],
        has_more: false,
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const { result } = openQuery();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.map((request) => request.id)).toEqual([5, 4]);
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    "/admin/v1/usage/requests?limit=1000",
    "/admin/v1/usage/requests?before=6&limit=1000",
  ]);
});

it("fails an unfinished read instead of treating a repeated cursor as the end of the logs", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({ data: [row(8)], has_more: true }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { result } = openQuery();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error?.message).toContain("cursor");
  expect(result.current.data).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("cancels an in-flight ledger read when both Messages views are gone", async () => {
  const fetchMock = vi
    .fn<(url: string, init: RequestInit) => Promise<Response>>()
    .mockReturnValue(new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  const { unmount } = openQuery();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const signal = fetchMock.mock.calls[0][1].signal;
  expect(signal?.aborted).toBe(false);
  unmount();
  expect(signal?.aborted).toBe(true);
});
