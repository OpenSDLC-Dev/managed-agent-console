import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import type { ApiKeyListItem } from "@/lib/platform/types";
import { ApiKeysTable } from "./api-key-list";
import {
  apiKeyAccountLabel,
  apiKeyCreatorLabel,
  apiKeyStatusLabel,
} from "./api-key-labels";

const session = {
  signed_in: true,
  id: "user_a",
  name: "Avery",
  role: "admin",
} as const;
const key = (id: string, fields: Partial<ApiKeyListItem>): ApiKeyListItem => ({
  id,
  type: "api_key",
  name: id,
  created_by: { id: "user_a", type: "user" },
  principal: { type: "user_actor", user_id: "user_a" },
  status: "active",
  workspace_id: null,
  can_manage: true,
  partial_key_hint: "test…hint",
  created_at: "2026-01-10T00:00:00Z",
  expires_at: null,
  ...fields,
});
const keys = [
  key("apikey_z", { name: "Zebra", partial_key_hint: "test…zulu" }),
  key("apikey_a", {
    name: "Alpine",
    status: "inactive",
    created_at: "2026-01-10T01:00:00+02:00",
    expires_at: "2026-03-01T00:00:00Z",
    principal: {
      type: "service_account_actor",
      service_account_id: "svac_build",
    },
  }),
  key("apikey_b", {
    name: "Beach",
    status: "expired",
    created_by: null,
    principal: null,
    expires_at: "2026-02-01T00:00:00Z",
    can_manage: false,
  }),
  key("apikey_c", {
    name: "Coast",
    status: "archived",
    partial_key_hint: "test…tide",
    created_by: { id: "user_b", type: "user" },
    principal: null,
    can_manage: false,
  }),
];
function mount(initial = keys) {
  const client = new QueryClient();
  const view = (
    rows: ApiKeyListItem[],
    loading = false,
    error: unknown = null,
  ) => (
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={{ data: session } as ReturnType<typeof useConsoleSession>}
      >
        <ApiKeysTable keys={rows} loading={loading} error={error} />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>
  );
  const result = render(view(initial));
  return (rows: ApiKeyListItem[], loading?: boolean, error?: unknown) =>
    result.rerender(view(rows, loading, error));
}
const count = (n: number) =>
  expect(document.querySelector("[data-visible-count]")).toHaveAttribute(
    "data-visible-count",
    String(n),
  );
const names = () =>
  Array.from(
    document.querySelectorAll("tbody [data-key-id]"),
    (b) => b.textContent,
  );
async function choose(filter: string, value: string) {
  await userEvent.click(screen.getByRole("combobox", { name: filter }));
  await userEvent.click(await screen.findByRole("option", { name: value }));
}
afterEach(cleanup);

it("combines search, linked account, creator and status, then resets the full list", async () => {
  mount();
  count(3);
  const search = screen.getByRole("searchbox", { name: "Search keys" });
  await userEvent.type(search, "ZULU");
  expect(names()).toEqual(["Zebra"]);
  await userEvent.clear(search);
  await choose("Created by", "Avery");
  count(2);
  await choose("Linked account", "Service account");
  expect(names()).toEqual(["Alpine"]);
  await choose("Status", "Disabled");
  count(1);
  await userEvent.type(search, "beach");
  count(0);
  expect(screen.getByText("No matching API keys")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(search).toHaveValue("");
  count(3);
  expect(
    screen.queryByRole("button", { name: "Reset" }),
  ).not.toBeInTheDocument();
  await userEvent.type(search, "APIKEY_A");
  expect(names()).toEqual(["Alpine"]);
  await userEvent.type(search, "-no-match");
  await userEvent.click(screen.getByRole("button", { name: "Reset search" }));
  expect(search).toHaveValue("");
  expect(search).toHaveFocus();
  count(3);
});

it("excludes archived keys from search and filter choices", async () => {
  mount();
  const search = screen.getByRole("searchbox");
  for (const query of ["Coast", "apikey_c", "tide"]) {
    await userEvent.clear(search);
    await userEvent.type(search, query);
    expect(names()).toEqual([]);
    count(0);
  }
  await userEvent.clear(search);
  await userEvent.click(screen.getByRole("combobox", { name: "Created by" }));
  expect(await screen.findByRole("option", { name: "Avery" })).toBeVisible();
  expect(screen.queryByRole("option", { name: "user_b" })).toBeNull();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
  expect(
    (await screen.findAllByRole("option")).map((o) => o.textContent),
  ).toEqual(["Active", "Disabled", "Expired"]);
});

it("separates missing owners from issuers and retains unknown server statuses", async () => {
  mount([
    ...keys,
    key("apikey_x", { status: "waiting", principal: null, can_manage: false }),
  ]);
  await choose("Linked account", "Not linked");
  count(2);
  await choose("Status", "waiting");
  expect(names()).toEqual(["apikey_x"]);
  await choose("Created by", "Control plane");
  count(0);
  expect(
    screen.getByText("No keys match the current filters."),
  ).toBeInTheDocument();
  await choose("Status", "Expired");
  expect(names()).toEqual(["Beach"]);
  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  count(4);
});

it("shows All and Anyone on the closed controls and replaces a selected status", async () => {
  mount();
  const creator = screen.getByRole("combobox", { name: "Created by" });
  expect(creator).toHaveTextContent("Anyone");
  await userEvent.click(creator);
  expect(await screen.findByRole("listbox")).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Anyone" })).toBeNull();
  await userEvent.keyboard("{Escape}");
  await choose("Status", "Expired");
  expect(screen.queryByRole("listbox")).toBeNull();
  await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
  expect(
    await screen.findByRole("option", { name: "Expired" }),
  ).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("option", { name: "All" })).toBeNull();
  await userEvent.click(screen.getByRole("option", { name: "Active" }));
  expect(names()).toEqual(["Zebra"]);
  expect(screen.queryByRole("listbox")).toBeNull();
  await choose("Status", "Active");
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveAttribute(
    "data-value",
    "active",
  );
  expect(names()).toEqual(["Zebra"]);
});

it("filters linked account kind across distinct service accounts", async () => {
  mount([
    ...keys,
    key("apikey_second", {
      name: "Service worker",
      created_by: { id: "user_b", type: "user" },
      principal: {
        type: "service_account_actor",
        service_account_id: "svac_other",
      },
    }),
  ]);
  await choose("Linked account", "Service account");
  expect(names()).toEqual(["Alpine", "Service worker"]);
  expect(screen.getByText("svac_build")).toBeInTheDocument();
  expect(screen.getByText("svac_other")).toBeInTheDocument();
});

it("clears one filter without changing search or another selected filter", async () => {
  mount();
  const search = screen.getByRole("searchbox", { name: "Search keys" });
  await userEvent.type(search, "alp");
  await choose("Linked account", "Service account");
  await choose("Status", "Active");
  count(0);
  const status = within(screen.getByRole("group", { name: "Status filter" }));
  await userEvent.click(
    status.getByRole("button", { name: "Clear selection" }),
  );
  expect(status.getByRole("combobox")).toHaveFocus();
  expect(status.queryByRole("button", { name: "Clear selection" })).toBeNull();
  expect(
    screen.getByRole("combobox", { name: "Linked account" }),
  ).toHaveAttribute("data-value", "service_account_actor");
  expect(search).toHaveValue("alp");
  expect(names()).toEqual(["Alpine"]);
});

it("sorts full names and timestamps without losing focus or treating Never as a date", async () => {
  mount();
  const keyHeading = screen.getByRole("columnheader", {
    name: "Key",
  });
  const keyButton = within(keyHeading).getByRole("button");
  keyButton.focus();
  await userEvent.keyboard("{Enter}");
  expect(keyButton).toHaveFocus();
  expect(keyHeading).toHaveAttribute("aria-sort", "ascending");
  expect(names()).toEqual(["Alpine", "Beach", "Zebra"]);
  await userEvent.keyboard("{Enter}");
  expect(names()).toEqual(["Zebra", "Beach", "Alpine"]);
  const sortExpires = within(
    screen.getByRole("columnheader", { name: "Expires" }),
  ).getByRole("button");
  await userEvent.click(sortExpires);
  expect(keyHeading).not.toHaveAttribute("aria-sort");
  expect(names()).toEqual(["Alpine", "Beach", "Zebra"]);
  expect(sortExpires.closest("th")).toHaveAttribute("aria-sort", "descending");
  await userEvent.click(sortExpires);
  expect(names()).toEqual(["Beach", "Alpine", "Zebra"]);
  await userEvent.click(
    within(screen.getByRole("columnheader", { name: "Created" })).getByRole(
      "button",
    ),
  );
  expect(screen.getByRole("columnheader", { name: "Created" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  expect(names().at(-1)).toBe("Alpine");
});

it("separates row actions from inspection and keeps only a still-visible selection on refetch", async () => {
  const refresh = mount();
  await userEvent.click(
    screen.getByRole("button", { name: "More actions for Zebra" }),
  );
  expect(await screen.findByRole("menu")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByText("test…zulu"));
  const panel = () => within(screen.getByRole("dialog"));
  expect(panel().getByRole("heading", { name: "Zebra" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Alpine" }));
  expect(panel().getByRole("heading", { name: "Alpine" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Zebra" }));
  refresh([{ ...keys[0], name: "Renamed by another user" }, ...keys.slice(1)]);
  expect(
    panel().getByRole("heading", { name: "Renamed by another user" }),
  ).toBeInTheDocument();
  refresh([{ ...keys[0], status: "archived" }, ...keys.slice(1)]);
  expect(names()).toEqual(["Alpine", "Beach"]);
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(screen.getByRole("searchbox")).toHaveFocus());
  refresh(keys);
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Zebra" }));
  const outside = screen.getByRole("button", { name: "Created" });
  outside.focus();
  refresh(keys.slice(1));
  expect(outside).toHaveFocus();
});

it("opens an allowed whitespace-only key name by its visible resource ID", async () => {
  mount([
    key("apikey_spaces", { name: "  " }),
    key("apikey_a", { name: "Alpha" }),
  ]);
  const order = screen.getByRole("columnheader", { name: "Key" });
  await userEvent.click(within(order).getByRole("button"));
  expect(names()).toEqual(["Alpha", "apikey_spaces"]);
  await userEvent.click(screen.getByRole("button", { name: "apikey_spaces" }));
  expect(
    within(screen.getByRole("dialog")).getByRole("heading", {
      name: "apikey_spaces",
    }),
  ).toBeInTheDocument();
});

it("keeps loading and errors distinct from a confirmed empty inventory", () => {
  const refresh = mount([]);
  count(0);
  expect(screen.getByText("No API keys yet.")).toBeInTheDocument();
  refresh([], true);
  expect(document.querySelector("tbody")).toHaveAttribute("aria-busy", "true");
  expect(document.querySelector("[data-visible-count]")).toBeNull();
  expect(screen.queryByTestId("empty-state")).toBeNull();
  refresh([], false, new Error("List temporarily unavailable"));
  expect(screen.getByText("List temporarily unavailable")).toBeInTheDocument();
  expect(screen.queryByRole("table")).toBeNull();
});

it("uses only the current identity's available display metadata", () => {
  const user = keys[0];
  expect(
    apiKeyAccountLabel(user, { ...session, name: "", login_name: "login" }),
  ).toBe("login");
  expect(
    apiKeyCreatorLabel(user, {
      ...session,
      name: "",
      email: "me@example.test",
    }),
  ).toBe("me@example.test");
  expect(apiKeyCreatorLabel(user, { ...session, name: "" })).toBe("user_a");
  expect(apiKeyAccountLabel(user, { id: session.id, name: "Stale" })).toBe(
    "user_a",
  );
  expect(apiKeyCreatorLabel(user, null)).toBe("user_a");
  expect(apiKeyStatusLabel("constructor")).toBe("constructor");
});
