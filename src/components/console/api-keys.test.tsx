import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiKeysTable, CreateKeyButton, expiryInstant } from "./api-keys";
import type { ApiKey } from "@/lib/platform/types";
import {
  ConsoleSessionContext,
  useConsoleSession,
} from "@/components/shell/console-session";
import { useApiKeys } from "@/lib/platform/queries";
import type { NativeSession, ServiceAccount } from "@/lib/platform/native";
import ApiKeysPage from "@/app/(console)/api-keys/page";
import DashboardPage from "@/app/(console)/dashboard/page";
import type { ReactNode } from "react";

const KEYS = "/api/console/organizations/default/workspaces/default/api_keys";

/** The plaintext the platform hands back once — root on this platform. */
const SECRET = "sk-map-api01-thisisthemanagementsecret";

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

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

function renderTable(keys: ApiKey[], fetchMock?: ReturnType<typeof vi.fn>) {
  if (fetchMock) vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    // Composed the way the page composes them: the create control lives in the
    // page header, top-right, and the table below it.
    ...render(
      <QueryClientProvider client={client}>
        <CreateKeyButton />
        <ApiKeysTable keys={keys} loading={false} error={null} />
      </QueryClientProvider>,
    ),
  };
}

/** The one write a test made. The table also reads the gateway's key policies. */
const postOf = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === "POST",
  ) as [string, RequestInit] | undefined;

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.consoleAuth;
  vi.unstubAllGlobals();
});

describe("expiryInstant", () => {
  const NOON = Date.parse("2026-08-14T12:00:00Z");

  it.each([
    ["3h", "2026-08-14T15:00:00.000Z"],
    ["1d", "2026-08-15T12:00:00.000Z"],
    ["7d", "2026-08-21T12:00:00.000Z"],
    ["30d", "2026-09-13T12:00:00.000Z"],
  ])(
    "resolves %s client-side, as the wire has no durations",
    (choice, want) => {
      expect(expiryInstant(choice as "3h", "", NOON)).toBe(want);
    },
  );

  // Absent, not a sentinel: the reference's "Never" omits the field, and the
  // caller turns this `undefined` into an omitted key rather than a null.
  it("gives Never no instant at all", () => {
    expect(expiryInstant("never", "", NOON)).toBeUndefined();
  });

  it("turns a custom local wall-clock into an absolute instant", () => {
    const iso = expiryInstant("custom", "2026-09-01T08:30", NOON);
    expect(iso).toBe(new Date("2026-09-01T08:30").toISOString());
  });

  it("probe: an unparseable custom value mints nothing", () => {
    expect(expiryInstant("custom", "not-a-date", NOON)).toBeUndefined();
  });
});

describe("ApiKeysTable", () => {
  it("renders the label over the hint, and says which keys never expire", () => {
    renderTable([apiKey({ id: "apikey_1" })]);
    expect(screen.getByText("ci-deploy")).toBeInTheDocument();
    expect(screen.getByText("sk-map-api01-Cid...ploy")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("active")).toHaveAttribute(
      "data-key-status",
      "active",
    );
  });

  // The reference renders a display name over an email; our wire carries only
  // an actor id and this platform has no member lookup to enrich it with, so
  // the id is what there is. Inventing a name would be the console asserting
  // something nobody told it.
  it("names the issuer by the actor the wire carries", () => {
    const { container } = renderTable([apiKey({ id: "apikey_1" })]);
    expect(
      container
        .querySelector("[data-created-by]")
        ?.getAttribute("data-created-by"),
    ).toBe("principal_op01");
  });

  // A key nobody issued belongs to CONTROLPLANE_API_KEY, and the platform
  // refuses every mutation on it. Offering controls that are guaranteed to 400
  // would teach the operator to distrust the ones that work.
  it("offers no controls on a key the control plane manages", () => {
    renderTable([apiKey({ id: "apikey_boot", created_by: null })]);
    expect(screen.getByText("Control plane")).toBeInTheDocument();
    expect(screen.queryByTestId("toggle-apikey_boot")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /More actions for/ }),
    ).toBeNull();
    expect(screen.getByText(/cannot be deleted here/)).toBeInTheDocument();
  });

  it("offers nothing on an archived key, which is terminal", () => {
    renderTable([apiKey({ id: "apikey_1", status: "archived" })]);
    expect(screen.queryByTestId("toggle-apikey_1")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /More actions for/ }),
    ).toBeNull();
  });

  // "An expired key can only be archived, not renamed or re-activated" is the
  // platform's rule, stated in its own refusal.
  it("offers only deletion on an expired key", async () => {
    renderTable([apiKey({ id: "apikey_1", status: "expired" })]);
    expect(screen.queryByTestId("toggle-apikey_1")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /More actions for/ }),
    );
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it.each(["active", "inactive", "expired"])(
    "deletes a %s key only after confirmation, using the platform's archive status",
    async (status) => {
      const fetchMock = vi.fn(async () =>
        json(apiKey({ id: "apikey_1", status: "archived" })),
      );
      const { client } = renderTable(
        [apiKey({ id: "apikey_1", status })],
        fetchMock,
      );
      const invalidate = vi.spyOn(client, "invalidateQueries");
      await userEvent.click(
        screen.getByRole("button", { name: /More actions for/ }),
      );
      await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
      expect(screen.getByRole("dialog")).toHaveTextContent("ci-deploy");
      expect(postOf(fetchMock)).toBeUndefined();
      await userEvent.click(
        screen.getByRole("button", { name: "Delete API key" }),
      );
      await waitFor(() => expect(postOf(fetchMock)).toBeDefined());
      const [url, init] = postOf(fetchMock)!;
      expect(url).toBe(`${KEYS}/apikey_1`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({ status: "archived" });
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["api-keys"] }),
      );
    },
  );

  it("cancels deletion without changing the key", async () => {
    const fetchMock = vi.fn(async () => json([]));
    renderTable([apiKey({ id: "apikey_1" })], fetchMock);
    await userEvent.click(
      screen.getByRole("button", { name: /More actions for/ }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(postOf(fetchMock)).toBeUndefined();
  });

  it("prevents a second deletion while the first request is pending", async () => {
    let settle: (response: Response) => void = () => {};
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST")
          return new Promise<Response>((resolve) => {
            settle = resolve;
          });
        return json([]);
      },
    );
    renderTable([apiKey({ id: "apikey_1" })], fetchMock);
    await userEvent.click(
      screen.getByRole("button", { name: /More actions for/ }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete API key" }),
    );
    const trigger = screen.getByRole("button", { name: /More actions for/ });
    await waitFor(() => expect(trigger).toBeDisabled());
    await userEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
    settle(json(apiKey({ id: "apikey_1", status: "archived" })));
    await waitFor(() => expect(trigger).toBeEnabled());
  });

  it("disables an active key through the status field, since there is no verb", async () => {
    // Typed rather than inferred: the call is asserted below, and a zero-arg
    // mock would make `mock.calls[0]` an empty tuple.
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => json(apiKey({ id: "apikey_1" })));
    renderTable([apiKey({ id: "apikey_1" })], fetchMock);

    await userEvent.click(screen.getByTestId("toggle-apikey_1"));
    await waitFor(() => expect(postOf(fetchMock)).toBeDefined());
    const [url, init] = postOf(fetchMock)!;
    expect(url).toBe(`${KEYS}/apikey_1`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ status: "inactive" });
  });

  it("re-enables an inactive one", async () => {
    // Typed rather than inferred: the call is asserted below, and a zero-arg
    // mock would make `mock.calls[0]` an empty tuple.
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => json(apiKey({ id: "apikey_1" })));
    renderTable([apiKey({ id: "apikey_1", status: "inactive" })], fetchMock);

    await userEvent.click(screen.getByTestId("toggle-apikey_1"));
    await waitFor(() => expect(postOf(fetchMock)).toBeDefined());
    const [, init] = postOf(fetchMock)!;
    expect(JSON.parse(String(init.body))).toEqual({ status: "active" });
  });
});

describe("creating a key", () => {
  const stubCreate = () =>
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      if (url.pathname === KEYS && (init?.method ?? "GET") === "POST") {
        return json({ ...apiKey({ id: "apikey_new" }), raw_key: SECRET }, 200);
      }
      if (url.pathname === KEYS) return json([]);
      throw new Error(`unmatched fetch: ${url.pathname}`);
    });

  const openDialog = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    await userEvent.type(screen.getByLabelText("Name"), "ci-deploy");
  };

  it.each(["human SSO", "management key"])(
    "legacy %s issuance leaves ownership to the platform and omits assignment",
    async (lane) => {
      const issued = apiKey({
        id: "apikey_new",
        principal:
          lane === "human SSO"
            ? { type: "user_actor", user_id: "user_issuer" }
            : null,
      });
      const fetchMock = vi.fn(async (_input, init?: RequestInit) =>
        init?.method === "POST"
          ? json({ ...issued, raw_key: SECRET })
          : json([]),
      );
      vi.stubGlobal("fetch", fetchMock);
      const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <ConsoleSessionContext.Provider
            value={
              {
                data:
                  lane === "human SSO"
                    ? {
                        signed_in: true,
                        name: "Legacy operator",
                        email: "operator@example.test",
                      }
                    : null,
              } as ReturnType<typeof useConsoleSession>
            }
          >
            <CreateKeyButton />
          </ConsoleSessionContext.Provider>
        </QueryClientProvider>,
      );
      await openDialog();
      expect(
        screen.queryByText(
          /An unowned key carries legacy management authority/,
        ),
      ).toBeNull();
      expect(screen.getByRole("dialog")).toHaveTextContent(
        /platform assigns ownership from the issuing identity/i,
      );
      expect(screen.queryByLabelText("Owner")).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Add" }));
      await screen.findByTestId("revealed-api-key");
      const posts = fetchMock.mock.calls.filter(
        ([, init]) => init?.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(JSON.parse(String(posts[0][1]?.body))).not.toHaveProperty(
        "principal_id",
      );
      expect(
        fetchMock.mock.calls.some(([url]) =>
          /service_accounts|auth\/session/.test(String(url)),
        ),
      ).toBe(false);
    },
  );

  it("sends the chosen lifetime as an absolute instant", async () => {
    const fetchMock = stubCreate();
    renderTable([], fetchMock);
    await openDialog();
    await userEvent.selectOptions(screen.getByTestId("api-key-expires"), "7d");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(postOf(fetchMock)).toBeDefined());
    const [, init] = postOf(fetchMock)!;
    const body = JSON.parse(String(init.body)) as {
      name: string;
      expires_at: string;
    };
    expect(body.name).toBe("ci-deploy");
    // Seven days out, to the minute — the assertion that a wrong multiplier
    // would fail and nothing on the page would look wrong about.
    const days = (Date.parse(body.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
  });

  // The recorded contract from both ends: "Never" omits the field. Sending
  // null would mean the same to this platform and not to the recording.
  it("omits expires_at entirely for Never", async () => {
    const fetchMock = stubCreate();
    renderTable([], fetchMock);
    await openDialog();
    await userEvent.selectOptions(
      screen.getByTestId("api-key-expires"),
      "never",
    );
    expect(screen.getByTestId("never-expires-warning")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(postOf(fetchMock)).toBeDefined());
    const [, init] = postOf(fetchMock)!;
    expect(Object.keys(JSON.parse(String(init.body)))).toEqual(["name"]);
  });

  // Cancel used to set `open` directly, which does not run Radix's
  // `onOpenChange`, so the abandoned draft came back on the next open — and on
  // this form the abandoned value can be an expiry of Never.
  it("probe: an abandoned draft does not come back on the next open", async () => {
    const fetchMock = stubCreate();
    renderTable([], fetchMock);
    await openDialog();
    await userEvent.selectOptions(
      screen.getByTestId("api-key-expires"),
      "never",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByTestId("api-key-expires")).toHaveValue("30d");
    expect(screen.queryByTestId("never-expires-warning")).toBeNull();
    // Nothing was minted on the way through.
    expect(fetchMock).not.toHaveBeenCalledWith(
      KEYS,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("will not submit a custom expiry that is not a date", async () => {
    const fetchMock = stubCreate();
    renderTable([], fetchMock);
    await openDialog();
    await userEvent.selectOptions(
      screen.getByTestId("api-key-expires"),
      "custom",
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(postOf(fetchMock)).toBeUndefined();
  });

  /**
   * The reveal-once probe, and the reason this file exists.
   *
   * This credential is full management authority on the platform, so a second
   * render path for it is not a cosmetic bug. The assertions are the same ones
   * plan 07 slice 3 wrote for environment keys: on screen exactly once, in no
   * attribute of any element, and gone from every cache once the dialog closes
   * — the last of which failed until `gcTime: 0` was added there.
   */
  it("probe: the plaintext is rendered once, in no attribute, and outlives nothing", async () => {
    const fetchMock = stubCreate();
    const { client, container } = renderTable([], fetchMock);
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    const revealed = await screen.findByTestId("revealed-api-key");
    expect(revealed).toHaveTextContent(SECRET);
    expect(
      container.ownerDocument.body.innerHTML.split(SECRET).length - 1,
    ).toBe(1);
    for (const element of container.ownerDocument.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toContain(SECRET);
      }
    }

    await userEvent.click(screen.getByTestId("close-revealed-api-key"));
    await waitFor(() =>
      expect(screen.queryByTestId("revealed-api-key")).toBeNull(),
    );
    expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain(
      SECRET,
    );
    expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain(
      SECRET,
    );
    expect(container.ownerDocument.body.innerHTML).not.toContain(SECRET);
  });

  // The platform mints the key the moment the POST lands, so a dismissal
  // mid-flight would detach the handler that captures the plaintext and leave a
  // live root credential nobody has ever seen (PR #91's finding, on the other
  // surface).
  it("probe: refuses dismissal while the key is being minted", async () => {
    let settle: (value: Response) => void = () => {};
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://console.test");
        if (url.pathname === KEYS && (init?.method ?? "GET") === "POST") {
          return new Promise<Response>((resolve) => {
            settle = resolve;
          });
        }
        return json([]);
      },
    );
    renderTable([], fetchMock);
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await userEvent.keyboard("{Escape}");
    // Still open: the request is uninterruptible and hands back something
    // unrecoverable, so the honest thing is to not offer the interruption.
    expect(
      screen.getByRole("heading", { name: "Create API key" }),
    ).toBeInTheDocument();

    settle(json({ ...apiKey({ id: "apikey_new" }), raw_key: SECRET }, 200));
    expect(await screen.findByTestId("revealed-api-key")).toHaveTextContent(
      SECRET,
    );
  });

  it("shows a refusal inline rather than behind the modal", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://console.test");
        if (url.pathname === KEYS && (init?.method ?? "GET") === "POST") {
          return json(
            {
              type: "error",
              request_id: "req_x",
              error: {
                type: "invalid_request_error",
                message: "name: String should have at most 500 characters",
              },
            },
            400,
          );
        }
        return json([]);
      },
    );
    renderTable([], fetchMock);
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText(/at most 500 characters/),
    ).toBeInTheDocument();
  });
});

const session: NativeSession = {
  signed_in: true,
  id: "user_verbatim-self",
  role: "admin",
  role_source: "local",
  email: "self@example.test",
  name: "Operator",
  expires_at: "2099-01-01T00:00:00Z",
  csrf_token: "synthetic-csrf",
};
const ownedKey = (id: string, manage?: boolean, status = "active") =>
  Object.assign(apiKey({ id, name: id, status }), {
    principal: { type: "user_actor", user_id: session.id },
    created_by: { type: "user", id: session.id },
    ...(manage === undefined ? {} : { can_manage: manage }),
  });
function nativeView(initial = session, shortcut = false, page?: ReactNode) {
  document.documentElement.dataset.consoleAuth = "platform";
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Listing() {
    const keys = useApiKeys();
    return (
      <>
        <CreateKeyButton shortcut />
        <ApiKeysTable
          keys={keys.data ?? []}
          loading={keys.isPending}
          error={keys.error}
        />
      </>
    );
  }
  const view = (data: NativeSession) => (
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={{ data } as ReturnType<typeof useConsoleSession>}
      >
        {page ?? (shortcut ? <Listing /> : <ApiKeysPage />)}
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>
  );
  const result = render(view(initial));
  return {
    ...result,
    client,
    replace: (data: NativeSession) => result.rerender(view(data)),
  };
}
function serviceAccount(
  id: string,
  name: string,
  archived_at: string | null = null,
): ServiceAccount {
  return {
    id,
    name,
    type: "service_account",
    description: null,
    organization_role: "developer",
    created_at: "2026-11-07T00:00:00Z",
    updated_at: "2026-11-07T00:00:00Z",
    created_by_actor_id: session.id,
    updated_by_actor_id: session.id,
    archived_at,
    archived_by_actor_id: archived_at ? session.id : null,
  };
}
function nativeFetch(
  options: {
    pending?: boolean;
    reject?: boolean;
    pageFail?: boolean;
    firstPageFail?: boolean;
    singlePage?: boolean;
  } = {},
) {
  let current = session;
  let firstPage = [
    serviceAccount("svac_first", "First service"),
    serviceAccount("svac_archived", "Archived service", "2026-01-01T00:00:00Z"),
  ];
  let settle = () => {};
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), "http://console.test");
    if (url.pathname === "/api/auth/session") return json(current);
    if (url.pathname.endsWith("/service_accounts")) {
      if (
        (url.searchParams.get("page") === "page-two" && options.pageFail) ||
        (!url.searchParams.has("page") && options.firstPageFail)
      )
        return json(
          {
            error: { type: "api_error", message: "Directory page unavailable" },
          },
          503,
        );
      return json(
        url.searchParams.get("page") === "page-two"
          ? {
              data: [serviceAccount("svac_second", "Second-page service")],
              next_page: null,
            }
          : {
              data: firstPage,
              next_page: options.singlePage ? null : "page-two",
            },
      );
    }
    if (url.pathname === KEYS && init?.method === "POST") {
      const { principal_id } = JSON.parse(String(init.body));
      const issued = json({
        ...ownedKey("apikey_new"),
        principal:
          principal_id === current.id
            ? { type: "user_actor", user_id: principal_id }
            : {
                type: "service_account_actor",
                service_account_id: principal_id,
              },
        created_by: { type: "user", id: current.id },
        raw_key: SECRET,
      });
      if (options.pending)
        return new Promise<Response>((resolve) => {
          settle = () => resolve(issued);
        });
      if (options.reject)
        return json(
          {
            type: "error",
            request_id: "req_owned",
            error: { type: "not_found_error", message: "Owner is unavailable" },
          },
          404,
        );
      return issued;
    }
    if (url.pathname === KEYS)
      return json([ownedKey(`apikey_${current.id}`, true)]);
    if (url.pathname.includes("key_policies")) return json({ data: [] });
    throw new Error(`unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetcher);
  return {
    fetcher,
    replaceDirectory: (data: ServiceAccount[]) => {
      firstPage = data;
    },
    replace: (data: NativeSession) => {
      current = data;
    },
    settle: () => settle(),
  };
}

it.each([false, true])(
  "native key form sends self or an admin-selected active service account (shortcut=%s)",
  async (shortcut) => {
    const { fetcher } = nativeFetch();
    const { client } = nativeView(session, shortcut);
    const issuedPrincipals = () =>
      client
        .getMutationCache()
        .getAll()
        .filter((mutation) => mutation.state.status === "success")
        .map((mutation) => (mutation.state.data as ApiKey).principal);
    await userEvent.click(
      screen.getByRole("button", {
        name: shortcut ? "Get API key" : "Create key",
      }),
    );
    await userEvent.type(screen.getByLabelText("Name"), "self-key");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByTestId("revealed-api-key");
    expect(JSON.parse(String(postOf(fetcher)![1].body))).toMatchObject({
      principal_id: "user_verbatim-self",
    });
    expect(issuedPrincipals()).toEqual([
      { type: "user_actor", user_id: "user_verbatim-self" },
    ]);
    await userEvent.click(screen.getByTestId("close-revealed-api-key"));
    await userEvent.click(
      screen.getByRole("button", {
        name: shortcut ? "Get API key" : "Create key",
      }),
    );
    const picker = await screen.findByLabelText("Owner");
    expect(
      within(picker).queryByRole("option", { name: /Archived service/ }),
    ).toBeNull();
    await userEvent.click(
      await screen.findByRole("button", { name: "Load more service accounts" }),
    );
    await screen.findByRole("option", { name: /Second-page service/ });
    await userEvent.selectOptions(picker, "svac_second");
    await userEvent.type(screen.getByLabelText("Name"), "service-key");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByTestId("revealed-api-key");
    const posts = fetcher.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(JSON.parse(String(posts[1][1]?.body))).toMatchObject({
      principal_id: "svac_second",
    });
    expect(issuedPrincipals()).toEqual([
      { type: "service_account_actor", service_account_id: "svac_second" },
    ]);
    const directory = fetcher.mock.calls.filter(([url]) =>
      String(url).includes("/service_accounts"),
    );
    expect(
      directory.map(([url]) =>
        new URL(String(url), "http://console.test").searchParams.get("limit"),
      ),
    ).toEqual(["100", "100", "100"]);
    expect(directory.at(-1)?.[0]).toContain("page=page-two");
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes("/members")),
    ).toBe(false);
  },
);

it.each([
  ["user_verbatim-self", { type: "user_actor", user_id: "user_verbatim-self" }],
  [
    "svac_first",
    { type: "service_account_actor", service_account_id: "svac_first" },
  ],
])(
  "pending issuance retains the requested principal %s",
  async (owner, principal) => {
    const mock = nativeFetch({ pending: true });
    const { client } = nativeView();
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByRole("option", { name: /First service/ });
    await userEvent.selectOptions(
      screen.getByLabelText("Owner"),
      String(owner),
    );
    await userEvent.type(screen.getByLabelText("Name"), "pending-owner");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(postOf(mock.fetcher)).toBeDefined());
    mock.replace({ ...session, id: "user_later-session" });
    mock.settle();
    await screen.findByTestId("revealed-api-key");
    expect(
      client
        .getMutationCache()
        .getAll()
        .filter((mutation) => mutation.state.status === "success")
        .map((mutation) => (mutation.state.data as ApiKey).principal),
    ).toEqual([principal]);
  },
);

it.each([false, true])(
  "probe: native owner directory refreshes on reopening (shortcut=%s)",
  async (shortcut) => {
    const mock = nativeFetch();
    const view = nativeView(session, shortcut);
    view.client.setQueryData(["unrelated-public-cache"], "retained");
    const open = () =>
      userEvent.click(
        screen.getByRole("button", {
          name: shortcut ? "Get API key" : "Create key",
        }),
      );
    await open();
    await screen.findByRole("option", { name: /First service/ });
    await userEvent.selectOptions(screen.getByLabelText("Owner"), "svac_first");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    mock.replaceDirectory([
      serviceAccount("svac_first", "First service", "2026-11-08T00:00:00Z"),
      serviceAccount("svac_new", "New active service"),
    ]);
    await open();
    await waitFor(() =>
      expect(
        screen.queryByRole("option", { name: /New active service/ }),
      ).not.toBeNull(),
    );
    expect(screen.queryByRole("option", { name: /First service/ })).toBeNull();
    expect(screen.getByLabelText("Owner")).toHaveValue(session.id);
    await userEvent.selectOptions(screen.getByLabelText("Owner"), "svac_new");
    expect(screen.getByLabelText("Owner")).toHaveValue("svac_new");
    await userEvent.click(
      screen.getByRole("button", { name: "Load more service accounts" }),
    );
    await screen.findByRole("option", { name: /Second-page service/ });
    expect(view.client.getQueryData(["unrelated-public-cache"])).toBe(
      "retained",
    );
  },
);

it.each([false, true])(
  "native owner directory retries its first page without discarding the draft (shortcut=%s)",
  async (shortcut) => {
    const options = { firstPageFail: true };
    const { fetcher } = nativeFetch(options);
    nativeView(session, shortcut);
    await userEvent.click(
      screen.getByRole("button", {
        name: shortcut ? "Get API key" : "Create key",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Directory page unavailable",
    );
    await userEvent.type(screen.getByLabelText("Name"), "retained-draft");
    await userEvent.selectOptions(screen.getByLabelText("Expires"), "7d");
    expect(
      screen.queryByRole("button", { name: "Load more service accounts" }),
    ).toBeNull();
    options.firstPageFail = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const directory = fetcher.getMockImplementation()!;
    fetcher.mockImplementationOnce(async (...args) => {
      await held;
      return directory(...args);
    });
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toHaveAttribute("type", "button");
    try {
      await userEvent.click(retry);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled(),
      );
    } finally {
      release();
    }
    await screen.findByRole("option", { name: /First service/ });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue("retained-draft");
    expect(screen.getByLabelText("Expires")).toHaveValue("7d");
    expect(screen.getByLabelText("Owner")).toHaveValue(session.id);
    expect(postOf(fetcher)).toBeUndefined();
  },
);

it.each([false, true])(
  "native cached owner directory retries in place after reopening (shortcut=%s)",
  async (shortcut) => {
    const options = { singlePage: true, firstPageFail: false };
    const { fetcher } = nativeFetch(options);
    const { client } = nativeView(
      session,
      shortcut,
      shortcut ? <DashboardPage /> : undefined,
    );
    if (shortcut)
      expect(
        screen.getByRole("heading", { name: "Dashboard" }),
      ).toBeInTheDocument();
    client.setQueryData(["unrelated-public-cache"], "retained");
    const open = () =>
      userEvent.click(
        screen.getByRole("button", {
          name: shortcut ? "Get API key" : "Create key",
        }),
      );
    await open();
    await screen.findByRole("option", { name: /First service/ });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    options.firstPageFail = true;
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Directory page unavailable",
    );
    const owner = screen.getByLabelText("Owner");
    const name = screen.getByLabelText("Name");
    const form = name.closest("form");
    await userEvent.selectOptions(owner, "svac_first");
    await userEvent.type(name, "cached-draft");
    await userEvent.selectOptions(screen.getByLabelText("Expires"), "custom");
    await userEvent.type(
      screen.getByLabelText("Custom expiry"),
      "2099-05-06T10:30",
    );
    expect(
      screen.queryByRole("button", { name: "Load more service accounts" }),
    ).toBeNull();
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toHaveAttribute("type", "button");
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const directory = fetcher.getMockImplementation()!;
    fetcher.mockImplementationOnce(async (...args) => {
      await held;
      return directory(...args);
    });
    options.firstPageFail = false;
    try {
      await userEvent.click(retry);
      await waitFor(() => expect(retry).toBeDisabled());
      expect(screen.getByRole("button", { name: "Retry" })).toBe(retry);
      expect(screen.getByLabelText("Name").closest("form")).toBe(form);
      await userEvent.click(retry);
      expect(postOf(fetcher)).toBeUndefined();
    } finally {
      release();
    }
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByLabelText("Name")).toBe(name);
    expect(name).toHaveValue("cached-draft");
    expect(screen.getByLabelText("Expires")).toHaveValue("custom");
    expect(screen.getByLabelText("Custom expiry")).toHaveValue(
      "2099-05-06T10:30",
    );
    expect(screen.getByLabelText("Owner")).toBe(owner);
    expect(owner).toHaveValue("svac_first");
    expect(postOf(fetcher)).toBeUndefined();
    expect(
      fetcher.mock.calls
        .map(([url]) => new URL(String(url), "http://console.test"))
        // Dashboard's surface probe uses limit=1, not the owner's directory.
        .filter(
          (url) =>
            url.pathname.endsWith("/service_accounts") &&
            url.searchParams.get("limit") === "100",
        )
        .map((url) => url.searchParams.get("page")),
    ).toEqual([null, null, null]);
    expect(client.getQueryData(["unrelated-public-cache"])).toBe("retained");
  },
);

it.each([false, true])(
  "native first-page Retry stays disabled while a key is being issued (cached=%s)",
  async (cached) => {
    const options = { firstPageFail: !cached, pending: true, singlePage: true };
    const mock = nativeFetch(options);
    nativeView();
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    if (cached) {
      await screen.findByRole("option", { name: /First service/ });
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      options.firstPageFail = true;
      await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    }
    await screen.findByRole("alert");
    await userEvent.type(screen.getByLabelText("Name"), "self-during-outage");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(postOf(mock.fetcher)).toBeDefined());
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
    mock.settle();
    await screen.findByTestId("revealed-api-key");
  },
);

it("native owner pagination failure remains visible and page two can retry", async () => {
  const options = { pageFail: true };
  nativeFetch(options);
  nativeView();
  await userEvent.click(screen.getByRole("button", { name: "Create key" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Load more service accounts" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Directory page unavailable",
  );
  options.pageFail = false;
  await userEvent.click(
    screen.getByRole("button", { name: "Load more service accounts" }),
  );
  await screen.findByRole("option", { name: /Second-page service/ });
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["developer", "user"] as const)(
  "native %s never requests an owner directory",
  async (role) => {
    const mock = nativeFetch();
    mock.replace({ ...session, role });
    nativeView({ ...session, role });
    if (role === "developer") {
      await userEvent.click(screen.getByRole("button", { name: "Create key" }));
      await userEvent.type(screen.getByLabelText("Name"), "developer-key");
      await userEvent.click(screen.getByRole("button", { name: "Add" }));
      await screen.findByTestId("revealed-api-key");
      expect(JSON.parse(String(postOf(mock.fetcher)![1].body))).toHaveProperty(
        "principal_id",
        session.id,
      );
    } else
      expect(screen.queryByRole("button", { name: "Create key" })).toBeNull();
    expect(
      mock.fetcher.mock.calls.some(([url]) =>
        /service_accounts|members/.test(String(url)),
      ),
    ).toBe(false);
  },
);

it("probe: key controls obey row permission and lifecycle", async () => {
  renderTable(
    [
      ownedKey("denied", false),
      ownedKey("missing"),
      ownedKey("archived", true, "archived"),
      ownedKey("expired", true, "expired"),
      ownedKey("allowed", true),
      apiKey({ id: "old" }),
      { ...ownedKey("preset", true), created_by: null },
    ],
    vi.fn(async () => json({ data: [] })),
  );
  for (const id of ["denied", "missing", "archived", "preset"]) {
    const row = document.querySelector(`[data-key-id="${id}"]`)!.closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
  }
  expect(screen.getByTestId("toggle-allowed")).toBeInTheDocument();
  expect(screen.getByTestId("toggle-old")).toBeInTheDocument();
  expect(screen.queryByTestId("toggle-expired")).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "More actions for expired" }),
  );
  expect(
    screen.getAllByRole("menuitem").map((item) => item.textContent),
  ).toEqual(["Delete"]);
});

it.each(["draft", "reveal", "pending"])(
  "probe: owned key principal replacement clears draft reveal and cache (%s)",
  async (phase) => {
    const mock = nativeFetch({ pending: phase === "pending" });
    const view = nativeView();
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByRole("option", { name: /First service/ });
    await userEvent.type(screen.getByLabelText("Name"), "old-identity-draft");
    if (phase !== "draft") {
      await userEvent.click(screen.getByRole("button", { name: "Add" }));
      await waitFor(() => expect(postOf(mock.fetcher)).toBeDefined());
      if (phase === "reveal") await screen.findByTestId("revealed-api-key");
    }
    const next = { ...session, id: "user_replacement" };
    mock.replace(next);
    view.replace(next);
    if (phase === "pending") mock.settle();
    await waitFor(() =>
      expect(screen.queryByTestId("revealed-api-key")).toBeNull(),
    );
    expect(screen.queryByDisplayValue("old-identity-draft")).toBeNull();
    await waitFor(() =>
      expect(
        JSON.stringify(
          view.client
            .getQueryCache()
            .getAll()
            .map((query) => query.state.data),
        ),
      ).not.toContain("apikey_user_verbatim-self"),
    );
    await waitFor(() =>
      expect(
        JSON.stringify(view.client.getMutationCache().getAll()),
      ).not.toContain(SECRET),
    );
    expect(
      view.client
        .getQueryCache()
        .getAll()
        .filter((query) =>
          JSON.stringify(query.queryKey).includes("user_verbatim-self"),
        ),
    ).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
  },
);

it.each([
  ["developer", "svac_first"],
  ["user", "svac_first"],
  ["developer", "user_verbatim-self"],
] as const)(
  "probe: submit-time same-principal %s authority replaces admin context for %s",
  async (role, owner) => {
    const mock = nativeFetch();
    document.documentElement.dataset.consoleAuth = "platform";
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    // Use the real session observer, not a test-driven provider replacement.
    function CurrentSession() {
      const current = useConsoleSession();
      return (
        <ConsoleSessionContext.Provider value={current}>
          <CreateKeyButton />
          <ApiKeysTable
            keys={[apiKey({ id: "apikey_legacy" })]}
            loading={false}
            error={null}
          />
        </ConsoleSessionContext.Provider>
      );
    }
    render(
      <QueryClientProvider client={client}>
        <CurrentSession />
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "Model access" });
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByRole("option", { name: /First service/ });
    await userEvent.selectOptions(screen.getByLabelText("Owner"), owner);
    await userEvent.type(screen.getByLabelText("Name"), "stale-admin-draft");
    // Only the next HTTP session answer changes. No poll or provider update.
    mock.replace({ ...session, role });
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(
        client.getQueryData<NativeSession>(["console-session"])?.role,
      ).toBe(role),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Model access" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Remove model policy/ }),
    ).toBeNull();
    expect(screen.queryByDisplayValue("stale-admin-draft")).toBeNull();
    expect(screen.queryByRole("option", { name: /First service/ })).toBeNull();
    expect(postOf(mock.fetcher)).toBeUndefined();
    if (role === "developer") {
      await userEvent.click(screen.getByRole("button", { name: "Create key" }));
      expect(screen.getByLabelText("Owner")).toHaveValue(session.id);
      expect(screen.getByLabelText("Owner")).toBeDisabled();
      expect(screen.getByLabelText("Name")).toHaveValue("");
    } else
      expect(screen.queryByRole("button", { name: "Create key" })).toBeNull();
  },
);

it("native same-principal demotion discards service selection and rejects without fallback", async () => {
  const mock = nativeFetch({ reject: true });
  const view = nativeView();
  await userEvent.click(screen.getByRole("button", { name: "Create key" }));
  await screen.findByRole("option", { name: /First service/ });
  await userEvent.selectOptions(screen.getByLabelText("Owner"), "svac_first");
  const developer = { ...session, role: "developer" as const };
  mock.replace(developer);
  view.replace(developer);
  expect(screen.queryByRole("option", { name: /First service/ })).toBeNull();
  if (!screen.queryByLabelText("Name"))
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
  await userEvent.type(screen.getByLabelText("Name"), "demoted");
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Owner is unavailable",
  );
  const posts = mock.fetcher.mock.calls.filter(
    ([, init]) => init?.method === "POST",
  );
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0][1]?.body))).toHaveProperty(
    "principal_id",
    session.id,
  );
});

it("native reveal copies only to the clipboard and never stores or forwards the issued key", async () => {
  const mock = nativeFetch();
  const copy = vi.fn(async () => {});
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: copy } });
  const storage = vi.spyOn(Storage.prototype, "setItem");
  const view = nativeView();
  await userEvent.click(screen.getByRole("button", { name: "Create key" }));
  await userEvent.type(screen.getByLabelText("Name"), "clipboard-key");
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  await screen.findByTestId("revealed-api-key");
  await userEvent.click(screen.getByRole("button", { name: "Copy API key" }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith(SECRET));
  expect(storage).not.toHaveBeenCalled();
  expect(JSON.stringify(mock.fetcher.mock.calls)).not.toContain(SECRET);
  expect(
    JSON.stringify(
      view.client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain(SECRET);
  storage.mockRestore();
});

it("owned metadata labels the owner and creator types independently", () => {
  const { container } = renderTable([ownedKey("display", true)]);
  const owner = container.querySelector("[data-owner-id]")!;
  const creator = container.querySelector("[data-created-by]")!;
  expect(owner).toHaveAttribute("data-owner-id", session.id);
  expect(owner).toHaveTextContent("User");
  expect(creator).toHaveAttribute("data-created-by", session.id);
  expect(creator).toHaveTextContent("User");
  expect(
    within(owner as HTMLElement).getByTitle(session.id),
  ).toBeInTheDocument();
});
