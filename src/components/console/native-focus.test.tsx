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
      const { pathname } = new URL(url, location.origin);
      if (pathname === `${ORGANIZATION}/service_accounts`)
        return Response.json({ data: [service], next_page: null });
      if (pathname === `${ORGANIZATION}/service_accounts/${service.id}`)
        return Response.json(service);
      if (pathname.endsWith("/api_keys")) return Response.json([]);
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
    await user.click(
      screen.getByRole("button", {
        name: kind === "members" ? "Cancel" : "Close",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(writes).toHaveLength(0);
  },
);

it.each(["cancel", "escape"] as const)(
  "focus contract: members pending create dismissed by %s restores trigger focus",
  async (dismissal) => {
    const pending = held();
    const writes = mount("members", pending.promise);
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", {
      name: "Create local member",
    });
    await screen.findByText("Alice");
    await user.click(trigger);
    await user.type(screen.getByLabelText("Login name"), "focus-probe");
    await user.type(screen.getByLabelText("Password"), "password-for-test");
    const submit = screen.getByRole("button", { name: "Create member" });
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
      await act(async () => pending.resolve(Response.json(member)));
    }
  },
);

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "More actions for build-bot" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  const editor = within(
    await screen.findByRole("dialog", { name: "build-bot" }),
  );
  await editor.findByRole("textbox", { name: /Description/ });
  return editor;
}

it.each([
  ["create", "close"],
  ["create", "escape"],
  ["edit", "cancel"],
] as const)(
  "focus contract: pending service-account %s resists %s and returns focus after a refused draft is closed",
  async (operation, dismissal) => {
    const pending = held();
    const writes = mount("service", pending.promise);
    const user = userEvent.setup();
    const create = await screen.findByRole("button", {
      name: "Create service account",
    });
    const row = await screen.findByRole("row", { name: /build-bot/ });
    if (operation === "create") await user.click(create);
    else await openEditor(user);
    const dialog = screen.getByRole("dialog");
    const form = within(dialog);
    const field = form.getByRole("textbox", {
      name: operation === "create" ? "Name" : /Description/,
    });
    await user.type(field, "focus-probe");
    await user.click(
      form.getByRole("button", {
        name: operation === "create" ? "Create service account" : "Save",
      }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    if (dismissal === "escape") await user.keyboard("{Escape}");
    else
      await user.click(
        form.getByRole("button", {
          name: operation === "create" ? "Close" : "Cancel",
        }),
      );
    expect(dialog).toBeVisible();
    expect(field).toBeDisabled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await act(async () =>
      pending.resolve(
        Response.json(
          { error: { type: "invalid_request_error", message: "refused" } },
          { status: 400 },
        ),
      ),
    );
    expect(await form.findByRole("alert")).toHaveTextContent("refused");
    if (operation === "create") {
      await user.click(form.getByRole("button", { name: "Close" }));
      await user.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", {
          name: "Discard",
        }),
      );
      await waitFor(() => expect(create).toHaveFocus());
    } else {
      await user.click(form.getByRole("button", { name: "Cancel" }));
      const details = await screen.findByRole("dialog", { name: service.name });
      expect(
        await within(details).findByRole("link", { name: "Open" }),
      ).toBeVisible();
      expect(
        within(details).queryByRole("button", { name: "Save" }),
      ).toBeNull();
      await waitFor(() => expect(details).toHaveFocus());
      await user.click(
        within(details).getByRole("button", { name: "Close details" }),
      );
      await waitFor(() =>
        expect(
          within(row).getByRole("button", {
            name: "More actions for build-bot",
          }),
        ).toHaveFocus(),
      );
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes).toHaveLength(1);
  },
);
it("probe: an open service-account editor retains description and role on a 400 refusal", async () => {
  const pending = held();
  mount("service", pending.promise);
  const user = userEvent.setup();
  const editor = await openEditor(user);
  const description = editor.getByRole("textbox", { name: /Description/ });
  const role = editor.getByRole("combobox", { name: "Organization role" });
  await user.clear(description);
  await user.type(description, "Retained draft");
  await user.click(role);
  await user.click(await screen.findByRole("option", { name: "Admin" }));
  await user.click(editor.getByRole("button", { name: "Save" }));
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
  expect(description).toHaveValue("Retained draft");
  expect(role).toHaveTextContent("Admin");
});
