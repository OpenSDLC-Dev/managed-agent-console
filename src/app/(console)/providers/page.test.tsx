import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProvidersPage from "./page";
import { stubGatewayFetch } from "../../../../test/mock-platform/gateway-fetch";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy }),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProvidersPage />
    </QueryClientProvider>,
  );
}

const row = async (name: string) =>
  (await screen.findByText(name, { selector: "td" })).closest("tr")!;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushSpy.mockReset();
});

describe("ProvidersPage", () => {
  it("lists each provider with its site, endpoints, counts and state", async () => {
    stubGatewayFetch();
    renderPage();

    const minimax = await row("MiniMax CN");
    expect(within(minimax).getByText("MiniMax · China")).toBeInTheDocument();
    expect(within(minimax).getByText("anthropic")).toBeInTheDocument();
    expect(within(minimax).getByText("openai")).toBeInTheDocument();

    // Counts are read per provider, the keys from the provider's own route.
    const deepseek = await row("DeepSeek");
    const counts = () =>
      [...deepseek.querySelectorAll("[data-count]")].map((c) =>
        c.getAttribute("data-count"),
      );
    await vi.waitFor(() => expect(counts()).toEqual(["2", "2"]));
    expect(
      deepseek.querySelector("[data-enabled]")?.getAttribute("data-enabled"),
    ).toBe("true");

    const vllm = await row("vLLM in cluster");
    expect(within(vllm).getByText("plain HTTP")).toBeInTheDocument();
    expect(
      vllm.querySelector("[data-enabled]")?.getAttribute("data-enabled"),
    ).toBe("false");
  });

  it("opens a provider's page from its row", async () => {
    stubGatewayFetch();
    renderPage();
    await userEvent.click(await row("Gitee AI"));
    expect(pushSpy).toHaveBeenCalledWith("/providers/gwprov_giteeai001");
  });

  it("probe: stands in for the page on a console that runs without a gateway", async () => {
    // What the BFF answers every path while MODEL_GATEWAY_BASE_URL is unset.
    stubGatewayFetch(
      () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: { type: "not_found_error", message: "no gateway" },
          }),
          { status: 404 },
        ),
    );
    renderPage();
    expect(await screen.findByTestId("unavailable-surface")).toHaveAttribute(
      "data-surface",
      "providers",
    );
    expect(screen.queryByText("no gateway")).toBeNull();
  });
});
