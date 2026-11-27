import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
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
    "/workspaces/default/logs" +
      (request ? "?" + new URLSearchParams({ request }) : ""),
  );
  const read = vi.fn(async (path: string) => {
    const query = new URL(path, "http://console.test").searchParams;
    const remaining = rows.filter(
      (row) => row.id < Number(query.get("before") ?? Infinity),
    );
    const limit = Number(query.get("limit") ?? 100);
    return Response.json({
      data: remaining.slice(0, limit),
      has_more: remaining.length > limit,
    });
  });
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

it.each([
  ["deepseek-v4-flash", "deepseek-v4-flash"],
  ["glm-4.7-flash", "glm-4.7-flash"],
  ["custom-model", "*"],
  ["custom-model", ""],
  ["", "*"],
])(
  "shows the recorded request model %j and matched alias %j independently",
  async (model, alias) => {
    const { user } = openLogs([row(1, { model, alias })]);
    const table = within(screen.getByRole("table", { name: "Logs" }));
    const opener = await table.findByRole("button", { name: "req_1" });
    expect(opener.closest("tr")!.querySelector("[data-model]")).toHaveAttribute(
      "data-model",
      model,
    );
    await user.click(opener);
    const detail = within(
      await screen.findByRole("dialog", { name: "Request details" }),
    );
    expect(
      detail.getByText("Requested model").nextElementSibling?.textContent,
    ).toBe(model || "—");
    expect(
      detail.getByText("Gateway alias").nextElementSibling?.textContent,
    ).toBe(alias || "—");
  },
);

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

it("switches visible rows in place and dismisses on an outside click without stealing focus", async () => {
  const { user } = openLogs([row(2), row(1)]);
  render(<button>Outside control</button>);
  const first = await screen.findByRole("button", { name: "req_2" });
  await user.click(first);
  const panel = await screen.findByRole("dialog", { name: "Request details" });
  const second = screen.getByRole("button", { name: "req_1" }).closest("tr")!;
  await user.click(within(second).getByText("OK"));
  expect(location.search).toBe("?request=req_1");
  expect(screen.getByRole("dialog", { name: "Request details" })).toBe(panel);
  expect(
    within(panel).getByRole("button", { name: "Copy req_1" }),
  ).toBeVisible();
  await user.click(screen.getByRole("heading", { name: "Logs" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(location.search).toBe("");
  await user.click(first);
  const outside = screen.getByRole("button", { name: "Outside control" });
  await user.click(outside);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(outside).toHaveFocus();
});

it("keeps an old bookmark and both cross-window drawer moves to at most fifty table rows", async () => {
  const { user } = openLogs(
    Array.from({ length: 2000 }, (_, i) => row(2000 - i)),
    "req_51",
  );
  const panel = await screen.findByRole("dialog", { name: "Request details" });
  const table = within(screen.getByRole("table", { name: "Logs" }));
  expect(table.getAllByRole("row")).toHaveLength(51);
  expect(table.queryByRole("button", { name: "req_2000" })).toBeNull();
  expect(table.getByRole("button", { name: "req_51" })).toBeVisible();
  await user.click(within(panel).getByRole("button", { name: "Next request" }));
  await waitFor(() => expect(location.search).toBe("?request=req_50"));
  expect(table.getByRole("button", { name: "req_1" })).toBeVisible();
  expect(table.getAllByRole("row")).toHaveLength(51);
  await user.click(
    within(panel).getByRole("button", { name: "Previous request" }),
  );
  await waitFor(() => expect(location.search).toBe("?request=req_51"));
  expect(table.getByRole("button", { name: "req_100" })).toBeVisible();
  expect(table.getAllByRole("row")).toHaveLength(51);
});

it("keeps the newly selected row when the prior request's older-window read resolves late", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(100 - i));
  const { user, read } = openLogs(rows, "req_51");
  const panel = await screen.findByRole("dialog", { name: "Request details" });
  const table = within(screen.getByRole("table", { name: "Logs" }));
  let reply!: (response: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    reply = resolve;
  });
  read.mockReturnValueOnce(delayed);
  await user.click(within(panel).getByRole("button", { name: "Next request" }));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  await user.click(table.getByRole("button", { name: "req_55" }));
  expect(location.search).toBe("?request=req_55");
  await act(async () => {
    reply(Response.json({ data: rows.slice(50), has_more: false }));
    await delayed;
  });
  expect(
    within(panel).getByRole("button", { name: "Copy req_55" }),
  ).toBeVisible();
  expect(table.getByRole("button", { name: "req_55" })).toBeVisible();
  expect(table.queryByRole("button", { name: "req_50" })).toBeNull();
  expect(
    screen.queryByText("Request not found in the last 30 days."),
  ).toBeNull();
});

it("revalidates the currently selected request after a newer log arrives and manually refreshes the head", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(100 - i));
  const { user, client } = openLogs(rows, "req_55");
  const panel = await screen.findByRole("dialog", { name: "Request details" });
  const table = within(screen.getByRole("table", { name: "Logs" }));
  await user.click(table.getByRole("button", { name: "req_51" }));
  rows.unshift(row(101));
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ["gateway", "usage", "message-logs"],
    });
  });
  expect(location.search).toBe("?request=req_51");
  expect(
    within(panel).getByRole("button", { name: "Copy req_51" }),
  ).toBeVisible();
  expect(table.getByRole("button", { name: "req_51" })).toBeVisible();
  expect(
    screen.queryByText("Request not found in the last 30 days."),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await table.findByRole("button", { name: "req_101" })).toBeVisible();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("returns to the immediate newer request at the snapshot head boundary despite a concurrent insert", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(100 - i));
  const { user } = openLogs(rows, "req_50");
  const panel = await screen.findByRole("dialog", { name: "Request details" });
  rows.unshift(row(101));
  await user.click(
    within(panel).getByRole("button", { name: "Previous request" }),
  );
  await waitFor(() => expect(location.search).toBe("?request=req_51"));
  expect(
    within(panel).getByRole("button", { name: "Copy req_51" }),
  ).toBeVisible();
  const table = within(screen.getByRole("table", { name: "Logs" }));
  expect(table.queryByRole("button", { name: "req_101" })).toBeNull();
  expect(table.getAllByRole("row")).toHaveLength(51);
  await user.click(within(panel).getByRole("button", { name: "Next request" }));
  await waitFor(() => expect(location.search).toBe("?request=req_50"));
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

it("clears the rendered row and inspector when a background refresh revokes access", async () => {
  const { read, client } = openLogs([row(2)], "req_2");
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
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ["gateway", "usage", "message-logs"],
    });
  });
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
      "request",
      "req_2",
    ]),
  ).toBeNull();
});

it("never carries rows across principals, roles, or an unconfirmed session", async () => {
  const { read, session } = openLogs([row(2)], "req_2");
  await screen.findByRole("dialog");
  session({
    ...TEST_SESSION,
    role: "user",
    workspace_role: "user",
    playground_access: true,
  });
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
