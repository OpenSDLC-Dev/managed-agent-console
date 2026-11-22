import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import type { GatewayUsageRow } from "@/lib/platform/types";
import { TEST_SESSION } from "../../../test/session-fixture";
import { MessagesOverview } from "./messages-overview";

const reads = vi.hoisted(() => ({
  usage: vi.fn(),
  keys: vi.fn(),
  surfaces: vi.fn(),
}));
vi.mock("@/lib/platform/surfaces", async (original) => ({
  ...(await original<typeof import("@/lib/platform/surfaces")>()),
  useSurfaces: reads.surfaces,
}));
vi.mock("@/lib/platform/message-logs", async (original) => ({
  ...(await original<typeof import("@/lib/platform/message-logs")>()),
  useMessageLogs: reads.usage,
}));
vi.mock("@/lib/platform/queries", async (original) => ({
  ...(await original<typeof import("@/lib/platform/queries")>()),
  useApiKeys: reads.keys,
}));
vi.mock("./api-keys", () => ({
  CreateKeyButton: () => <button>Create key</button>,
}));

const now = Date.parse("2026-11-22T04:00:00Z");
const usageRow = (age: number, counters: Partial<GatewayUsageRow> = {}) => ({
  created_at: new Date(now - age * 86_400_000).toISOString(),
  input_tokens: null,
  cache_read_tokens: null,
  cache_write_tokens: null,
  output_tokens: null,
  ...counters,
});
function open(usage = "available", keys = "available") {
  reads.surfaces.mockReturnValue({
    usage: { status: usage },
    "api-keys": { status: keys },
    files: { status: "denied" },
    skills: { status: "denied" },
    models: { status: "denied" },
    "service-accounts": { status: "denied" },
  });
  render(
    <ConsoleSessionContext.Provider
      value={{ data: TEST_SESSION } as ReturnType<typeof useConsoleSession>}
    >
      <MessagesOverview />
    </ConsoleSessionContext.Provider>,
  );
}
const metric = (label: string) =>
  within(screen.getByRole("region", { name: label }));
beforeEach(() => {
  reads.usage.mockReturnValue({ data: [], dataUpdatedAt: now });
  reads.keys.mockReturnValue({ data: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps the accessible section and skips a denied read", () => {
  open("denied");
  expect(screen.getByText("No API keys yet.")).toBeVisible();
  expect(reads.usage).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("heading", { name: "Resources" }),
  ).not.toBeInTheDocument();
});

it("reports zero requests separately from requests with missing usage", () => {
  open("available", "denied");
  expect(metric("Tokens").getByText("0", { exact: true })).toBeVisible();
  expect(metric("Cache hit rate").getByText("Not caching")).toBeVisible();
  expect(reads.keys).not.toHaveBeenCalled();
  cleanup();
  reads.usage.mockReturnValue({ data: [usageRow(1)], dataUpdatedAt: now });
  open("available", "denied");
  expect(metric("Requests").getByText("1")).toBeVisible();
  expect(metric("Tokens").getByText("Usage not reported")).toBeVisible();
  expect(
    metric("Cache hit rate").getByText("Usage not reported"),
  ).toBeVisible();
});

it("includes writes in the cache denominator and scopes the cache window to seven days", () => {
  const old = usageRow(8, {
    input_tokens: 0,
    output_tokens: 1,
    cache_read_tokens: 100,
    cache_write_tokens: 0,
  });
  const recent = usageRow(7, {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 10,
  });
  reads.usage.mockReturnValue({ data: [old, recent], dataUpdatedAt: now });
  open();
  expect(metric("Tokens").getByText("111")).toBeVisible();
  expect(metric("Cache hit rate").getByText("0%")).toBeVisible();
});
