import { afterEach, expect, it, vi } from "vitest";
import { readMessageStats } from "./message-stats";

const now = Date.parse("2026-11-22T04:00:00Z");
const day = 86_400_000;
const row = (id: number, age: number, overrides = {}) => ({
  id,
  request_id: "req_" + id,
  created_at: new Date(now - age * day).toISOString(),
  endpoint: "messages",
  api_key_id: "apikey_owned",
  session_id: null,
  input_tokens: 10,
  output_tokens: 2,
  cache_read_tokens: 5,
  cache_write_tokens: 1,
  ...overrides,
});
afterEach(() => vi.unstubAllGlobals());

it("accumulates fixed-size 30-day and 7-day totals across raw pages with different origins", async () => {
  const first = Array.from({ length: 1000 }, (_, i) =>
    row(1200 - i, 7, { session_id: "client-affinity" }),
  );
  const last = [
    row(199, 8),
    row(198, 30, {
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
    }),
    row(197, 31),
    row(196, 2, { endpoint: "chat_completions" }),
    row(195, 1, { api_key_id: "", session_id: "agent" }),
  ];
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ data: first, has_more: true }))
    .mockResolvedValueOnce(Response.json({ data: last, has_more: false }));
  vi.stubGlobal("fetch", fetch);
  const stats = await readMessageStats(new AbortController().signal, now);
  expect(stats).toEqual({
    week: {
      requests: 1000,
      reported: 1000,
      input: 16000,
      output: 2000,
      read: 5000,
      write: 1000,
    },
    month: {
      requests: 1002,
      reported: 1001,
      input: 16016,
      output: 2002,
      read: 5005,
      write: 1001,
    },
  });
  expect(fetch.mock.calls[1][0]).toContain("before=201");
});

it("propagates an error on a later page instead of publishing incomplete counts", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: [row(2, 0)], has_more: true }),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            type: "error",
            error: {
              type: "permission_error",
              message: "Ledger access revoked",
            },
          },
          { status: 403 },
        ),
      ),
  );
  await expect(
    readMessageStats(new AbortController().signal, now),
  ).rejects.toThrow("Ledger access revoked");
});
