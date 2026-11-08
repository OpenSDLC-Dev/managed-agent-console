import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelKeys, accessLine, accessOf } from "./model-access";
import { ApiKeysTable } from "./api-keys";
import {
  sentBody,
  stubGatewayFetch,
} from "../../../test/mock-platform/gateway-fetch";
import type { ApiKey, GatewayKeyPolicy } from "@/lib/platform/types";
import {
  ConsoleSessionContext,
  useConsoleSession,
} from "@/components/shell/console-session";

it("probe: owned keys cannot write legacy model policies", async () => {
  stubGatewayFetch();
  const owned = Object.assign(apiKey({ id: "apikey_ci01" }), {
    principal: { type: "user_actor", user_id: "user_self" },
    can_manage: true,
  });
  renderTable([owned]);
  await waitFor(() =>
    expect(access(owned)).toHaveAttribute("data-models", "none"),
  );
  expect(screen.queryByRole("button", { name: "Model access" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Remove model policy/ }),
  ).toBeNull();
  cleanup();
  document.documentElement.dataset.consoleAuth = "platform";
  stubGatewayFetch((_method, rest) =>
    rest === "/admin/v1/key_policies"
      ? Response.json({ data: [policy({ aliases: ["a", "b"] })] })
      : undefined,
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={
          {
            data: { id: "user_self", signed_in: true, role: "developer" },
          } as ReturnType<typeof useConsoleSession>
        }
      >
        <ApiKeysTable
          keys={[{ ...CI, can_manage: true } as ApiKey]}
          loading={false}
          error={null}
        />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(access(CI)).toHaveAttribute("data-models", "2"));
  expect(screen.queryByRole("button", { name: "Model access" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Remove model policy/ }),
  ).toBeNull();
});

it.each(["developer", "admin"] as const)(
  "native %s model callers respect the key-list visibility scope",
  async (role) => {
    document.documentElement.dataset.consoleAuth = "platform";
    const owned = apiKey({
      id: "apikey_self",
      principal: { type: "user_actor", user_id: "user_self" },
    });
    const fetchMock = stubGatewayFetch((_method, rest) =>
      rest.endsWith("/api_keys")
        ? Response.json(role === "admin" ? [owned, CI] : [owned])
        : rest === "/admin/v1/key_policies"
          ? Response.json({ data: [policy({ aliases: ["agent-default"] })] })
          : undefined,
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ConsoleSessionContext.Provider
          value={
            { data: { id: "user_self", signed_in: true, role } } as ReturnType<
              typeof useConsoleSession
            >
          }
        >
          <ModelKeys alias="agent-default" />
        </ConsoleSessionContext.Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("key_policies"),
      ),
    ).toBe(true);
    if (role === "developer") {
      expect(screen.queryByText(/No active key can call it/)).toBeNull();
      expect(screen.queryByText(/Grant one on API Keys/)).toBeNull();
      expect(screen.getByText(/only your owned keys/)).toBeInTheDocument();
      expect(
        screen.getByText(/administrator to check other callers/),
      ).toBeInTheDocument();
      expect(document.querySelector("[data-callers]")).toBeNull();
    } else {
      expect(document.querySelector("[data-callers]")).toHaveAttribute(
        "data-callers",
        "1",
      );
      expect(document.querySelector("[data-key-id]")).toHaveAttribute(
        "data-key-id",
        CI.id,
      );
    }
  },
);

it.each([false, true])(
  "role-less legacy human model callers use visible inventory (full list=%s)",
  async (fullList) => {
    // The retained SSO session route supplies display metadata, not ID or role.
    const session = {
      signed_in: true,
      email: "operator@example.invalid",
      name: "Operator",
    };
    const owned = apiKey({
      id: "apikey_self",
      principal: { type: "user_actor", user_id: "user_self" },
    });
    const fetchMock = stubGatewayFetch((_method, rest) =>
      rest.endsWith("/api_keys")
        ? Response.json(fullList ? [owned, CI] : [owned])
        : rest === "key_policies"
          ? Response.json({ data: [policy({ aliases: ["agent-default"] })] })
          : undefined,
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ConsoleSessionContext.Provider
          value={{ data: session } as ReturnType<typeof useConsoleSession>}
        >
          <ModelKeys alias="agent-default" />
        </ConsoleSessionContext.Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/key_policies"),
      ),
    ).toBe(true);
    if (fullList) {
      // A legacy administrator gets the full list without a new role field.
      expect(document.querySelector("[data-callers]")).toHaveAttribute(
        "data-callers",
        "1",
      );
      expect(document.querySelector("[data-key-id]")).toHaveAttribute(
        "data-key-id",
        CI.id,
      );
    } else {
      expect(screen.queryByText(/No active key can call it/)).toBeNull();
      expect(screen.queryByText(/Grant one/)).toBeNull();
      expect(screen.getByText(/visible|scoped|unknown/i)).toBeInTheDocument();
      expect(document.querySelector("[data-key-id]")).toBeNull();
    }
  },
);

it.each(["legacy machine", "native unknown", "native admin"])(
  "%s empty model caller summary describes only visible inventory",
  async (mode) => {
    if (mode.startsWith("native"))
      document.documentElement.dataset.consoleAuth = "platform";
    stubGatewayFetch((_method, rest) =>
      rest.endsWith("/api_keys")
        ? Response.json([])
        : rest.endsWith("key_policies")
          ? Response.json({ data: [policy({ aliases: ["agent-default"] })] })
          : undefined,
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const session =
      mode === "legacy machine"
        ? null
        : {
            data: {
              signed_in: true,
              id: "user_self",
              ...(mode === "native admin" ? { role: "admin" } : {}),
            },
          };
    render(
      <QueryClientProvider client={client}>
        <ConsoleSessionContext.Provider
          value={session as ReturnType<typeof useConsoleSession> | null}
        >
          <ModelKeys alias="agent-default" />
        </ConsoleSessionContext.Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByText(/No active key can call it/)).toBeNull();
    expect(screen.queryByText(/Grant one/)).toBeNull();
    expect(screen.getByText(/visible|scoped|unknown/i)).toBeInTheDocument();
  },
);

it("owned keys cannot appear as gateway callers even with a stale legacy policy", async () => {
  const owned = Object.assign(apiKey({ id: "apikey_ci01" }), {
    principal: {
      type: "service_account_actor",
      service_account_id: "svac_self",
    },
  });
  stubGatewayFetch((_method, rest) =>
    rest.endsWith("/api_keys")
      ? Response.json([owned])
      : rest === "key_policies"
        ? Response.json({ data: [policy({ aliases: ["agent-default"] })] })
        : undefined,
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ModelKeys alias="agent-default" />
    </QueryClientProvider>,
  );
  await screen.findByText(/No visible active key/);
  expect(document.querySelector("[data-key-id]")).toBeNull();
});

const apiKey = (over: Partial<ApiKey> & { id: string }): ApiKey => ({
  type: "api_key",
  name: "ci-deploy",
  workspace_id: null,
  created_at: "2026-08-02T10:30:00Z",
  created_by: { id: "principal_op01", type: "principal" },
  partial_key_hint: "sk-map-api01-Cid...ploy",
  status: "active",
  expires_at: null,
  principal: null,
  ...over,
});

const policy = (over: Partial<GatewayKeyPolicy>): GatewayKeyPolicy => ({
  type: "key_policy",
  api_key_id: "apikey_ci01",
  aliases: null,
  rpm: null,
  tpm: null,
  created_at: "2026-10-10T08:00:00Z",
  updated_at: "2026-10-10T08:00:00Z",
  ...over,
});

// The mock gateway's seed grants apikey_ci01 two models at 60 RPM.
const CI = apiKey({ id: "apikey_ci01" });
const FRESH = apiKey({ id: "apikey_fresh01", name: "intern-sandbox" });
const BOOTSTRAP = apiKey({
  id: "apikey_bootstrap01",
  name: "bootstrap",
  created_by: null,
});

function renderTable(keys: ApiKey[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ApiKeysTable keys={keys} loading={false} error={null} />
    </QueryClientProvider>,
  );
}

const access = (key: ApiKey) =>
  screen.getByText(key.name).closest("tr")!.querySelector("[data-models]")!;

const openAccess = async (key: ApiKey) => {
  const row = screen.getByText(key.name).closest("tr")!;
  await userEvent.click(
    await within(row).findByRole("button", { name: "Model access" }),
  );
  return screen.getByRole("dialog");
};

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.consoleAuth;
  vi.unstubAllGlobals();
});

describe("accessLine", () => {
  // The one test that asserts the access formatter's strings.
  it("names the models and the limits, or their absence", () => {
    expect(
      accessLine(
        accessOf(CI, policy({ aliases: ["a", "b", "c"], rpm: 120, tpm: 4e5 })),
      ),
    ).toBe("3 models · 120 RPM · 400K TPM");
    expect(accessLine(accessOf(CI, policy({ aliases: ["a"], rpm: 60 })))).toBe(
      "1 model · 60 RPM",
    );
    expect(accessLine(accessOf(CI, policy({})))).toBe("All models · no limit");
    expect(accessLine(accessOf(FRESH, undefined))).toBe("No model access");
    expect(accessLine(accessOf(BOOTSTRAP, undefined))).toBe(
      "All models · built-in",
    );
  });
});

describe("accessOf", () => {
  it("reads a policy before the built-in grant, as the gateway does", () => {
    expect(accessOf(BOOTSTRAP, policy({ aliases: ["a"] }))).toMatchObject({
      models: 1,
      builtIn: false,
    });
  });
});

describe("ModelKeys", () => {
  const INACTIVE = apiKey({
    id: "apikey_off01",
    name: "retired",
    status: "inactive",
  });
  const ALL = apiKey({ id: "apikey_all01", name: "evals" });

  function renderKeys(alias: string, policies: GatewayKeyPolicy[]) {
    stubGatewayFetch((method, rest) =>
      rest.endsWith("/api_keys")
        ? Response.json([CI, FRESH, BOOTSTRAP, INACTIVE, ALL])
        : rest === "key_policies"
          ? Response.json({ data: policies })
          : undefined,
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ModelKeys alias={alias} />
      </QueryClientProvider>,
    );
  }
  const listed = () =>
    [...document.querySelectorAll("[data-key-id]")].map((li) =>
      li.getAttribute("data-key-id"),
    );

  // The one test that asserts grantLine's strings.
  it("lists the active keys the gateway would admit, and why", async () => {
    renderKeys("minimax-m3", [
      policy({ aliases: ["minimax-m3"], rpm: 60 }),
      policy({ api_key_id: "apikey_all01" }),
      policy({ api_key_id: "apikey_off01" }),
    ]);
    await waitFor(() =>
      expect(listed()).toEqual([
        "apikey_ci01",
        "apikey_bootstrap01",
        "apikey_all01",
      ]),
    );
    const note = (id: string) =>
      document.querySelector(`[data-key-id=${id}] span + span`)?.textContent;
    expect(note("apikey_ci01")).toBe("granted · 60 RPM");
    expect(note("apikey_bootstrap01")).toBe("built-in");
    expect(note("apikey_all01")).toBe("all models · no limit");
  });

  it("leaves out a key whose policy names other models", async () => {
    renderKeys("agent-default", [policy({ aliases: ["minimax-m3"] })]);
    await waitFor(() => expect(listed()).toEqual(["apikey_bootstrap01"]));
  });
});

describe("Model access on API keys", () => {
  it("shows each key's grant, and no control on a key the control plane manages", async () => {
    stubGatewayFetch();
    renderTable([CI, FRESH, BOOTSTRAP]);
    await waitFor(() => expect(access(CI)).toHaveAttribute("data-models", "2"));
    expect(access(CI)).toHaveAttribute("data-rpm", "60");
    expect(access(FRESH)).toHaveAttribute("data-models", "none");
    expect(access(BOOTSTRAP)).toHaveAttribute("data-built-in", "true");
    const bootstrapRow = screen.getByText("bootstrap").closest("tr")!;
    expect(
      within(bootstrapRow).queryByRole("button", { name: "Model access" }),
    ).toBeNull();
  });

  it("grants selected models with limits, written whole", async () => {
    const fetchMock = stubGatewayFetch();
    renderTable([FRESH]);
    const dialog = await openAccess(FRESH);
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Selected models" }),
    );
    const save = within(dialog).getByRole("button", { name: "Save" });
    // An empty list grants nothing; the gateway refuses it too.
    expect(save).toBeDisabled();
    await userEvent.click(
      await within(dialog).findByRole("checkbox", { name: /agent-default/ }),
    );
    await userEvent.type(
      within(dialog).getByLabelText("Requests per minute"),
      "120",
    );
    await userEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sentBody(fetchMock, "POST")).toEqual({
      aliases: ["agent-default"],
      rpm: 120,
      tpm: null,
    });
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === "POST");
    expect(String(put?.[0])).toBe(
      "/api/gateway/admin/v1/key_policies/apikey_fresh01",
    );
  });

  it("grants every model as aliases null", async () => {
    const fetchMock = stubGatewayFetch();
    renderTable([CI]);
    const dialog = await openAccess(CI);
    await userEvent.click(
      within(dialog).getByRole("radio", { name: /All models/ }),
    );
    await userEvent.clear(within(dialog).getByLabelText("Requests per minute"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sentBody(fetchMock, "POST")).toEqual({
      aliases: null,
      rpm: null,
      tpm: null,
    });
  });

  it("revokes by deleting the policy, and sends nothing for a key without one", async () => {
    const fetchMock = stubGatewayFetch();
    renderTable([CI, FRESH]);
    let dialog = await openAccess(CI);
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "No model access" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const deletes = () =>
      fetchMock.mock.calls.filter(([, i]) => i?.method === "DELETE");
    expect(deletes().map(([url]) => String(url))).toEqual([
      "/api/gateway/admin/v1/key_policies/apikey_ci01",
    ]);

    dialog = await openAccess(FRESH);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deletes()).toHaveLength(1);
  });

  // The gateway owns the bounds on a limit (admin/keypolicies.go), so the
  // dialog checks none of its own and shows the gateway's refusal instead.
  it("shows the gateway's refusal of a limit and stays open", async () => {
    const message = "rpm must be at least 1, or null for no limit";
    const fetchMock = stubGatewayFetch((method, rest) =>
      method === "POST" && rest.startsWith("key_policies/")
        ? Response.json(
            {
              type: "error",
              error: { type: "invalid_request_error", message },
            },
            { status: 400 },
          )
        : undefined,
    );
    renderTable([CI]);
    const dialog = await openAccess(CI);
    const rpm = within(dialog).getByLabelText("Requests per minute");
    await userEvent.clear(rpm);
    await userEvent.type(rpm, "0");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(sentBody(fetchMock, "POST")).toMatchObject({ rpm: 0 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // The control plane refuses changes to its own keys, but a gateway policy
  // on one, written through the API, is a separate row: on the brain's key it
  // limits every agent. Deleting it restores the built-in grant.
  it("probe: offers to remove a policy someone wrote on a built-in key", async () => {
    const BRAIN = apiKey({
      id: "apikey_brain01",
      name: "brain",
      created_by: null,
    });
    const fetchMock = stubGatewayFetch((method, rest) => {
      if (method === "GET" && rest === "key_policies")
        return Response.json({
          data: [policy({ api_key_id: BRAIN.id, aliases: ["minimax-m3"] })],
        });
      if (method === "DELETE" && rest === `key_policies/${BRAIN.id}`)
        return Response.json({
          type: "key_policy_deleted",
          api_key_id: BRAIN.id,
        });
    });
    renderTable([BRAIN, BOOTSTRAP]);
    const row = (key: ApiKey) => screen.getByText(key.name).closest("tr")!;
    await userEvent.click(
      await within(row(BRAIN)).findByRole("button", {
        name: "Remove model policy from brain",
      }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove model policy",
      }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls
          .filter(([, i]) => i?.method === "DELETE")
          .map(([url]) => String(url)),
      ).toEqual([`/api/gateway/admin/v1/key_policies/${BRAIN.id}`]),
    );
    expect(
      within(row(BOOTSTRAP)).queryByRole("button", { name: /model policy/ }),
    ).toBeNull();
  });

  // "1e309" is Infinity, which JSON writes as null: no limit. A whole number
  // past 2^53 rounds to another one the gateway would store.
  it.each([
    ["rpm", "Requests per minute", "1e309"],
    ["tpm", "Tokens per minute", "9007199254740993"],
  ])(
    "probe: sends no %s other than the one typed",
    async (field, label, typed) => {
      const fetchMock = stubGatewayFetch();
      renderTable([CI]);
      const dialog = await openAccess(CI);
      const input = within(dialog).getByLabelText(label);
      fireEvent.change(input, { target: { value: typed } });
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Save" }),
      );
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(field);
      expect(
        fetchMock.mock.calls.filter(([, i]) => i?.method === "POST"),
      ).toHaveLength(0);
    },
  );

  // Archiving leaves the gateway's policy, and a policy blocks deleting any
  // model it names (store/aliases.go DeleteAlias); so the control that
  // removes it stays.
  it("probe: keeps the control on an archived key that still has a policy", async () => {
    stubGatewayFetch();
    const archived = { ...CI, status: "archived" as const };
    const bare = { ...FRESH, status: "archived" as const };
    renderTable([archived, bare]);
    const row = (key: ApiKey) => screen.getByText(key.name).closest("tr")!;
    expect(
      await within(row(archived)).findByRole("button", {
        name: "Remove model policy from ci-deploy",
      }),
    ).toBeInTheDocument();
    expect(
      within(row(archived)).queryByRole("button", { name: /More actions for/ }),
    ).toBeNull();
    expect(
      within(row(bare)).queryByRole("button", { name: "Model access" }),
    ).toBeNull();
  });

  // A grant on a dead key serves no request and only blocks deleting the
  // models it names, so the policy it has can be removed and not widened
  // (PR #218 review).
  it.each(["archived", "expired"] as const)(
    "probe: offers no grant on an %s key, only the removal of one it has",
    async (status) => {
      const fetchMock = stubGatewayFetch();
      const held = { ...CI, status };
      const bare = { ...FRESH, status };
      renderTable([held, bare]);
      const row = (key: ApiKey) => screen.getByText(key.name).closest("tr")!;
      await userEvent.click(
        await within(row(held)).findByRole("button", {
          name: "Remove model policy from ci-deploy",
        }),
      );
      expect(
        await screen.findByText(
          "ci-deploy keeps no model access, and the models the policy names can be deleted.",
        ),
      ).toBeInTheDocument();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Remove model policy",
        }),
      );
      await waitFor(() =>
        expect(
          fetchMock.mock.calls
            .filter(([, i]) => i?.method && i.method !== "GET")
            .map(([url, i]) => `${i?.method} ${String(url)}`),
        ).toEqual([`DELETE /api/gateway/admin/v1/key_policies/${CI.id}`]),
      );
      expect(
        within(row(held)).queryByRole("button", { name: "Model access" }),
      ).toBeNull();
      await waitFor(() =>
        expect(access(bare)).toHaveAttribute("data-models", "none"),
      );
      expect(
        within(row(bare)).queryByRole("button", { name: "Model access" }),
      ).toBeNull();
    },
  );

  it("probe: drops the column on a console that runs without a gateway", async () => {
    // What the BFF answers every path while MODEL_GATEWAY_BASE_URL is unset.
    stubGatewayFetch(() =>
      Response.json(
        { type: "error", error: { type: "not_found_error", message: "x" } },
        { status: 404 },
      ),
    );
    renderTable([CI]);
    await waitFor(() =>
      expect(
        screen.queryByRole("columnheader", { name: "Model access" }),
      ).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "Model access" })).toBeNull();
  });
});
