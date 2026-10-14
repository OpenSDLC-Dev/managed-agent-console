import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <ProviderDetailPage params={asParams(id)} />
      </Suspense>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushSpy.mockReset();
});

describe("ProviderDetailPage", () => {
  // The one test that asserts the overview's human strings (CLAUDE.md).
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
          String(url) === "/api/gateway/admin/v1/providers/gwprov_vllmlocal1",
      ),
    ).toBe(true);
  });
});
