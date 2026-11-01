import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Members } from "./members";
import { ServiceAccounts } from "./service-accounts";

const clients: QueryClient[] = [];
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

function held() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mount(kind: "members" | "service", pending?: Promise<Response>) {
  document.documentElement.dataset.consoleAuth = "platform";
  const writes: Array<{ url: string; body?: BodyInit | null }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/config")
        return Response.json({ mode: "password", native_login: true });
      if (url === "/api/auth/session")
        return Response.json({
          ...member,
          signed_in: true,
          csrf_token: "probe-csrf",
        });
      if (init?.method && init.method !== "GET") {
        writes.push({ url, body: init.body });
        if (!pending) throw new Error("unexpected write in no-write control");
        return pending;
      }
      if (url.includes("service_accounts"))
        return Response.json({ data: [service], next_page: null });
      return Response.json({
        data: [member],
        has_more: false,
        first_id: member.id,
        last_id: member.id,
      });
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      {kind === "members" ? <Members /> : <ServiceAccounts />}
    </QueryClientProvider>,
  );
  return writes;
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.consoleAuth;
});

it.each(["members", "service"] as const)(
  "passing control: %s no-write Cancel restores trigger focus",
  async (kind) => {
    const writes = mount(kind);
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", {
      name:
        kind === "members" ? "Create local member" : "Create service account",
    });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(trigger).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(writes).toHaveLength(0);
  },
);

it.each([
  ["members", "create", "cancel"],
  ["members", "create", "escape"],
  ["service", "create", "cancel"],
  ["service", "create", "escape"],
  ["service", "edit", "cancel"],
] as const)(
  "focus contract: %s pending %s dismissed by %s restores trigger focus",
  async (kind, operation, dismissal) => {
    const pending = held();
    const writes = mount(kind, pending.promise);
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", {
      name:
        kind === "members" ? "Create local member" : "Create service account",
    });
    await screen.findByText(kind === "members" ? "Alice" : "build-bot");
    await user.click(
      operation === "edit"
        ? screen.getByRole("button", { name: "Edit build-bot" })
        : trigger,
    );
    if (kind === "members") {
      await user.type(screen.getByLabelText("Login name"), "focus-probe");
      await user.type(screen.getByLabelText("Password"), "password-for-test");
    } else if (operation === "create") {
      await user.type(screen.getByLabelText("Name"), "focus-probe-bot");
    }
    const submit = screen.getByRole("button", {
      name:
        kind === "members"
          ? "Create member"
          : operation === "create"
            ? "Create account"
            : "Save account",
    });
    await user.click(submit);
    try {
      await waitFor(() => expect(writes).toHaveLength(1));
      expect(submit).toBeDisabled();
      if (dismissal === "cancel")
        await user.click(screen.getByRole("button", { name: "Cancel" }));
      else await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(trigger).toHaveFocus();
      await user.click(trigger);
      await user.keyboard("{Enter} ");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(writes).toHaveLength(1);
    } finally {
      await act(async () =>
        pending.resolve(Response.json(kind === "members" ? member : service)),
      );
    }
  },
);
it("probe: an open service-account editor retains description and role on a 400 refusal", async () => {
  const pending = held();
  mount("service", pending.promise);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Edit build-bot" }),
  );
  await user.clear(screen.getByLabelText("Description"));
  await user.type(screen.getByLabelText("Description"), "Retained draft");
  await user.selectOptions(screen.getByLabelText("Organization role"), "admin");
  await user.click(screen.getByRole("button", { name: "Save account" }));
  await act(async () =>
    pending.resolve(
      Response.json(
        {
          error: {
            type: "invalid_request_error",
            message: "description refused",
          },
        },
        { status: 400 },
      ),
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "description refused",
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByLabelText("Description")).toHaveValue("Retained draft");
  expect(screen.getByLabelText("Organization role")).toHaveValue("admin");
});
