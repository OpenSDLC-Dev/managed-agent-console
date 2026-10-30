import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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
function mock({ mode = "password", mapped = false, refuse = false } = {}) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/config")
      return Response.json({ mode, native_login: true });
    if (url === "/api/auth/session")
      return Response.json({
        ...member,
        signed_in: true,
        csrf_token: "test-csrf",
      });
    if (init?.method && init.method !== "GET")
      return refuse
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
