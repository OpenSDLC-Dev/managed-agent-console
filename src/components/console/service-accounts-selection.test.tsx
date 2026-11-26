import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as http from "@/lib/platform/http";
import * as native from "@/lib/platform/native";
import { useTestSearchParams } from "../../../test/search-params";
import { ServiceAccounts } from "./service-accounts";

vi.mock("next/navigation", () => ({
  useSearchParams: () => useTestSearchParams(),
}));

const account: native.ServiceAccount = {
  id: "svac_runner",
  name: "build-bot",
  type: "service_account",
  description: "old pipeline",
  organization_role: "developer",
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
  created_by_actor_id: "user_admin",
  updated_by_actor_id: "user_admin",
  archived_at: null,
  archived_by_actor_id: null,
};

const clients: QueryClient[] = [];
beforeEach(() => {
  // The shared Next history fixture subscribes to pushState and popstate.
  // Search typing uses replaceState, which also updates useSearchParams in Next.
  const replace = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "replaceState").mockImplementation((...args) => {
    replace(...args);
    window.dispatchEvent(new Event("popstate"));
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

function directory(query = "") {
  history.replaceState(
    null,
    "",
    "/settings/service-accounts" +
      (query ? "?" + new URLSearchParams({ q: query }) : ""),
  );
  const server = {
    rows: [account],
    detail: account,
    listError: null as Error | null,
    detailError: null as Error | null,
    detailRequest: null as Promise<native.ServiceAccount> | null,
  };
  vi.spyOn(http, "consoleKeysGet").mockResolvedValue([]);
  vi.spyOn(native, "nativeGet").mockImplementation(async (path) => {
    if (path === `${native.ORGANIZATION}/service_accounts`) {
      if (server.listError) throw server.listError;
      return { data: server.rows, next_page: null };
    }
    if (server.detailError) throw server.detailError;
    return server.detailRequest ?? server.detail;
  });
  const write = vi
    .spyOn(native, "nativeWrite")
    .mockImplementation(async (_path, body) => {
      server.detail = {
        ...server.detail,
        ...(body as Partial<native.ServiceAccount>),
      };
      server.rows = [server.detail];
      return server.detail;
    });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ServiceAccounts />
    </QueryClientProvider>,
  );
  const refresh = () =>
    act(async () => {
      await client.invalidateQueries({
        queryKey: ["service-accounts", "directory"],
      });
    });
  return { server, client, write, refresh, user: userEvent.setup() };
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: account.name }));
  return within(await screen.findByRole("dialog", { name: account.name }));
}

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  const panel = await openPanel(user);
  await user.click(await panel.findByRole("button", { name: "Edit" }));
  return within(await screen.findByRole("dialog", { name: account.name }));
}

async function editFromRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", {
      name: "More actions for " + account.name,
    }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  return within(await screen.findByRole("dialog", { name: account.name }));
}

it("waits for a fresh detail from the row menu before editing, even with a recently cached active account", async () => {
  const { server, client, write, user } = directory();
  const key = ["service-accounts", "detail", account.id];
  client.setQueryDefaults(key, { staleTime: 60_000 });
  client.setQueryData(key, account);
  let release!: (record: native.ServiceAccount) => void;
  server.detailRequest = new Promise((resolve) => {
    release = resolve;
  });
  const loading = await editFromRow(user);
  expect(loading.queryByRole("textbox", { name: /Description/ })).toBeNull();
  server.detail = {
    ...account,
    description: "Updated remotely",
    organization_role: "admin",
  };
  await act(async () => release(server.detail));
  const field = await screen.findByRole("textbox", { name: /Description/ });
  expect(field).toHaveValue("Updated remotely");
  expect(
    screen.getByRole("combobox", { name: "Organization role" }),
  ).toHaveTextContent("Admin");
  fireEvent.change(field, { target: { value: "Current draft" } });
  server.detailRequest = null;
  server.detail = { ...server.detail, description: "Another remote change" };
  await act(async () => {
    await client.invalidateQueries({ queryKey: key });
  });
  expect(field).toHaveValue("Current draft");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(write.mock.calls[0][1]).toEqual({ description: "Current draft" });
});

it("retries a failed row edit detail request without presenting stale inputs", async () => {
  const { server, client, write, user } = directory();
  client.setQueryData(["service-accounts", "detail", account.id], account);
  server.detailError = new TypeError("Offline while reading this account");
  const loading = await editFromRow(user);
  expect(await loading.findByRole("alert")).toHaveTextContent(
    "Offline while reading this account",
  );
  expect(loading.queryByRole("button", { name: "Save" })).toBeNull();
  server.detailError = null;
  server.detail = { ...account, description: "Ready after retry" };
  await user.click(loading.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("textbox", { name: /Description/ }),
  ).toHaveValue("Ready after retry");
  expect(write).not.toHaveBeenCalled();
});

it.each(["archived", "denied"] as const)(
  "keeps a row edit read-only when the current detail is %s",
  async (state) => {
    const { server, client, write, user } = directory();
    client.setQueryData(["service-accounts", "detail", account.id], account);
    if (state === "archived")
      server.detail = {
        ...account,
        archived_at: "2026-10-02T12:00:00Z",
        archived_by_actor_id: "user_admin",
      };
    else server.detailError = new http.PlatformError(403, null);
    await editFromRow(user);
    if (state === "archived") {
      await screen.findByRole("link", { name: "Open" });
      expect(
        within(screen.getByRole("dialog", { name: account.name })).getByText(
          /Archived/,
        ),
      ).toBeVisible();
    } else {
      expect(await screen.findByRole("alert")).toHaveTextContent("403");
    }
    expect(screen.queryByRole("textbox", { name: /Description/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(write).not.toHaveBeenCalled();
  },
);

it("starts editing from the fetched detail and writes only the field changed by the user", async () => {
  const { server, write, user } = directory();
  server.detail = {
    ...account,
    description: "Current server description",
    organization_role: "admin",
  };
  const edit = await openEditor(user);
  const description = edit.getByRole("textbox", { name: /Description/ });
  expect(description).toHaveValue("Current server description");
  expect(edit.getByRole("combobox")).toHaveTextContent("Admin");
  fireEvent.change(description, { target: { value: "Updated by me" } });
  await user.click(edit.getByRole("button", { name: "Save" }));
  expect(write.mock.calls[0][1]).toEqual({ description: "Updated by me" });
  const view = within(
    await screen.findByRole("dialog", { name: account.name }),
  );
  expect(await view.findByText("Updated by me")).toBeVisible();
  expect(view.getByText("Admin")).toBeVisible();
});

it("keeps the saved detail open after its description leaves the current search", async () => {
  const { user } = directory("old pipeline");
  const edit = await openEditor(user);
  fireEvent.change(edit.getByRole("textbox", { name: /Description/ }), {
    target: { value: "New pipeline" },
  });
  await user.click(edit.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("No matching service accounts")).toBeVisible();
  const view = within(screen.getByRole("dialog", { name: account.name }));
  expect(await view.findByText("New pipeline")).toBeVisible();
  expect(
    view.getByRole("button", { name: "Previous service account" }),
  ).toBeDisabled();
  expect(
    view.getByRole("button", { name: "Next service account" }),
  ).toBeDisabled();
  await user.click(view.getByRole("button", { name: "Close details" }));
  expect(
    screen.getByRole("textbox", { name: "Search service accounts" }),
  ).toHaveFocus();
});

it("preserves a local draft through remote edits and transient directory errors, then returns to current detail on cancel", async () => {
  const { server, user, refresh, write } = directory("old pipeline");
  const edit = await openEditor(user);
  const field = edit.getByRole("textbox", { name: /Description/ });
  fireEvent.change(field, { target: { value: "Unsaved work" } });
  server.listError = new TypeError("Offline");
  await refresh();
  expect(field).toHaveValue("Unsaved work");
  server.listError = null;
  server.detail = {
    ...account,
    description: "Remote replacement",
    organization_role: "admin",
  };
  server.rows = [
    server.detail,
    { ...account, id: "svac_peer", name: "other-bot" },
  ];
  await refresh();
  expect(
    await screen.findByRole("button", { name: "other-bot" }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: account.name })).toBeNull();
  expect(screen.getByRole("textbox", { name: /Description/ })).toBe(field);
  expect(field).toHaveValue("Unsaved work");
  await user.click(edit.getByRole("button", { name: "Cancel" }));
  const view = within(
    await screen.findByRole("dialog", { name: account.name }),
  );
  expect(await view.findByText("Remote replacement")).toBeVisible();
  expect(view.getByText("Admin")).toBeVisible();
  expect(
    view.getByRole("button", { name: "Next service account" }),
  ).toBeDisabled();
  expect(write).not.toHaveBeenCalled();
});

it("continues typing in search when it dismisses the detail, and preserves focus when switching status", async () => {
  const { user } = directory();
  await openPanel(user);
  const search = screen.getByRole("textbox", {
    name: "Search service accounts",
  });
  await user.type(search, "build");
  expect(search).toHaveValue("build");
  expect(search).toHaveFocus();
  expect(new URLSearchParams(location.search).get("q")).toBe("build");
  expect(screen.queryByRole("dialog")).toBeNull();
  await openPanel(user);
  const archived = screen.getByRole("radio", { name: "Archived" });
  await user.click(archived);
  expect(archived).toBeChecked();
  expect(archived).toHaveFocus();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it.each(["archived", "denied"] as const)(
  "removes write controls when the account is %s on a directory refresh",
  async (reason) => {
    const { server, user, refresh, write } = directory();
    const edit = await openEditor(user);
    fireEvent.change(edit.getByRole("textbox", { name: /Description/ }), {
      target: { value: "Draft" },
    });
    if (reason === "archived") server.rows = [];
    else server.listError = new http.PlatformError(403, null);
    await refresh();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    if (reason === "denied")
      expect(
        screen.getByRole("button", { name: "Create service account" }),
      ).toHaveAttribute("aria-disabled", "true");
    server.rows = [account];
    server.listError = null;
    await refresh();
    expect(
      await screen.findByRole("button", { name: account.name }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(write).not.toHaveBeenCalled();
  },
);
