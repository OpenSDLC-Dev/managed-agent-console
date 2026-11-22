import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import ProviderDetailPage from "./page";
import {
  sentBody,
  stubGatewayFetch,
} from "../../../../../test/mock-platform/gateway-fetch";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

/** Pre-resolved params thenable: React's `use` reads .status/.value directly. */
function asParams(id: string): Promise<{ id: string }> {
  const value = { id };
  return {
    status: "fulfilled",
    value,
    then: (onFulfilled: (v: { id: string }) => void) => onFulfilled(value),
  } as unknown as Promise<{ id: string }>;
}

function renderPage(id: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <ProviderDetailPage params={asParams(id)} />
      </Suspense>
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushSpy.mockReset();
});

describe("ProviderDetailPage", () => {
  // The one test that asserts the overview's human strings (harness/rules/ui-evidence.md).
  it("shows the overview the provider was created with", async () => {
    stubGatewayFetch();
    renderPage("gwprov_minimaxcn1");
    expect(
      await screen.findByRole("heading", { level: 1, name: "MiniMax CN" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("MiniMax · China")).toBeInTheDocument();
    expect(
      screen.getByText("https://api.minimax.cn/anthropic"),
    ).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("Gateway default")).toBeInTheDocument();
    expect(screen.getByText("Not sent")).toBeInTheDocument();
  });

  it.each(["Add", "Edit"])(
    "keeps the %s pricing draft when the whole gateway is unavailable",
    async (action) => {
      let unavailable = false;
      const fetchMock = stubGatewayFetch((method, path) =>
        unavailable && method === "GET"
          ? Response.json(
              {
                type: "error",
                error: { type: "api_error", message: `Cannot load ${path}` },
              },
              { status: 503 },
            )
          : undefined,
      );
      const client = renderPage("gwprov_deepseek01");
      await userEvent.click(
        await screen.findByRole("button", {
          name:
            action === "Edit" ? "Edit deepseek-v4-flash" : "Add upstream model",
        }),
      );
      const form = within(screen.getByRole("dialog"));
      if (action === "Add")
        await userEvent.type(
          form.getByLabelText("Upstream model ID"),
          "new-flash",
        );
      await userEvent.clear(form.getByLabelText("Pricing terms"));
      await userEvent.type(
        form.getByLabelText("Pricing terms"),
        "Domestic standard",
      );
      const refresh = () =>
        act(() => client.invalidateQueries({ queryKey: ["gateway"] }));
      unavailable = true;
      await refresh();
      expect(
        await screen.findByText("Cannot load providers/gwprov_deepseek01"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Overview")).toBeNull();
      expect(screen.getByLabelText("Pricing terms")).toHaveValue(
        "Domestic standard",
      );
      unavailable = false;
      await refresh();
      await screen.findByText("Overview");
      await userEvent.click(
        form.getByRole("button", {
          name: action === "Edit" ? "Save" : "Add upstream model",
        }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(sentBody(fetchMock, "POST")).toMatchObject({
        price_note: "Domestic standard",
      });
    },
  );

  it("formats a stall timeout set on the provider", async () => {
    stubGatewayFetch((method, rest) =>
      method === "GET" && rest === "providers/gwprov_x"
        ? Response.json({
            type: "provider",
            id: "gwprov_x",
            name: "Slow",
            profile: "openai-generic",
            endpoints: { openai: "https://models.example.com/v1" },
            headers: { "X-Team": "agents" },
            stall_timeout_ms: 30000,
            propagate_trace: true,
            enabled: true,
            created_at: "2026-10-08T09:00:00Z",
            updated_at: "2026-10-08T09:00:00Z",
          })
        : undefined,
    );
    renderPage("gwprov_x");
    const stall = await screen.findByText("30,000 ms");
    expect(stall).toHaveAttribute("data-stall-timeout-ms", "30000");
    expect(screen.getByText("X-Team: agents")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });

  it("disables an enabled provider by naming only that field", async () => {
    const fetchMock = stubGatewayFetch();
    renderPage("gwprov_deepseek01");
    await userEvent.click(
      await screen.findByRole("button", { name: "Disable" }),
    );
    await waitFor(() =>
      expect(sentBody(fetchMock, "POST")).toEqual({ enabled: false }),
    );
    expect(await screen.findByRole("button", { name: "Enable" })).toBeEnabled();
  });

  it("returns to the list once the gateway deletes the provider", async () => {
    const fetchMock = stubGatewayFetch();
    renderPage("gwprov_vllmlocal1");
    // The seeded vLLM provider has no upstream models, so the store lets it go.
    await userEvent.click(
      await screen.findByRole("button", { name: "More actions" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    await userEvent.click(
      screen.getAllByRole("button", { name: /Delete/ }).at(-1)!,
    );
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/providers"));
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          init?.method === "DELETE" &&
          String(url) === "/admin/v1/providers/gwprov_vllmlocal1",
      ),
    ).toBe(true);
  });
});
