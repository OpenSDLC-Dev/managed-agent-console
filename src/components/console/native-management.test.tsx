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
import { Members } from "./members";
import { ServiceAccounts } from "./service-accounts";
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
const service = {
  id: "svac_a",
  type: "service_account",
  name: "build-bot",
  description: "CI tasks",
  organization_role: "developer",
  created_at: "2026-10-01T00:00:00Z",
  created_by_actor_id: null,
  updated_at: null,
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
    if (url.includes("service_accounts"))
      return Response.json({ data: [service], next_page: "opaque-cursor" });
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
it("service account create defaults developer and promises no automatic key", async () => {
  const fetcher = mock();
  mount(<ServiceAccounts />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Create service account" }),
  );
  await user.type(screen.getByLabelText("Name"), "new-bot");
  await user.click(screen.getByRole("button", { name: "Create account" }));
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
  expect(
    screen.getByText("Creating a service account does not create an API key."),
  ).toBeInTheDocument();
});
it("service account edits keep names immutable, clear description and use opaque pagination/archive", async () => {
  const fetcher = mock();
  mount(<ServiceAccounts />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Edit build-bot" }),
  );
  expect(screen.getByLabelText("Name")).toBeDisabled();
  await user.clear(screen.getByLabelText("Description"));
  await user.click(screen.getByRole("button", { name: "Save account" }));
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("service_accounts/svac_a"),
    expect.objectContaining({
      body: JSON.stringify({
        description: null,
        organization_role: "developer",
      }),
    }),
  );
  await user.click(screen.getByRole("button", { name: "Next page" }));
  expect(
    fetcher.mock.calls.some(([u]) => u.includes("page=opaque-cursor")),
  ).toBe(true);
  await user.click(screen.getByLabelText("Include archived"));
  expect(
    fetcher.mock.calls.some(([u]) => u.includes("include_archived=true")),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Archive build-bot" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Confirm archive",
    }),
  );
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("/svac_a/archive"),
    expect.objectContaining({ method: "POST" }),
  );
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
it.each(["create", "update", "archive"])(
  "pending service-account %s cannot open a new draft after dismissal",
  async (operation) => {
    const pending = deferredWrite();
    mock({ pending: pending.promise });
    const client = mount(<ServiceAccounts />);
    const user = userEvent.setup();
    await screen.findByText("build-bot");
    const trigger = screen.getByRole("button", {
      name: "Create service account",
    });
    if (operation === "archive") {
      await user.click(
        screen.getByRole("button", { name: "Archive build-bot" }),
      );
      await user.click(screen.getByRole("button", { name: "Confirm archive" }));
    } else {
      await user.click(
        operation === "create"
          ? trigger
          : screen.getByRole("button", { name: "Edit build-bot" }),
      );
      if (operation === "create")
        await user.type(screen.getByLabelText("Name"), "pending-bot");
      await user.click(
        screen.getByRole("button", {
          name: operation === "create" ? "Create account" : "Save account",
        }),
      );
    }
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    await user.click(trigger);
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await act(async () =>
      pending.resolve(
        operation === "update"
          ? Response.json(
              { error: { type: "invalid_request_error", message: "refused" } },
              { status: 400 },
            )
          : Response.json(service),
      ),
    );
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    await user.type(screen.getByLabelText("Name"), "later-bot");
    expect(screen.getByLabelText("Name")).toHaveValue("later-bot");
    client.clear();
  },
);
