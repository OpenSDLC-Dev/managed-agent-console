import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { copyText } from "@/lib/copy-text";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import type { readAccount } from "@/lib/platform/native";
import type { GatewayUsageRow } from "@/lib/platform/types";
import { TEST_SESSION } from "../../../test/session-fixture";
import { useTestSearchParams } from "../../../test/search-params";
import { MessageLogs } from "./message-logs";

vi.mock("next/navigation", () => ({
  useSearchParams: () => useTestSearchParams(),
}));
vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));

const row = (
  id: number,
  changes: Partial<GatewayUsageRow> = {},
): GatewayUsageRow => ({
  id,
  request_id: "req_" + id,
  created_at: new Date(Date.now() - 1000).toISOString(),
  api_key_id: "",
  principal_id: "user_local",
  model: "deepseek-flash",
  alias: "deepseek-flash",
  deployment_id: "gwdep_flash",
  credential_id: "gwcred_flash",
  session_id: null,
  endpoint: "messages",
  protocol: "anthropic",
  status: 200,
  error_type: null,
  input_tokens: 1204,
  output_tokens: 0,
  cache_read_tokens: 20,
  cache_write_tokens: 0,
  latency_ms: 1300,
  ttft_ms: 500,
  cost: 0.012,
  ...changes,
});

function openLogs(rows: GatewayUsageRow[], request?: string) {
  history.replaceState(
    null,
    "",
    "/messages/logs" + (request ? "?" + new URLSearchParams({ request }) : ""),
  );
  const read = vi.fn(async () =>
    Response.json({ data: rows, has_more: false }),
  );
  vi.stubGlobal("fetch", read);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  type Session = Awaited<ReturnType<typeof readAccount>>;
  const view = (data: Session, error?: Error) => (
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={{ data, error } as ReturnType<typeof useConsoleSession>}
      >
        <MessageLogs />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>
  );
  const page = render(view(TEST_SESSION));
  return {
    read,
    client,
    user: userEvent.setup(),
    session: (data: Session, error?: Error) => page.rerender(view(data, error)),
  };
}

beforeEach(() => {
  const replace = history.replaceState.bind(history);
  vi.spyOn(history, "replaceState").mockImplementation((...args) => {
    replace(...args);
    window.dispatchEvent(new Event("popstate"));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("copies without opening details, opens from the row keyboard, and restores focus on Escape", async () => {
  const { user } = openLogs([
    row(2),
    row(1, {
      api_key_id: "apikey_ci",
      status: 502,
      error_type: "api_error",
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
    }),
  ]);
  const table = within(screen.getByRole("table", { name: "Logs" }));
  const copy = await table.findByRole("button", { name: "Copy req_2" });
  await user.click(copy);
  expect(copyText).toHaveBeenCalledExactlyOnceWith("req_2");
  expect(screen.queryByRole("dialog")).toBeNull();
  const opener = copy.closest("tr")!;
  opener.focus();
  await user.keyboard("{Enter}");
  const panel = await screen.findByRole("dialog", { name: "Request details" });
  expect(panel).toHaveFocus();
  expect(location.search).toBe("?request=req_2");
  const detail = within(panel);
  expect(detail.queryByText("OK")).toBeNull();
  expect(
    detail.getByRole("button", { name: "Previous request" }),
  ).toBeDisabled();
  expect(detail.getByText("user_local")).toBeVisible();
  expect(detail.getByText("1,204")).toHaveAttribute(
    "data-input-tokens",
    "1204",
  );
  expect(detail.getByText("20")).toHaveAttribute(
    "data-cache-read-tokens",
    "20",
  );
  expect(panel.querySelector("[data-output-tokens]")).toHaveTextContent("0");
  expect(detail.getByText("Type").nextElementSibling).toHaveTextContent("—");
  expect(detail.getByText("Service tier").nextElementSibling).toHaveTextContent(
    "—",
  );
  await user.click(detail.getByRole("button", { name: "About latency" }));
  expect(detail.getByText(/Time to first token/)).toHaveTextContent("500ms");
  await user.click(detail.getByRole("button", { name: "Next request" }));
  expect(location.search).toBe("?request=req_1");
  expect(detail.getByRole("button", { name: "Next request" })).toBeDisabled();
  expect(detail.getByText("apikey_ci")).toBeVisible();
  expect(detail.getByText("api_error")).toBeVisible();
  expect(panel.querySelector("[data-output-tokens]")).toHaveTextContent("—");
  expect(panel).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(location.search).toBe("");
  expect(opener).toHaveFocus();
});

it("copies a long ID from its visible toolbar text and returns focus to the opener", async () => {
  const id = "req_011abc234def567ghi890jkl";
  const { user } = openLogs([row(1, { request_id: id })]);
  const open = await screen.findByRole("button", { name: id });
  await user.click(open);
  const detail = within(
    await screen.findByRole("dialog", { name: "Request details" }),
  );
  const copy = detail.getByRole("button", { name: "Copy " + id });
  expect(copy).toHaveTextContent(id);
  await user.click(detail.getByText(id));
  expect(copyText).toHaveBeenCalledExactlyOnceWith(id);
  await user.click(detail.getByRole("button", { name: "Close details" }));
  expect(open).toHaveFocus();
});

it("opens the underlined latency label from the keyboard and dismisses its help independently", async () => {
  const { user } = openLogs([row(1, { latency_ms: 1213.4 })], "req_1");
  const panel = await screen.findByRole("dialog", { name: "Request details" });
  const detail = within(panel);
  expect(detail.getByText("1.213 s")).toHaveAttribute(
    "data-latency-ms",
    "1213.4",
  );
  expect(within(screen.getByRole("table")).getByText("1.21 s")).toBeVisible();
  const latency = detail.getByRole("button", { name: "About latency" });
  expect(latency).toHaveTextContent("Latency");
  latency.focus();
  await user.keyboard("{Enter}");
  const help = await detail.findByRole("dialog", {
    name: "Latency",
  });
  expect(help).toHaveTextContent("Time to first token was 500ms.");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(help).not.toBeInTheDocument());
  expect(panel).toBeInTheDocument();
  expect(latency).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(panel).not.toBeInTheDocument());
});

it("includes cache reads and writes in table input and distinguishes zero from an unreported total", async () => {
  openLogs([
    row(3, { input_tokens: 15, cache_read_tokens: 20, cache_write_tokens: 7 }),
    row(2, { input_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }),
    row(1, {
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
    }),
  ]);
  const table = within(screen.getByRole("table", { name: "Logs" }));
  for (const [id, value, label] of [
    ["req_3", "42", "42"],
    ["req_2", "0", "0"],
    ["req_1", "", "—"],
  ]) {
    const idButton = await table.findByRole("button", { name: id });
    const input = idButton.closest("tr")!.querySelector("[data-input-tokens]");
    expect(input).toHaveAttribute("data-input-tokens", value);
    expect(input).toHaveTextContent(label);
  }
});

it("restores deep links beyond the first visible page and reads all tokens from the selected row", async () => {
  openLogs(
    Array.from({ length: 51 }, (_, i) => row(51 - i)),
    "req_1",
  );
  const panel = await screen.findByRole("dialog", { name: "Request details" });
  expect(
    within(panel).getByRole("button", { name: "Copy req_1" }),
  ).toBeVisible();
  expect(
    within(panel).getByRole("button", { name: "Next request" }),
  ).toBeDisabled();
  expect(
    within(screen.getByRole("table", { name: "Logs" })).getByRole("button", {
      name: "req_1",
    }),
  ).toBeVisible();
});

it("keeps the ledger available for a deep link to an expired request", async () => {
  openLogs(
    [
      row(2),
      row(1, {
        created_at: new Date(Date.now() - 31 * 86_400_000).toISOString(),
      }),
    ],
    "req_1",
  );
  const detail = within(await screen.findByRole("dialog"));
  expect(detail.getByRole("status")).toHaveTextContent(
    "Request not found in the last 30 days.",
  );
  expect(
    detail.getByRole("button", { name: "Previous request" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "req_2" })).toBeVisible();
});

it("clears the rendered row and inspector when a refresh revokes access", async () => {
  const { read, client, user } = openLogs([row(2)], "req_2");
  await screen.findByRole("dialog");
  read.mockResolvedValueOnce(
    Response.json(
      {
        type: "error",
        error: { type: "permission_error", message: "Access revoked" },
      },
      { status: 403 },
    ),
  );
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("Access revoked")).toBeVisible();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "req_2" })).toBeNull();
  expect(screen.queryByText(/As of/)).toBeNull();
  expect(
    client.getQueryData([
      "gateway",
      "usage",
      "message-logs",
      TEST_SESSION.id,
      "admin",
    ]),
  ).toEqual([]);
});

it("never carries rows across principals, roles, or an unconfirmed session", async () => {
  const { read, session } = openLogs([row(2)], "req_2");
  await screen.findByRole("dialog");
  session({ ...TEST_SESSION, role: "user", playground_access: true });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "req_2" })).toBeNull();
  session({ ...TEST_SESSION, role: undefined });
  session(null);
  session(TEST_SESSION, new Error("Session could not be confirmed"));
  expect(read).toHaveBeenCalledTimes(1);
  read.mockResolvedValueOnce(
    Response.json({ data: [row(1)], has_more: false }),
  );
  session({ ...TEST_SESSION, role: "developer", id: "other" });
  expect(screen.queryByRole("button", { name: "req_2" })).toBeNull();
  await screen.findByRole("button", { name: "req_1" });
  expect(screen.getByRole("status")).toHaveTextContent("Request not found");
});
