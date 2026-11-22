import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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
  api_key_id: "",
  session_id: null,
  created_at: new Date(now - 1000).toISOString(),
  ...changes,
});

function openQuery(bookmark: string | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useMessageLogs(bookmark), {
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
          row(5, { api_key_id: "apikey_owned", session_id: "shopper-123" }),
          row(4, { created_at: new Date(now - 30 * day).toISOString() }),
        ],
        has_more: false,
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const { result } = openQuery();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(
    result.current.data?.pages[0].rows.map((request) => request.id),
  ).toEqual([5, 4]);
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    "/admin/v1/usage/requests?limit=1000",
    "/admin/v1/usage/requests?before=6&limit=1000",
  ]);
});

function largeLedger(count: number) {
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi.fn(async (path: string) => {
    const query = new URL(path, "http://console.test").searchParams;
    const first = Math.min(count, Number(query.get("before") ?? count + 1) - 1);
    const data = Array.from({ length: Math.min(1000, first) }, (_, i) =>
      row(first - i),
    );
    return Response.json({ data, has_more: first > data.length });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("renders a fifty-request head without reading the rest of a hundred-thousand-row ledger", async () => {
  const fetchMock = largeLedger(100_000);
  const { result } = openQuery();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.current.data?.pages[0].rows).toHaveLength(50);
  await act(async () => {
    await result.current.move("older");
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][0]).toContain("before=99951");
  await waitFor(() =>
    expect(result.current.data?.pages.flatMap((p) => p.rows)).toHaveLength(100),
  );
});

it("seeks an old bookmark with only one retained window and returns across its numeric boundaries", async () => {
  const fetchMock = largeLedger(2000);
  const { result } = openQuery("req_51");
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.current.data?.pages).toHaveLength(1);
  const selected = result.current.data!.pages[0];
  expect(selected.rows).toHaveLength(50);
  expect(selected.rows.at(-1)?.request_id).toBe("req_51");
  expect(selected.newer).toHaveLength(38);
  await act(async () => {
    expect(await result.current.move("older")).toBe("req_50");
  });
  await waitFor(() =>
    expect(result.current.data?.pages[0].rows[0].request_id).toBe("req_50"),
  );
  expect(result.current.data?.pages).toHaveLength(1);
  await act(async () => {
    expect(await result.current.move("newer")).toBe("req_51");
  });
  await waitFor(() =>
    expect(result.current.data?.pages[0].rows[0].request_id).toBe("req_100"),
  );
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("keeps the last visible window when the remaining raw pages contain no direct messages", async () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        data: Array.from({ length: 50 }, (_, i) => row(55 - i)),
        has_more: true,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        data: [row(4, { endpoint: "embeddings" })],
        has_more: false,
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const { result } = openQuery("req_6");
  await waitFor(() => expect(result.current.hasNextPage).toBe(true));
  await act(async () => {
    expect(await result.current.move("older")).toBeUndefined();
  });
  await waitFor(() => expect(result.current.hasNextPage).toBe(false));
  expect(result.current.data?.pages[0].rows).toHaveLength(50);
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
