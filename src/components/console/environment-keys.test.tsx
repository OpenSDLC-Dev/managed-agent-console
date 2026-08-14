import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EnvironmentKeysSection,
  canIssueEnvironmentKey,
  environmentKeyState,
} from "./environment-keys";
import type { Environment, EnvironmentKey } from "@/lib/platform/types";

const environment = (over?: Partial<Environment>): Environment => ({
  id: "env_1",
  type: "environment",
  name: "prod runners",
  description: "",
  config: { type: "self_hosted" },
  scope: "organization",
  metadata: {},
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T09:12:00Z",
  archived_at: null,
  ...over,
});

/** A cloud environment — the arm that has no worker to hold a key. */
const cloudEnvironment = (): Environment =>
  environment({
    config: {
      type: "cloud",
      networking: { type: "unrestricted" },
      packages: { apt: [], cargo: [], gem: [], go: [], npm: [], pip: [] },
    },
  });

/**
 * Expiry dates are relative to the real clock rather than pinned, because the
 * component reads `useNow`. Pinning them would make these assertions depend on
 * the day the suite runs — green now, red the year the fixture date passes.
 * The exact boundary is pinned instead in the `environmentKeyState` unit tests,
 * where the clock is a parameter.
 */
const DAY = 24 * 60 * 60 * 1000;
const fromNow = (days: number) =>
  new Date(Date.now() + days * DAY).toISOString();

const key = (
  over: Partial<EnvironmentKey> & { id: string },
): EnvironmentKey => ({
  name: "prod-runner-01",
  created_at: fromNow(-30),
  expires_at: fromNow(365),
  ...over,
});

const page = (data: EnvironmentKey[], over?: { total?: number }) => ({
  data,
  pagination: {
    total: over?.total ?? data.length,
    limit: 100,
    offset: 0,
    has_more: (over?.total ?? data.length) > data.length,
  },
});

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const TOKENS = "/api/oauth/organizations/default/environments/env_1/tokens";

function stub(response: Response | (() => Response)) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://console.test");
      if (url.pathname !== TOKENS)
        throw new Error(`unmatched fetch: ${url.pathname}`);
      return typeof response === "function" ? response() : response;
    }),
  );
}

/**
 * A stub that answers the whole surface — list, issue, revoke — so the write
 * tests exercise the same invalidate-and-refetch sequence the console really
 * runs, rather than a single canned response.
 */
function stubRoutes(over?: {
  rows?: EnvironmentKey[];
  issue?: () => Response;
  revoke?: () => Response;
}) {
  let rows = over?.rows ?? [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      const method = init?.method ?? "GET";
      if (url.pathname === TOKENS && method === "GET") return json(page(rows));
      if (url.pathname === TOKENS && method === "POST") {
        if (over?.issue) return over.issue();
        const body = JSON.parse(String(init?.body ?? "{}")) as { name: string };
        rows = [key({ id: `envkey_new_${rows.length}`, name: body.name })];
        return json({ access_token: SECRET, expires_in: 31536000 });
      }
      if (url.pathname.endsWith("/revoke") && method === "POST") {
        if (over?.revoke) return over.revoke();
        rows = [];
        return new Response(null, { status: 204 });
      }
      throw new Error(`unmatched fetch: ${method} ${url.pathname}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The plaintext the platform hands back once, and never again. */
const SECRET = "sk-map-env01-thisisthesecretvalue0000";

function renderSection(env = environment()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <EnvironmentKeysSection environment={env} />
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("environmentKeyState", () => {
  const now = Date.parse("2026-08-14T00:00:00Z");

  it("reads a future expiry as active and a past one as expired", () => {
    expect(environmentKeyState("2027-08-14T00:00:00Z", now)).toBe("active");
    expect(environmentKeyState("2026-08-13T23:59:59Z", now)).toBe("expired");
  });

  it("treats the exact expiry instant as expired", () => {
    expect(environmentKeyState("2026-08-14T00:00:00Z", now)).toBe("expired");
  });

  it("treats a key with no expiry, or an unparseable one, as active", () => {
    expect(environmentKeyState(null, now)).toBe("active");
    expect(environmentKeyState(undefined, now)).toBe("active");
    expect(environmentKeyState("not a date", now)).toBe("active");
  });
});

describe("canIssueEnvironmentKey", () => {
  // The platform's two 400s, mirrored (consoleapi.go:200-205).
  it("allows a live self-hosted environment only", () => {
    expect(canIssueEnvironmentKey(environment())).toBe(true);
    expect(
      canIssueEnvironmentKey(
        environment({ archived_at: "2026-08-10T00:00:00Z" }),
      ),
    ).toBe(false);
    expect(canIssueEnvironmentKey(cloudEnvironment())).toBe(false);
  });
});

describe("EnvironmentKeysSection", () => {
  it("lists a key with its machine-readable state", async () => {
    const expires = fromNow(365);
    stub(json(page([key({ id: "envkey_live", expires_at: expires })])));
    renderSection();

    await screen.findByText("prod-runner-01");
    const id = document.querySelector("[data-token-id]");
    expect(id).toHaveAttribute("data-token-id", "envkey_live");
    const expiry = document.querySelector("[data-key-state]");
    expect(expiry).toHaveAttribute("data-key-state", "active");
    expect(expiry).toHaveAttribute("data-expires-at", expires);
    expect(screen.queryByText("Expired")).toBeNull();
  });

  it("badges an expired key and still lists it", async () => {
    stub(json(page([key({ id: "envkey_old", expires_at: fromNow(-14) })])));
    renderSection();

    await screen.findByText("Expired");
    expect(document.querySelector("[data-key-state]")).toHaveAttribute(
      "data-key-state",
      "expired",
    );
  });

  it("renders an empty expiry as active with an empty attribute", async () => {
    stub(json(page([key({ id: "envkey_forever", expires_at: null })])));
    renderSection();

    await screen.findByText("prod-runner-01");
    const expiry = document.querySelector("[data-key-state]");
    expect(expiry).toHaveAttribute("data-expires-at", "");
    expect(expiry).toHaveAttribute("data-key-state", "active");
  });

  it("shows the empty state when the environment has no keys", async () => {
    stub(json(page([])));
    renderSection();
    await screen.findByText("No environment keys yet.");
  });

  it("says so rather than truncating silently when a page is capped", async () => {
    stub(json(page([key({ id: "envkey_1" })], { total: 140 })));
    renderSection();

    const note = await waitFor(() => {
      const found = document.querySelector("[data-has-more]");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(note).toHaveAttribute("data-total-keys", "140");
    expect(note).toHaveTextContent("Showing the first 1 of 140 keys.");
  });

  it("renders nothing for a cloud environment, and asks the platform nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderSection(cloudEnvironment());
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // An archived environment keeps its section: the platform still lists and
  // still revokes those keys (consoleapi.go:122-126).
  it("still lists keys for an archived self-hosted environment", async () => {
    stub(json(page([key({ id: "envkey_live" })])));
    renderSection(environment({ archived_at: "2026-08-10T00:00:00Z" }));
    await screen.findByText("prod-runner-01");
  });

  // Seam 6. Two things answer 404 on this route — the router catch-all on a
  // platform predating plan 30, and a deleted environment — so the section
  // re-reads the environment before concluding anything.
  const notFound = (message: string) =>
    json({ type: "error", error: { type: "not_found_error", message } }, 404);

  /** Answers the tokens route 404, and the environment re-read as told. */
  const stubSeam6 = (environmentExists: boolean | "unreachable") =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://console.test");
        if (url.pathname === TOKENS)
          return notFound("no such endpoint: /api/oauth/organizations/…");
        if (url.pathname === "/api/platform/v1/environments/env_1") {
          if (environmentExists === "unreachable")
            return json(
              { type: "error", error: { type: "api_error", message: "down" } },
              503,
            );
          return environmentExists
            ? json(environment())
            : notFound("environment env_1 not found");
        }
        throw new Error(`unmatched fetch: ${url.pathname}`);
      }),
    );

  it("hides itself when the platform does not serve the route", async () => {
    stubSeam6(true);
    const { container } = renderSection();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  // The race the re-read exists for: another operator deletes the environment
  // while this page is open. Hiding the section there would report a missing
  // feature instead of a deleted resource (PR #89 review).
  it("keeps the error when the environment has been deleted underneath it", async () => {
    stubSeam6(false);
    renderSection();
    await screen.findByTestId("error-state");
    expect(screen.getByText("Environment keys")).toBeInTheDocument();
  });

  it("keeps the error when the re-read cannot answer", async () => {
    stubSeam6("unreachable");
    renderSection();
    // Unknown is not a licence to hide: a struggling platform degrades to
    // "shown and erroring", never to "silently missing".
    await screen.findByTestId("error-state");
  });

  it("surfaces a real failure instead of hiding it", async () => {
    stub(
      json(
        { type: "error", error: { type: "api_error", message: "boom" } },
        500,
      ),
    );
    renderSection();
    await screen.findByText(/boom/);
    // Hiding a 5xx would tell an operator their platform lacks a feature it has.
    expect(screen.getByText("Environment keys")).toBeInTheDocument();
  });
});

describe("issuing a key", () => {
  const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      await screen.findByRole("button", { name: "Generate environment key" }),
    );
    return screen.findByRole("dialog");
  };

  it("issues with the typed name and reveals the key once", async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    renderSection();

    await openDialog(user);
    await user.type(screen.getByLabelText("Name"), "prod-runner-07");
    await user.click(
      screen.getByRole("button", { name: "Create environment key" }),
    );

    // The create body is `{name}` and nothing else (consoleapi.go:74-79).
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "POST",
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post![1]!.body))).toEqual({
        name: "prod-runner-07",
      });
    });

    await screen.findByText("Save your environment key");
    expect(screen.getByTestId("revealed-key")).toHaveTextContent(SECRET);

    // The response identifies no row, so the list must be re-read rather than
    // rendered from the issuance response.
    await screen.findByText("prod-runner-07");
  });

  it("trims the name and refuses to submit an empty one", async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    renderSection();

    await openDialog(user);
    const submit = screen.getByRole("button", {
      name: "Create environment key",
    });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "  spaced  ");
    await user.click(submit);
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "POST",
      );
      expect(JSON.parse(String(post![1]!.body))).toEqual({ name: "spaced" });
    });
  });

  it("shows the platform's refusal inline, not as a toast behind the modal", async () => {
    const user = userEvent.setup();
    stubRoutes({
      issue: () =>
        json(
          {
            type: "error",
            request_id: "req_xyz",
            error: {
              type: "invalid_request_error",
              message: "environment env_1 is archived",
            },
          },
          400,
        ),
    });
    renderSection();

    await openDialog(user);
    await user.type(screen.getByLabelText("Name"), "doomed");
    await user.click(
      screen.getByRole("button", { name: "Create environment key" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("environment env_1 is archived");
    expect(alert).toHaveTextContent("req_xyz");
    // Still open, so the operator can correct and retry.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Save your environment key")).toBeNull();
  });

  it("hides the control for an environment the platform would refuse", async () => {
    stubRoutes();
    const { rerender } = renderSection(
      environment({ archived_at: "2026-08-10T00:00:00Z" }),
    );
    // The table is still there — archived keys stay revocable.
    await screen.findByText("No environment keys yet.");
    expect(
      screen.queryByRole("button", { name: "Generate environment key" }),
    ).toBeNull();
    expect(screen.queryByTestId("environment-key-setup")).toBeNull();
    void rerender;
  });
});

describe("revoking a key", () => {
  it("revokes through the confirm dialog and drops the row", async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes({ rows: [key({ id: "envkey_doomed" })] });
    renderSection();

    await screen.findByText("prod-runner-01");
    await user.click(
      screen.getByRole("button", {
        name: "Revoke environment key prod-runner-01",
      }),
    );
    // The reference's own copy, which is also the warning that matters: a
    // running worker loses its connection.
    await screen.findByText(/Workers using this key will no longer be able/);
    // ConfirmIconButton labels its destructive action with the dialog title.
    await user.click(
      screen.getByRole("button", { name: "Revoke environment key" }),
    );

    await waitFor(() => {
      const revoke = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("/envkey_doomed/revoke"),
      );
      expect(revoke).toBeDefined();
      expect(revoke![1]?.method).toBe("POST");
      // A bodiless POST — the revoke route takes no body.
      expect(revoke![1]?.body).toBeUndefined();
    });
    await waitFor(() =>
      expect(screen.queryByText("prod-runner-01")).toBeNull(),
    );
  });
});

/**
 * The adversarial probe this surface exists to justify (plan 07, seam 7).
 *
 * The platform hands back the plaintext once and can never be asked again, so
 * "the key is visible in the dialog" is not the property worth asserting —
 * every happy-path test already shows that. The property is that it is visible
 * *there and nowhere else*, and that closing the dialog is final.
 */
describe("probe: the one-time secret has exactly one render path", () => {
  const issueAndReveal = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      await screen.findByRole("button", { name: "Generate environment key" }),
    );
    await user.type(screen.getByLabelText("Name"), "probe");
    await user.click(
      screen.getByRole("button", { name: "Create environment key" }),
    );
    await screen.findByText("Save your environment key");
  };

  it("appears in the DOM exactly once, and in no attribute", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderSection();
    await issueAndReveal(user);

    const html = document.body.innerHTML;
    const occurrences = html.split(SECRET).length - 1;
    expect(
      occurrences,
      `the plaintext key appears ${occurrences} times in the DOM`,
    ).toBe(1);

    // Every attribute of every element — a `data-*`, a title, a value, an
    // aria-label carrying the secret would each be a second copy that
    // outlives the dialog.
    for (const element of document.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(
          attribute.value,
          `<${element.tagName.toLowerCase()} ${attribute.name}> carries the key`,
        ).not.toContain(SECRET);
      }
    }
  });

  it("is gone from the DOM and the query cache once the dialog closes", async () => {
    const user = userEvent.setup();
    stubRoutes();
    const { client } = renderSection();
    await issueAndReveal(user);

    await user.click(screen.getByTestId("close-revealed-key"));
    await waitFor(() =>
      expect(screen.queryByTestId("revealed-key")).toBeNull(),
    );

    expect(document.body.innerHTML).not.toContain(SECRET);
    // `mutation.reset()` is what takes it out of here; without that call the
    // value survives in the mutation cache with nothing rendering it.
    expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain(
      SECRET,
    );
    expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain(
      SECRET,
    );
  });

  it("never reaches localStorage or sessionStorage", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderSection();
    await issueAndReveal(user);

    for (const store of [window.localStorage, window.sessionStorage]) {
      const dump = Object.keys(store)
        .map((k) => `${k}=${store.getItem(k)}`)
        .join("\n");
      expect(dump).not.toContain(SECRET);
    }
  });
});
