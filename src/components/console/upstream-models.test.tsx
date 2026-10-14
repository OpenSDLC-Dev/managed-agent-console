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
import { UpstreamModels } from "./upstream-models";
import {
  gatewayFixtures,
  resetGateway,
} from "../../../test/mock-platform/gateway.mjs";
import {
  sentBody,
  stubGatewayFetch,
} from "../../../test/mock-platform/gateway-fetch";
import type { GatewayProvider } from "@/lib/platform/types";

resetGateway();
const providers = gatewayFixtures().providers as GatewayProvider[];
const DEEPSEEK = providers.find((p) => p.id === "gwprov_deepseek01")!;

function renderModels() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <UpstreamModels provider={DEEPSEEK} />
    </QueryClientProvider>,
  );
}

const row = async (model: string) =>
  (await screen.findByText(model)).closest("tr")!;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UpstreamModels", () => {
  // The one test that asserts the limits and prices formatters' strings.
  it("lists this provider's models with limits, prices and the models using them", async () => {
    stubGatewayFetch();
    renderModels();
    const flash = await row("deepseek-v4-flash");
    expect(within(flash).getByText("128K / 32K")).toBeInTheDocument();
    expect(within(flash).getByText("1 / 2 / — / 0.1")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(flash).getByText("agent-default, deepseek-flash"),
      ).toBeInTheDocument(),
    );
    // Another provider's upstream model is not on this page.
    expect(screen.queryByText("MiniMax-M3")).toBeNull();
  });

  it("adds an upstream model, leaving blank prices out", async () => {
    const fetchMock = stubGatewayFetch();
    renderModels();
    await row("deepseek-v4-flash");
    await userEvent.click(
      screen.getByRole("button", { name: "Add upstream model" }),
    );
    await userEvent.type(
      screen.getByLabelText("Upstream model ID"),
      "deepseek-v4-lite",
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "tools" }));
    await userEvent.type(screen.getByLabelText("Context window"), "64000");
    await userEvent.type(screen.getByLabelText("Input"), "0.5");
    await userEvent.click(
      screen
        .getAllByRole("button", { name: "Add upstream model" })
        .find((b) => b.closest("[role=dialog]"))!,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sentBody(fetchMock, "POST")).toEqual({
      provider_id: "gwprov_deepseek01",
      upstream_model: "deepseek-v4-lite",
      kind: "chat",
      capabilities: {
        tools: true,
        thinking: false,
        vision: false,
        max_input_tokens: 64000,
      },
      prices: { input: 0.5 },
    });
    expect(await screen.findByText("deepseek-v4-lite")).toBeInTheDocument();
  });

  it("edits without sending the fields fixed at creation, and replaces prices whole", async () => {
    const fetchMock = stubGatewayFetch();
    renderModels();
    await row("deepseek-v4-pro");
    await userEvent.click(
      screen.getByRole("button", { name: "Edit deepseek-v4-pro" }),
    );
    expect(screen.getByLabelText("Upstream model ID")).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Cache read"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const body = sentBody(fetchMock, "POST") as Record<string, unknown>;
    expect(body).not.toHaveProperty("upstream_model");
    expect(body).not.toHaveProperty("kind");
    expect(body.prices).toEqual({
      input: 4,
      output: 16,
      cache_write: null,
      cache_read: null,
    });
  });
});
