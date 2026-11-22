import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
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
vi.mock("@/lib/platform/message-stats", () => ({
  useMessageStats: reads.usage,
}));
vi.mock("@/lib/platform/queries", async (original) => ({
  ...(await original<typeof import("@/lib/platform/queries")>()),
  useApiKeys: reads.keys,
}));
vi.mock("./api-keys", () => ({
  CreateKeyButton: () => <button>Create key</button>,
}));

const empty = {
  requests: 0,
  reported: 0,
  input: 0,
  output: 0,
  read: 0,
  write: 0,
};
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
  reads.usage.mockReturnValue({ data: { month: empty, week: empty } });
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
  expect(screen.getByRole("region", { name: "Tokens" })).toHaveAttribute(
    "data-value",
    "0",
  );
  expect(metric("Cache hit rate").getByText("Not caching")).toBeVisible();
  expect(reads.keys).not.toHaveBeenCalled();
  cleanup();
  reads.usage.mockReturnValue({
    data: { month: { ...empty, requests: 1 }, week: { ...empty, requests: 1 } },
  });
  open("available", "denied");
  expect(screen.getByRole("region", { name: "Requests" })).toHaveAttribute(
    "data-value",
    "1",
  );
  expect(screen.getByRole("region", { name: "Tokens" })).toHaveAttribute(
    "data-value",
    "",
  );
  expect(metric("Tokens").getByText("Usage not reported")).toBeVisible();
  expect(
    metric("Cache hit rate").getByText("Usage not reported"),
  ).toBeVisible();
});

it("shows zero cache hits when writes have been recorded", () => {
  reads.usage.mockReturnValue({
    data: {
      month: { ...empty, input: 110, output: 1, requests: 2, reported: 2 },
      week: { ...empty, input: 10, write: 10, requests: 1, reported: 1 },
    },
  });
  open();
  expect(
    screen.getByRole("region", { name: "Cache hit rate" }),
  ).toHaveAttribute("data-value", "0");
});

it("formats the cache share and identifies how many requests reported usage", () => {
  reads.usage.mockReturnValue({
    data: {
      month: { ...empty, input: 96, output: 12, requests: 2, reported: 1 },
      week: { ...empty, input: 96, read: 40, requests: 2, reported: 1 },
    },
  });
  open();
  expect(metric("Cache hit rate").getByText("41.7%")).toBeVisible();
  expect(
    metric("Cache hit rate").getByText("40 cached input tokens"),
  ).toBeVisible();
  expect(
    metric("Tokens").getByText("Usage reported for 1 of 2 requests"),
  ).toBeVisible();
});
