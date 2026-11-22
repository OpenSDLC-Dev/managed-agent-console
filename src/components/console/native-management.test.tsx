import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ORGANIZATION, type ServiceAccount } from "@/lib/platform/native";
import { useTestSearchParams } from "../../../test/search-params";
import { Members } from "./members";
import { ServiceAccounts } from "./service-accounts";
vi.mock("next/navigation", () => ({
  useSearchParams: () => useTestSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));
const member = {
  id: "user_admin",
  type: "user",
  name: "Alice",
  email: "",
  login_name: "alice",
  role: "admin",
  role_source: "manual",
  status: "active",
  added_at: "2026-10-01T00:00:00Z",
};
const service: ServiceAccount = {
  id: "svac_a",
  type: "service_account",
  name: "build-bot",
  description: "CI tasks",
  organization_role: "developer",
  created_at: "2026-10-01T00:00:00Z",
  created_by_actor_id: null,
  updated_at: "2026-10-01T00:00:00Z",
  updated_by_actor_id: null,
  archived_at: null,
  archived_by_actor_id: null,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.consoleAuth;
});
function mount(ui: React.ReactNode) {
  document.documentElement.dataset.consoleAuth = "platform";
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}
function mock({
  mode = "password",
  mapped = false,
  refuse = false,
  pending,
  self = true,
}: {
  mode?: string;
  mapped?: boolean;
  refuse?: boolean;
  pending?: Promise<Response>;
  self?: boolean;
} = {}) {
  const servicePath = `${ORGANIZATION}/service_accounts`;
  let accounts: ServiceAccount[] = [
    service,
    {
      ...service,
      id: "svac_old",
      name: "old-bot",
      archived_at: "2026-10-02T00:00:00Z",
      archived_by_actor_id: member.id,
    },
  ];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/config")
      return Response.json({ mode, native_login: true });
    if (url === "/api/auth/session")
      return Response.json({
        ...member,
        id: self ? member.id : "user_caller",
        signed_in: true,
        csrf_token: "test-csrf",
      });
    const { pathname, searchParams } = new URL(url, location.origin);
    if (pathname === servicePath || pathname.startsWith(servicePath + "/")) {
      const id = pathname.slice(servicePath.length + 1).split("/")[0];
      const account = accounts.find((row) => row.id === id);
      if (init?.method === "POST") {
        const fields = init.body ? JSON.parse(String(init.body)) : {};
        const record =
          pathname === servicePath
            ? { ...service, ...fields, id: "svac_new" }
            : pathname.endsWith("/archive")
              ? {
                  ...account,
                  archived_at: "2026-10-03T00:00:00Z",
                  archived_by_actor_id: member.id,
                }
              : { ...account, ...fields };
        const response = pending ? await pending : Response.json(record);
        if (response.ok) {
          const saved = (await response.clone().json()) as ServiceAccount;
          accounts = [saved, ...accounts.filter((row) => row.id !== saved.id)];
        }
        return response;
      }
      if (pathname !== servicePath) {
        return account
          ? Response.json(account)
          : Response.json({}, { status: 404 });
      }
      const rows = accounts.filter(
        (row) =>
          searchParams.get("include_archived") === "true" || !row.archived_at,
      );
      const afterFirst = searchParams.get("page") === "opaque-cursor";
      return Response.json({
        data: afterFirst ? rows.slice(1) : rows.slice(0, 1),
        next_page: !afterFirst && rows.length > 1 ? "opaque-cursor" : null,
      });
    }
    if (pathname.endsWith("/api_keys")) return Response.json([]);
    if (init?.method && init.method !== "GET")
      return (
        pending ??
        (refuse
          ? Response.json(
              {
                error: {
                  type: "invalid_request_error",
                  message:
                    "cannot remove or demote the last active human administrator",
                },
              },
              { status: 409 },
            )
          : Response.json(
              init.method === "DELETE"
                ? { id: member.id, type: "user_deleted" }
                : service,
            ))
      );
    return Response.json({
      data: [{ ...member, role_source: mapped ? "idp" : "manual" }],
      has_more: true,
      first_id: member.id,
      last_id: member.id,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("lists members with native ID cursors and email/role filters", async () => {
  const fetcher = mock();
  mount(<Members />);
  const user = userEvent.setup();
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  await user.type(
    screen.getByLabelText("Filter by email"),
    "alice@example.test",
  );
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(
    fetcher.mock.calls.some(([u]) => u.includes("email=alice%40example.test")),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Next page" }));
  expect(
    fetcher.mock.calls.some(([u]) => u.includes("after_id=user_admin")),
  ).toBe(true);
});
it("local member creation clears its password and never puts secrets in Query caches", async () => {
  const fetcher = mock();
  const client = mount(<Members />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Create local member" }),
  );
  await user.type(screen.getByLabelText("Login name"), "new-user");
  await user.type(screen.getByLabelText("Password"), "password-for-test");
  await user.click(screen.getByRole("button", { name: "Create member" }));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/console/organizations/default/members",
    expect.objectContaining({
      body: JSON.stringify({
        login_name: "new-user",
        password: "password-for-test",
        name: "",
        role: "user",
      }),
    }),
  );
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    ),
  ).not.toContain("password-for-test");
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
});
it("probe: mapped roles are not hand-editable, but removal still goes to the server", async () => {
  const fetcher = mock({ mode: "oidc", mapped: true, refuse: true });
  mount(<Members />);
  const user = userEvent.setup();
  expect(
    await screen.findByText("Managed by identity provider"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Create local member" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Role for Alice")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove Alice" }));
  await user.click(screen.getByRole("button", { name: "Confirm removal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "last active human administrator",
  );
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("members/user_admin"),
    expect.objectContaining({ method: "DELETE" }),
  );
  expect(screen.getByText("Alice")).toBeInTheDocument();
});
async function chooseAccountAction(
  user: ReturnType<typeof userEvent.setup>,
  action: "Edit" | "Archive",
) {
  await user.click(
    await screen.findByRole("button", { name: "More actions for build-bot" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: action }));
  // The loading panel and the editor share the same dialog name.
  if (action === "Edit")
    await screen.findByRole("textbox", { name: /Description/ });
  return within(
    await screen.findByRole(action === "Archive" ? "alertdialog" : "dialog"),
  );
}

it("service account create defaults developer and issues no automatic key", async () => {
  const fetcher = mock();
  mount(<ServiceAccounts />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Create service account" }),
  );
  const form = within(
    await screen.findByRole("dialog", { name: "Create service account" }),
  );
  await user.type(form.getByLabelText("Name"), "new-bot");
  await user.click(
    form.getByRole("button", { name: "Create service account" }),
  );
  expect(fetcher).toHaveBeenCalledWith(
    "/api/console/organizations/default/service_accounts",
    expect.objectContaining({
      body: JSON.stringify({
        name: "new-bot",
        description: "",
        organization_role: "developer",
      }),
    }),
  );
  const panel = within(await screen.findByRole("dialog", { name: "new-bot" }));
  expect(await panel.findByRole("heading", { name: "new-bot" })).toBeVisible();
  expect(
    await panel.findByText("No API keys for this service account yet."),
  ).toBeVisible();
  expect(
    fetcher.mock.calls.filter(
      ([url, init]) => init?.method === "POST" && url.endsWith("/api_keys"),
    ),
  ).toHaveLength(0);
});
it("service account edits keep names immutable, clear description and use opaque pagination/archive", async () => {
  const fetcher = mock();
  mount(<ServiceAccounts />);
  const user = userEvent.setup();
  const edit = await chooseAccountAction(user, "Edit");
  expect(edit.queryByRole("textbox", { name: "Name" })).toBeNull();
  await user.clear(edit.getByRole("textbox", { name: /Description/ }));
  await user.click(edit.getByRole("button", { name: "Save" }));
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("service_accounts/svac_a"),
    expect.objectContaining({
      body: JSON.stringify({ description: null }),
    }),
  );
  const details = within(
    await screen.findByRole("dialog", { name: service.name }),
  );
  expect(await details.findByText("No description.")).toBeVisible();
  await user.click(details.getByRole("button", { name: "Close details" }));
  await user.click(screen.getByRole("radio", { name: "Archived" }));
  expect(await screen.findByRole("button", { name: "old-bot" })).toBeVisible();
  expect(
    fetcher.mock.calls.some(([u]) => u.includes("page=opaque-cursor")),
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "build-bot" })).toBeNull();
  expect(
    fetcher.mock.calls.some(([u]) => u.includes("include_archived=true")),
  ).toBe(true);
  await user.click(screen.getByRole("radio", { name: "Active" }));
  const confirm = await chooseAccountAction(user, "Archive");
  await user.click(confirm.getByRole("button", { name: "Archive" }));
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("/svac_a/archive"),
    expect.objectContaining({ method: "POST" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "build-bot" })).toBeNull(),
  );
  await user.click(screen.getByRole("radio", { name: "Archived" }));
  expect(
    await screen.findByRole("button", { name: "build-bot" }),
  ).toBeVisible();
});

function deferredWrite() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it.each(["remove", "role"])(
  "pending member %s cannot open a new create draft",
  async (operation) => {
    const pending = deferredWrite();
    mock({ pending: pending.promise, self: false });
    const client = mount(<Members />);
    const user = userEvent.setup();
    await screen.findByText("Alice");
    if (operation === "remove") {
      await user.click(screen.getByRole("button", { name: "Remove Alice" }));
      await user.click(screen.getByRole("button", { name: "Confirm removal" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
    } else {
      await user.selectOptions(
        screen.getByLabelText("Role for Alice"),
        "developer",
      );
    }
    const trigger = screen.getByRole("button", { name: "Create local member" });
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    await user.click(trigger);
    expect(screen.queryByLabelText("Login name")).not.toBeInTheDocument();
    await act(async () => pending.resolve(Response.json({ id: member.id })));
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    await user.type(screen.getByLabelText("Login name"), "later-draft");
    expect(screen.getByLabelText("Login name")).toHaveValue("later-draft");
    client.clear();
  },
);
it("refused member creation keeps non-secret draft and clears only rendered password before awaiting", async () => {
  const pending = deferredWrite();
  const fetcher = mock({ pending: pending.promise });
  const client = mount(<Members />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Create local member" }),
  );
  await user.type(screen.getByLabelText("Login name"), "new-person");
  await user.type(screen.getByLabelText("Name", { exact: true }), "New Person");
  await user.selectOptions(
    screen.getByLabelText("Role", { exact: true }),
    "admin",
  );
  await user.type(screen.getByLabelText("Password"), "password-for-test");
  await user.click(screen.getByRole("button", { name: "Create member" }));
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(fetcher).toHaveBeenCalledWith(
    "/api/console/organizations/default/members",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-CSRF-Token": "test-csrf" }),
      body: JSON.stringify({
        login_name: "new-person",
        password: "password-for-test",
        name: "New Person",
        role: "admin",
      }),
    }),
  );
  const assertNoSecret = () => {
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => [q.queryKey, q.state.data]),
      ),
    ).not.toContain("password-for-test");
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  };
  assertNoSecret();
  await act(async () =>
    pending.resolve(
      Response.json(
        {
          error: {
            type: "conflict_error",
            message: "this name is unavailable",
          },
        },
        { status: 409 },
      ),
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "this name is unavailable",
  );
  expect(screen.getByLabelText("Login name")).toHaveValue("new-person");
  expect(screen.getByLabelText("Name", { exact: true })).toHaveValue(
    "New Person",
  );
  expect(screen.getByLabelText("Role", { exact: true })).toHaveValue("admin");
  expect(screen.getByLabelText("Password")).toHaveValue("");
  assertNoSecret();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.getByRole("button", { name: "Create local member" }),
  ).toBeEnabled();
  client.clear();
});
it("successful member creation disposes the draft and reopening restores defaults", async () => {
  mock();
  const client = mount(<Members />);
  const user = userEvent.setup();
  const trigger = await screen.findByRole("button", {
    name: "Create local member",
  });
  await user.click(trigger);
  await user.type(screen.getByLabelText("Login name"), "new-person");
  await user.type(screen.getByLabelText("Password"), "password-for-test");
  await user.selectOptions(
    screen.getByLabelText("Role", { exact: true }),
    "admin",
  );
  await user.click(screen.getByRole("button", { name: "Create member" }));
  await waitFor(() => expect(screen.queryByLabelText("Password")).toBeNull());
  await user.click(trigger);
  expect(screen.getByLabelText("Login name")).toHaveValue("");
  expect(screen.getByLabelText("Name", { exact: true })).toHaveValue("");
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(screen.getByLabelText("Role", { exact: true })).toHaveValue("user");
  client.clear();
});
it("member password policy refusal sends no write and preserves editable draft", async () => {
  const fetcher = mock();
  const client = mount(<Members />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Create local member" }),
  );
  await user.type(screen.getByLabelText("Login name"), "draft");
  await user.type(screen.getByLabelText("Password"), "short");
  await user.click(screen.getByRole("button", { name: "Create member" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("12–1024");
  expect(screen.getByLabelText("Login name")).toHaveValue("draft");
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(0);
  client.clear();
});
it.each(["create", "update", "archive"] as const)(
  "a pending service-account %s keeps its form and cannot open a new draft",
  async (operation) => {
    const pending = deferredWrite();
    const fetcher = mock({ pending: pending.promise });
    const client = mount(<ServiceAccounts />);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "build-bot" });
    const trigger = screen.getByRole("button", {
      name: "Create service account",
    });
    if (operation === "create") await user.click(trigger);
    else
      await chooseAccountAction(
        user,
        operation === "archive" ? "Archive" : "Edit",
      );
    const dialog = screen.getByRole(
      operation === "archive" ? "alertdialog" : "dialog",
    );
    const form = within(dialog);
    if (operation === "create")
      await user.type(form.getByLabelText("Name"), "pending-bot");
    if (operation === "update")
      await user.type(
        form.getByRole("textbox", { name: /Description/ }),
        " updated",
      );
    const action = form.getByRole("button", {
      name:
        operation === "create"
          ? "Create service account"
          : operation === "archive"
            ? "Archive"
            : "Save",
    });
    await user.click(action);
    await waitFor(() => expect(action).toBeDisabled());
    if (operation === "create")
      await user.click(form.getByRole("button", { name: "Close" }));
    else await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    if (operation === "update") {
      await user.click(trigger);
      expect(
        screen.queryByRole("dialog", { name: "Create service account" }),
      ).toBeNull();
    }
    expect(
      fetcher.mock.calls.filter(
        ([url, init]) =>
          url.includes("service_accounts") && init?.method === "POST",
      ),
    ).toHaveLength(1);
    await act(async () =>
      pending.resolve(
        operation === "update"
          ? Response.json(
              { error: { type: "invalid_request_error", message: "refused" } },
              { status: 400 },
            )
          : Response.json(
              operation === "create"
                ? { ...service, id: "svac_pending", name: "pending-bot" }
                : {
                    ...service,
                    archived_at: "2026-10-03T00:00:00Z",
                    archived_by_actor_id: member.id,
                  },
            ),
      ),
    );
    if (operation === "update") {
      expect(await form.findByRole("alert")).toHaveTextContent("refused");
      expect(form.getByRole("textbox", { name: /Description/ })).toHaveValue(
        "CI tasks updated",
      );
      await user.click(form.getByRole("button", { name: "Cancel" }));
    }
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    const later = within(
      await screen.findByRole("dialog", { name: "Create service account" }),
    );
    await user.type(later.getByLabelText("Name"), "later-bot");
    expect(later.getByLabelText("Name")).toHaveValue("later-bot");
    client.clear();
  },
);
