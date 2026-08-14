import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

function renderSection(env = environment()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EnvironmentKeysSection environment={env} />
    </QueryClientProvider>,
  );
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

  // Seam 6: the section hides on a platform that predates plan 30, and only
  // because the environment itself has already loaded — see the component.
  it("hides itself when the platform does not serve the route", async () => {
    stub(
      json(
        {
          type: "error",
          error: {
            type: "not_found_error",
            message: "no such endpoint: /api/oauth/organizations/default/...",
          },
        },
        404,
      ),
    );
    const { container } = renderSection();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
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
