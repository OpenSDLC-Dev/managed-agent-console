import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as native from "@/lib/platform/native";
import * as http from "@/lib/platform/http";
import type { ApiKeyListItem } from "@/lib/platform/types";
import {
  ServiceAccountDetail,
  ServiceAccountEditPanel,
  ServiceAccountPanel,
} from "./service-account-detail";

const account: native.ServiceAccount = {
  id: "svac_runner",
  type: "service_account",
  name: "release-runner",
  organization_role: "developer",
  description: "The release pipeline",
  created_at: "2026-10-01T12:30:00Z",
  created_by_actor_id: "user_creator",
  updated_at: "2026-10-01T13:30:00Z",
  updated_by_actor_id: "user_creator",
  archived_at: null,
  archived_by_actor_id: null,
};
const peer = { ...account, id: "svac_other", name: "other-runner" };
const owned: ApiKeyListItem = {
  id: "apikey_build/one",
  type: "api_key",
  name: "Build secret",
  status: "active",
  workspace_id: null,
  created_at: account.created_at,
  expires_at: null,
  partial_key_hint: "sk…build",
  created_by: { type: "user", id: "user_creator" },
  principal: { type: "service_account_actor", service_account_id: account.id },
  can_manage: true,
};
const clients: QueryClient[] = [];
function renderView(view: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    ...render(view, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
    client,
  };
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

it("matches keys by typed owner across both detail views and preserves the filtered return link", async () => {
  vi.spyOn(native, "nativeGet").mockResolvedValue(account);
  vi.spyOn(http, "consoleKeysGet").mockResolvedValue([
    owned,
    { ...owned, id: "key-disabled", name: "Disabled job", status: "inactive" },
    { ...owned, id: "key-deleted", name: "Archived key", status: "archived" },
    { ...owned, id: "key-unowned", name: "Legacy", principal: null },
    {
      ...owned,
      id: "key-foreign",
      name: "Other service",
      principal: { type: "service_account_actor", service_account_id: peer.id },
      created_by: { type: "service_account", id: account.id },
    },
    {
      ...owned,
      id: "key-human",
      name: "Human",
      principal: { type: "user_actor", user_id: account.id },
    },
  ]);
  const listHref = "/service-accounts?q=release";
  const { rerender } = renderView(
    <ServiceAccountPanel
      account={account}
      next={peer}
      onSelect={vi.fn()}
      listHref={listHref}
      onClose={vi.fn()}
      onEdit={vi.fn()}
    />,
  );
  const panel = await screen.findByRole("dialog", { name: account.name });
  expect(
    await within(panel).findByRole("link", { name: /Build secret/ }),
  ).toHaveAttribute("href", "/api-keys?key=apikey_build%2Fone");
  expect(
    within(panel).getByRole("link", { name: /Disabled job/ }),
  ).toHaveTextContent("Disabled");
  expect(
    within(panel).getByRole("heading", { name: "API keys 2" }),
  ).toBeVisible();
  expect(within(panel).getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    "/service-accounts/svac_runner?q=release",
  );
  expect(
    within(panel).getByRole("button", { name: "Previous service account" }),
  ).toBeDisabled();
  expect(
    within(panel).getByRole("button", { name: "Next service account" }),
  ).toBeEnabled();
  rerender(<ServiceAccountDetail id={account.id} listHref={listHref} />);
  const breadcrumb = await screen.findByRole("navigation", {
    name: "Breadcrumb",
  });
  expect(
    within(breadcrumb).getByRole("link", { name: "Service accounts" }),
  ).toHaveAttribute("href", listHref);
  expect(
    await screen.findByRole("heading", { name: "API keys 2" }),
  ).toBeVisible();
  for (const hidden of ["Archived key", "Legacy", "Other service", "Human"]) {
    expect(screen.queryByText(hidden)).not.toBeInTheDocument();
  }
});

it("refuses to show a cached record or key count when its refetch is denied", async () => {
  const get = vi.spyOn(native, "nativeGet").mockResolvedValue(account);
  const keys = vi.spyOn(http, "consoleKeysGet").mockResolvedValue([owned]);
  const denied = new http.PlatformError(403, {
    type: "error",
    error: {
      type: "permission_error",
      message: "Administrator access required",
    },
  });
  const { client } = renderView(
    <ServiceAccountDetail id={account.id} listHref="/service-accounts" />,
  );
  expect(
    await screen.findByRole("link", { name: /Build secret/ }),
  ).toBeVisible();
  keys.mockRejectedValue(denied);
  void client.invalidateQueries({ queryKey: ["api-keys"] });
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: /Build secret/ })).toBeNull(),
  );
  expect(screen.getByRole("heading", { name: "API keys" })).toBeVisible();
  expect(screen.queryByText(/No API keys/)).not.toBeInTheDocument();
  get.mockRejectedValue(denied);
  void client.invalidateQueries({
    queryKey: ["service-accounts", "detail", account.id],
  });
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: account.name })).toBeNull(),
  );
  expect(screen.getByTestId("error-state")).toHaveAttribute(
    "data-denied",
    "true",
  );
});

it("shows an archived deep link as read-only and reports an unknown ID", async () => {
  const get = vi
    .spyOn(native, "nativeGet")
    .mockResolvedValue({ ...account, archived_at: account.updated_at });
  vi.spyOn(http, "consoleKeysGet").mockResolvedValue([]);
  const { rerender } = renderView(
    <ServiceAccountDetail
      id={account.id}
      listHref="/service-accounts?status=archived"
    />,
  );
  expect(
    await screen.findByRole("combobox", { name: "Organization role" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: /Edit|Archive|Create key/ }),
  ).toBeNull();
  expect(
    await screen.findByText("No API keys for this service account yet."),
  ).toBeVisible();
  get.mockRejectedValue(
    new http.PlatformError(404, {
      type: "error",
      error: { type: "not_found_error", message: "Service account not found" },
    }),
  );
  rerender(
    <ServiceAccountDetail id="svac_missing" listHref="/service-accounts" />,
  );
  expect(await screen.findByText("Service account not found")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Service accounts" }),
  ).toHaveAttribute("href", "/service-accounts");
});

it("keeps the selected account and its owned keys when a previous detail request finishes late", async () => {
  let resolveFirst!: (item: native.ServiceAccount) => void;
  let firstSignal: AbortSignal | undefined;
  vi.spyOn(native, "nativeGet").mockImplementation((path, _params, signal) => {
    if (path.endsWith("/" + account.id)) {
      firstSignal = signal;
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    }
    return Promise.resolve(peer);
  });
  vi.spyOn(http, "consoleKeysGet").mockResolvedValue([owned]);
  const common = {
    listHref: "/service-accounts",
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onSelect: vi.fn(),
  };
  const { rerender } = renderView(
    <ServiceAccountPanel {...common} account={account} next={peer} />,
  );
  const panel = screen.getByRole("dialog", { name: account.name });
  await userEvent.click(
    within(panel).getByRole("button", { name: "Next service account" }),
  );
  expect(common.onSelect).toHaveBeenCalledWith(peer);
  rerender(
    <ServiceAccountPanel {...common} account={peer} previous={account} />,
  );
  expect(
    await within(panel).findByRole("heading", { name: peer.name }),
  ).toBeVisible();
  expect(firstSignal?.aborted).toBe(true);
  resolveFirst(account);
  await within(panel).findByText("No API keys for this service account yet.");
  expect(
    within(panel).queryByRole("heading", { name: account.name }),
  ).toBeNull();
  expect(
    within(panel).queryByRole("link", { name: /Build secret/ }),
  ).toBeNull();
});

it("validates editor drafts in Unicode code points, keeps failed edits, and patches only the changed field", async () => {
  const user = userEvent.setup();
  const write = vi
    .spyOn(native, "nativeWrite")
    .mockRejectedValueOnce(new Error("Update was refused"))
    .mockResolvedValue({ ...account, description: null });
  const onSaved = vi.fn();
  const { client } = renderView(
    <ServiceAccountEditPanel
      account={account}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  );
  const dialog = within(screen.getByRole("dialog", { name: account.name }));
  const field = dialog.getByRole("textbox", { name: /Description/ });
  const save = dialog.getByRole("button", { name: "Save" });
  fireEvent.change(field, { target: { value: "🌙".repeat(2001) } });
  expect(save).toBeDisabled();
  expect(field).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(field, { target: { value: "🌙".repeat(2000) } });
  expect(save).toBeEnabled();
  await user.clear(field);
  await user.click(save);
  expect(await dialog.findByText("Update was refused")).toBeVisible();
  expect(field).toHaveValue("");
  await user.click(save);
  await waitFor(() =>
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    ),
  );
  expect(write).toHaveBeenCalledWith(
    native.ORGANIZATION + "/service_accounts/svac_runner",
    { description: null },
    "POST",
    false,
    undefined,
  );
  expect(
    client.getQueryData(["service-accounts", "detail", account.id]),
  ).toMatchObject({ description: null });
});

it("updates the full page from the platform's role and archive responses", async () => {
  const user = userEvent.setup();
  let current = { ...account };
  vi.spyOn(native, "nativeGet").mockImplementation(async () => ({
    ...current,
  }));
  vi.spyOn(http, "consoleKeysGet").mockResolvedValue([]);
  const write = vi
    .spyOn(native, "nativeWrite")
    .mockImplementation(async (path, data) => {
      current = path.endsWith("/archive")
        ? { ...current, archived_at: account.updated_at }
        : {
            ...current,
            ...(data as Pick<native.ServiceAccount, "organization_role">),
          };
      return { ...current };
    });
  renderView(
    <ServiceAccountDetail id={account.id} listHref="/service-accounts" />,
  );
  const description = await screen.findByRole("textbox", {
    name: "Description",
  });
  expect(description).toHaveAttribute(
    "placeholder",
    "e.g. CI/CD pipeline workloads",
  );
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  fireEvent.change(description, { target: { value: "Draft" } });
  expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
  fireEvent.change(description, { target: { value: account.description } });
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  await user.clear(description);
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull(),
  );
  expect(write).toHaveBeenCalledWith(
    native.ORGANIZATION + "/service_accounts/svac_runner",
    { description: null },
    "POST",
    false,
    undefined,
  );
  await user.click(
    await screen.findByRole("combobox", { name: "Organization role" }),
  );
  await user.click(await screen.findByRole("option", { name: "Admin" }));
  await waitFor(() =>
    expect(screen.getByRole("combobox")).toHaveTextContent("Admin"),
  );
  expect(write).toHaveBeenCalledWith(
    native.ORGANIZATION + "/service_accounts/svac_runner",
    { organization_role: "admin" },
    "POST",
    false,
    undefined,
  );
  await user.click(
    screen.getByRole("button", { name: "More actions for " + account.name }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
  const confirm = within(
    await screen.findByRole("alertdialog", { name: "Archive service account" }),
  );
  await user.click(confirm.getByRole("button", { name: "Archive" }));
  await waitFor(() => expect(screen.getByRole("combobox")).toBeDisabled());
  expect(screen.queryByRole("button", { name: "Create key" })).toBeNull();
});

it("retains the server role and a separate description draft when a role change is denied", async () => {
  const user = userEvent.setup();
  vi.spyOn(native, "nativeGet").mockResolvedValue(account);
  vi.spyOn(http, "consoleKeysGet").mockResolvedValue([]);
  const denied = new http.PlatformError(403, {
    type: "error",
    error: { type: "permission_error", message: "Role change denied" },
  });
  const write = vi.spyOn(native, "nativeWrite").mockRejectedValue(denied);
  renderView(
    <ServiceAccountDetail id={account.id} listHref="/service-accounts" />,
  );
  const description = await screen.findByRole("textbox", {
    name: "Description",
  });
  fireEvent.change(description, { target: { value: "Unsaved separately" } });
  const role = screen.getByRole("combobox", { name: "Organization role" });
  await user.click(role);
  await user.click(await screen.findByRole("option", { name: "Admin" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Role change denied",
  );
  expect(role).toHaveTextContent("Developer");
  expect(description).toHaveValue("Unsaved separately");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(write).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledWith(
    native.ORGANIZATION + "/service_accounts/svac_runner",
    { organization_role: "admin" },
    "POST",
    false,
    undefined,
  );
});
