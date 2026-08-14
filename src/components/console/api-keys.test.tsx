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
import { ApiKeysTable, expiryInstant } from "./api-keys";
import type { ApiKey } from "@/lib/platform/types";

const KEYS = "/api/console/organizations/default/workspaces/default/api_keys";

/** The plaintext the platform hands back once — root on this platform. */
const SECRET = "sk-map-adm01-thisisthemanagementsecret";

const apiKey = (over: Partial<ApiKey> & { id: string }): ApiKey => ({
  type: "api_key",
  name: "ci-deploy",
  workspace_id: null,
  created_at: "2026-08-02T10:30:00Z",
  created_by: { id: "principal_op01", type: "principal" },
  partial_key_hint: "sk-map-adm01--Cid…eploy",
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
    ...render(
      <QueryClientProvider client={client}>
        <ApiKeysTable keys={keys} loading={false} error={null} />
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  cleanup();
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
    expect(screen.getByText("sk-map-adm01--Cid…eploy")).toBeInTheDocument();
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
      screen.queryByRole("button", { name: /Archive API key/ }),
    ).toBeNull();
  });

  it("offers nothing on an archived key, which is terminal", () => {
    renderTable([apiKey({ id: "apikey_1", status: "archived" })]);
    expect(screen.queryByTestId("toggle-apikey_1")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Archive API key/ }),
    ).toBeNull();
  });

  // "An expired key can only be archived, not renamed or re-activated" is the
  // platform's rule, stated in its own refusal.
  it("offers only the archive on an expired key", () => {
    renderTable([apiKey({ id: "apikey_1", status: "expired" })]);
    expect(screen.queryByTestId("toggle-apikey_1")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Archive API key/ }),
    ).toBeInTheDocument();
  });

  it("disables an active key through the status field, since there is no verb", async () => {
    // Typed rather than inferred: the call is asserted below, and a zero-arg
    // mock would make `mock.calls[0]` an empty tuple.
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => json(apiKey({ id: "apikey_1" })));
    renderTable([apiKey({ id: "apikey_1" })], fetchMock);

    await userEvent.click(screen.getByTestId("toggle-apikey_1"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ status: "active" });
  });
});

describe("creating a key", () => {
  const stubCreate = () =>
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      if (url.pathname === KEYS && (init?.method ?? "GET") === "POST") {
        return json({ ...apiKey({ id: "apikey_new" }), raw_key: SECRET }, 201);
      }
      if (url.pathname === KEYS) return json([]);
      throw new Error(`unmatched fetch: ${url.pathname}`);
    });

  const openDialog = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    await userEvent.type(screen.getByLabelText("Name"), "ci-deploy");
  };

  it("sends the chosen lifetime as an absolute instant", async () => {
    const fetchMock = stubCreate();
    renderTable([], fetchMock);
    await openDialog();
    await userEvent.selectOptions(screen.getByTestId("api-key-expires"), "7d");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
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
    expect(fetchMock).not.toHaveBeenCalled();
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

    settle(json({ ...apiKey({ id: "apikey_new" }), raw_key: SECRET }, 201));
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
                message: "name must be 1-128 characters",
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
      within(alert).getByText(/name must be 1-128 characters/),
    ).toBeInTheDocument();
  });
});
