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
import UsagePage from "./page";
import UsageRequestsPage from "./requests/page";
import { stubGatewayFetch } from "../../../../test/mock-platform/gateway-fetch";
import {
  gatewayFixtures,
  resetGateway,
} from "../../../../test/mock-platform/gateway.mjs";
import type { GatewayDailyUsage, GatewayUsageRow } from "@/lib/platform/types";

const navigation = { pathname: "/usage", search: "" };
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: vi.fn() }),
}));

resetGateway();
const fixtures = gatewayFixtures();
const daily = fixtures.daily as GatewayDailyUsage[];
const ledger = fixtures.ledger as GatewayUsageRow[];

const KEYS = [
  {
    type: "api_key",
    id: "apikey_ci01",
    name: "ci-deploy",
    created_by: { id: "principal_op01", type: "principal" },
    status: "active",
  },
];

/** The mock gateway, and the console's key list for names. */
function stub() {
  return stubGatewayFetch((_method, rest) =>
    rest.endsWith("/api_keys") ? Response.json(KEYS) : undefined,
  );
}

function renderPage(page: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{page}</QueryClientProvider>,
  );
}

const reads = (fetchMock: ReturnType<typeof stub>, path: string) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url), "http://console"))
    .filter((u) => u.pathname === `/api/gateway/admin/v1/${path}`);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.pathname = "/usage";
  navigation.search = "";
});

describe("Usage overview", () => {
  it("sums the rollups into tiles, a bar a day, and a table by model", async () => {
    stub();
    renderPage(<UsagePage />);
    const requests = daily.reduce((n, r) => n + r.requests, 0);
    const cost = daily.reduce((n, r) => n + r.cost, 0);
    await waitFor(() =>
      expect(document.querySelector("[data-requests]")).toHaveAttribute(
        "data-requests",
        String(requests),
      ),
    );
    expect(
      Number(document.querySelector("[data-cost]")?.getAttribute("data-cost")),
    ).toBeCloseTo(cost);
    // Thirty days, those without traffic drawn as zero.
    expect(screen.getAllByRole("listitem")).toHaveLength(30);
    const table = document.querySelector("table[data-by=alias]")!;
    expect(
      [...table.querySelectorAll("[data-group]")].map((r) =>
        r.getAttribute("data-group"),
      ),
    ).toEqual(
      expect.arrayContaining(["agent-default", "deepseek-flash", "minimax-m3"]),
    );
  });

  // A read can name thousands of keys or models; a row for each would stall
  // the page (PR #223 review).
  it("probe: shows the 100 costliest groups, and says how many more there are", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      ...daily[0],
      alias: `model-${i}`,
      cost: i,
    }));
    stubGatewayFetch((_method, rest) =>
      rest.endsWith("/api_keys")
        ? Response.json(KEYS)
        : rest === "usage/daily"
          ? Response.json({ data: many })
          : undefined,
    );
    renderPage(<UsagePage />);
    await waitFor(() =>
      expect(document.querySelector("[data-hidden-groups]")).toHaveAttribute(
        "data-hidden-groups",
        "50",
      ),
    );
    const shown = document.querySelectorAll(
      "table[data-by=alias] [data-group]",
    );
    expect(shown).toHaveLength(100);
    expect(shown[0]).toHaveAttribute("data-group", "model-149");
  });

  // Cache writes have a price of their own (deployments.go cache_write), so
  // the overview counts them beside cache reads (PR #223 review).
  it("probe: counts cache writes beside cache reads", async () => {
    const written = daily.map((r) => ({ ...r, cache_write_tokens: 1000 }));
    stubGatewayFetch((_method, rest) =>
      rest.endsWith("/api_keys")
        ? Response.json(KEYS)
        : rest === "usage/daily"
          ? Response.json({ data: written })
          : undefined,
    );
    renderPage(<UsagePage />);
    await waitFor(() =>
      expect(document.querySelector("[data-cache-write]")).toHaveAttribute(
        "data-cache-write",
        String(1000 * written.length),
      ),
    );
    expect(
      screen.getByRole("columnheader", { name: "Cache write" }),
    ).toBeInTheDocument();
  });

  // Next.js supports Chrome 111 and Safari 16.4, which have no Map.groupBy
  // (PR #223 review).
  it("probe: renders in a browser without Map.groupBy", async () => {
    const groupBy = Map.groupBy;
    // @ts-expect-error -- the browsers the probe stands for lack it
    delete Map.groupBy;
    try {
      stub();
      renderPage(<UsagePage />);
      await waitFor(() =>
        expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0),
      );
      expect(
        document.querySelector("[data-group=agent-default]"),
      ).not.toBeNull();
    } finally {
      Map.groupBy = groupBy;
    }
  });

  it("groups by key under the key's name", async () => {
    stub();
    renderPage(<UsagePage />);
    await screen.findByRole("button", { name: "Key" });
    await userEvent.click(screen.getByRole("button", { name: "Key" }));
    const row = await waitFor(() => {
      const r = document.querySelector("[data-group=apikey_ci01]");
      expect(r).not.toBeNull();
      return r!;
    });
    await waitFor(() => expect(row).toHaveTextContent("ci-deploy"));
  });

  it("sends a filter it is given, and leaves an unset one out", async () => {
    const fetchMock = stub();
    renderPage(<UsagePage />);
    await screen.findByRole("button", { name: "Model" });
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "agent-default" }),
      ).toBeInTheDocument(),
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Model" }),
      "agent-default",
    );
    await waitFor(() =>
      expect(
        reads(fetchMock, "usage/daily").at(-1)?.searchParams.get("alias"),
      ).toBe("agent-default"),
    );
    // The gateway refuses a blank parameter, so none is ever sent.
    for (const url of reads(fetchMock, "usage/daily"))
      for (const [, value] of url.searchParams) expect(value).not.toBe("");
  });

  // Usage outlives a model deleted since; the gateway still filters by its
  // name (PR #223 review).
  it("probe: filters by a model the catalog no longer has", async () => {
    const retired = { ...daily[0], alias: "retired-model" };
    const fetchMock = stubGatewayFetch((_method, rest) =>
      rest.endsWith("/api_keys")
        ? Response.json(KEYS)
        : rest === "usage/daily"
          ? Response.json({ data: [...daily, retired] })
          : undefined,
    );
    renderPage(<UsagePage />);
    const model = await screen.findByRole("combobox", { name: "Model" });
    await waitFor(() =>
      expect(
        within(model).getByRole("option", { name: "retired-model" }),
      ).toBeInTheDocument(),
    );
    await userEvent.selectOptions(model, "retired-model");
    await waitFor(() =>
      expect(
        reads(fetchMock, "usage/daily").at(-1)?.searchParams.get("alias"),
      ).toBe("retired-model"),
    );
    expect(model).toHaveValue("retired-model");
  });

  it("probe: stands in for the page on a console that runs without a gateway", async () => {
    stubGatewayFetch(() =>
      Response.json(
        { type: "error", error: { type: "not_found_error", message: "x" } },
        { status: 404 },
      ),
    );
    renderPage(<UsagePage />);
    expect(await screen.findByTestId("unavailable-surface")).toHaveAttribute(
      "data-surface",
      "usage",
    );
  });
});

describe("Usage requests", () => {
  it("lists the ledger newest first, linking each session", async () => {
    navigation.pathname = "/usage/requests";
    stub();
    renderPage(<UsageRequestsPage />);
    const first = ledger[0];
    const row = (
      await screen.findAllByText(first.alias, { selector: "span" })
    )[0].closest("tr")!;
    expect(within(row).getByRole("link").getAttribute("href")).toBe(
      `/sessions/${first.session_id}`,
    );
    const statuses = [...document.querySelectorAll("[data-status]")].map((s) =>
      s.getAttribute("data-status"),
    );
    expect(statuses).toEqual(ledger.map((r) => String(r.status)));
    expect(screen.getByRole("link", { name: "Requests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  // Cache tokens are priced apart from input (PR #223 review).
  it("probe: shows a cached call's cache tokens, and none on an uncached one", async () => {
    navigation.pathname = "/usage/requests";
    const cached = ledger.find((r) => (r.cache_read_tokens ?? 0) > 0)!;
    const plain = {
      ...cached,
      id: cached.id + 1000,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
    };
    stubGatewayFetch((_method, rest) =>
      rest.endsWith("/api_keys")
        ? Response.json(KEYS)
        : rest === "usage/requests"
          ? Response.json({ data: [plain, cached], has_more: false })
          : undefined,
    );
    renderPage(<UsageRequestsPage />);
    const cell = await waitFor(() => {
      const c = document.querySelector(
        `[data-cache-read="${cached.cache_read_tokens}"]`,
      );
      expect(c).not.toBeNull();
      return c!;
    });
    expect(cell.childNodes).toHaveLength(2);
    // Two zero counts add no line, and no stray "0" either.
    expect(
      document.querySelector('[data-cache-read="0"]')!.childNodes,
    ).toHaveLength(1);
  });

  it("filters by a session from the URL", async () => {
    navigation.pathname = "/usage/requests";
    navigation.search = `session_id=${ledger[0].session_id}`;
    const fetchMock = stub();
    renderPage(<UsageRequestsPage />);
    await waitFor(() =>
      expect(
        reads(fetchMock, "usage/requests")[0]?.searchParams.get("session_id"),
      ).toBe(ledger[0].session_id),
    );
    expect(screen.getByLabelText("Session ID")).toHaveValue(
      ledger[0].session_id,
    );
  });

  // The Requests tab changes only the query string, which keeps the page
  // mounted (PR #223 review).
  it("probe: follows the URL when its session changes on a mounted page", async () => {
    navigation.pathname = "/usage/requests";
    navigation.search = `session_id=${ledger[0].session_id}`;
    const fetchMock = stub();
    const page = (
      <QueryClientProvider client={new QueryClient()}>
        <UsageRequestsPage />
      </QueryClientProvider>
    );
    const { rerender } = render(page);
    await screen.findByDisplayValue(ledger[0].session_id!);
    navigation.search = "";
    rerender(page);
    await waitFor(() =>
      expect(screen.getByLabelText("Session ID")).toHaveValue(""),
    );
    await waitFor(() =>
      expect(
        reads(fetchMock, "usage/requests")
          .at(-1)
          ?.searchParams.has("session_id"),
      ).toBe(false),
    );
  });

  it("loads older rows from before the last one shown", async () => {
    navigation.pathname = "/usage/requests";
    const fetchMock = stubGatewayFetch((_method, rest, url) => {
      if (rest.endsWith("/api_keys")) return Response.json(KEYS);
      if (rest !== "usage/requests") return undefined;
      const before = url.searchParams.get("before");
      return Response.json(
        before
          ? { data: ledger.slice(2), has_more: false }
          : { data: ledger.slice(0, 2), has_more: true },
      );
    });
    renderPage(<UsageRequestsPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Load older" }),
    );
    await waitFor(() =>
      expect(document.querySelectorAll("[data-status]")).toHaveLength(
        ledger.length,
      ),
    );
    expect(
      reads(fetchMock, "usage/requests").at(-1)?.searchParams.get("before"),
    ).toBe(String(ledger[1].id));
    expect(screen.queryByRole("button", { name: "Load older" })).toBeNull();
  });

  // TanStack keeps the loaded pages beside the error (PR #223 review).
  it("probe: keeps the loaded rows when an older page fails", async () => {
    navigation.pathname = "/usage/requests";
    stubGatewayFetch((_method, rest, url) => {
      if (rest.endsWith("/api_keys")) return Response.json(KEYS);
      if (rest !== "usage/requests") return undefined;
      return url.searchParams.get("before")
        ? Response.json(
            {
              type: "error",
              error: { type: "api_error", message: "ledger read failed" },
            },
            { status: 500 },
          )
        : Response.json({ data: ledger.slice(0, 2), has_more: true });
    });
    renderPage(<UsageRequestsPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Load older" }),
    );
    expect(await screen.findByText(/ledger read failed/)).toBeInTheDocument();
    expect(document.querySelectorAll("[data-status]")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Load older" }),
    ).toBeInTheDocument();
  });
});
