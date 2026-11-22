import "@testing-library/jest-dom/vitest";
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
import { UpstreamModels } from "./upstream-models";
import { Providers } from "@/components/shell/providers";
import { toastPlatformError } from "@/lib/platform/toast-error";
import {
  gatewayFixtures,
  resetGateway,
} from "../../../test/mock-platform/gateway.mjs";
import {
  sentBody,
  stubGatewayFetch,
} from "../../../test/mock-platform/gateway-fetch";
import type { GatewayProvider } from "@/lib/platform/types";

vi.mock("@/lib/platform/toast-error", () => ({
  toastPlatformError: vi.fn(),
}));

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
  return client;
}

const row = async (model: string) =>
  (await screen.findByText(model)).closest("tr")!;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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

  it("says the users are unknown, not none, when the models cannot be read", async () => {
    stubGatewayFetch((method, rest) =>
      method === "GET" && rest === "aliases"
        ? Response.json(
            { type: "error", error: { type: "api_error", message: "down" } },
            { status: 500 },
          )
        : undefined,
    );
    renderModels();
    const pro = await row("deepseek-v4-pro");
    await waitFor(() =>
      expect(pro.querySelector("[data-used-by]")).toHaveTextContent("Unknown"),
    );
    expect(pro.querySelector("[data-used-by]")).toHaveAttribute(
      "data-used-by",
      "unknown",
    );
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
    expect(screen.getByLabelText("Price currency")).toHaveValue("CNY");
    await userEvent.type(
      screen.getByLabelText("Pricing terms"),
      "Standard API",
    );
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
      price_currency: "CNY",
      price_note: "Standard API",
    });
    expect(await screen.findByText("deepseek-v4-lite")).toBeInTheDocument();
  });

  // Number reads "0x10" as 16, a price nobody typed (PR #218 review).
  it("probe: sends no price other than the one typed", async () => {
    const fetchMock = stubGatewayFetch();
    renderModels();
    await row("deepseek-v4-pro");
    await userEvent.click(
      screen.getByRole("button", { name: "Edit deepseek-v4-pro" }),
    );
    await userEvent.clear(screen.getByLabelText("Input"));
    await userEvent.type(screen.getByLabelText("Input"), "0x10");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("input");
    expect(
      fetchMock.mock.calls.filter(([, i]) => i?.method === "POST"),
    ).toHaveLength(0);
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
    expect(body).not.toHaveProperty("price_currency");
    expect(body).not.toHaveProperty("price_note");
    expect(body.prices).toEqual({
      input: 4,
      output: 16,
      cache_write: null,
      cache_read: null,
    });
  });

  it("clears existing price metadata without altering recorded rates", async () => {
    const seed = gatewayFixtures().deployments;
    const fetchMock = stubGatewayFetch((method, path) =>
      method === "GET" && path === "deployments"
        ? Response.json({
            data: seed.map((d) => ({
              ...d,
              price_currency: "CNY",
              price_note: "Peak hours",
            })),
          })
        : undefined,
    );
    renderModels();
    const flash = await row("deepseek-v4-flash");
    await userEvent.click(
      within(flash).getByRole("button", { name: "Edit deepseek-v4-flash" }),
    );
    await userEvent.clear(screen.getByLabelText("Price currency"));
    await userEvent.clear(screen.getByLabelText("Pricing terms"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sentBody(fetchMock, "POST")).toEqual({
      price_currency: "",
      price_note: "",
    });
  });

  it("can edit numeric rates from a Platform that predates price metadata", async () => {
    const seed = gatewayFixtures().deployments;
    const fetchMock = stubGatewayFetch((method, path) =>
      method === "GET" && path === "deployments"
        ? Response.json({
            data: seed.map((deployment) => ({
              ...deployment,
              price_currency: undefined,
              price_note: undefined,
            })),
          })
        : undefined,
    );
    renderModels();
    expect(
      screen.queryByRole("button", { name: "Add upstream model" }),
    ).toBeNull();
    const flash = await row("deepseek-v4-flash");
    await userEvent.click(
      within(flash).getByRole("button", { name: "Edit deepseek-v4-flash" }),
    );
    expect(screen.queryByLabelText("Price currency")).toBeNull();
    await userEvent.clear(screen.getByLabelText("Cache read"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const body = sentBody(fetchMock, "POST");
    expect(body).not.toHaveProperty("price_currency");
    expect(body).not.toHaveProperty("price_note");
    expect(body).toHaveProperty("prices.cache_read", null);
  });

  it("accepts an explicit currency on the first deployment in an empty catalog", async () => {
    const fetchMock = stubGatewayFetch((method, path) =>
      method === "GET" && path === "deployments"
        ? Response.json({ data: [] })
        : undefined,
    );
    renderModels();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add upstream model" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("Upstream model ID"),
      "first-model",
    );
    await userEvent.type(dialog.getByLabelText("Price currency"), "CNY");
    await userEvent.type(dialog.getByLabelText("Output"), "0");
    await userEvent.click(
      dialog.getByRole("button", { name: "Add upstream model" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sentBody(fetchMock, "POST")).toMatchObject({
      prices: { output: 0 },
      price_currency: "CNY",
    });
  });

  it("omits newly hidden pricing fields when an empty catalog reveals an old Platform", async () => {
    let firstDeploymentExists = false;
    const fetchMock = stubGatewayFetch((method, path) =>
      method === "GET" && path === "deployments"
        ? Response.json({
            data: firstDeploymentExists
              ? gatewayFixtures().deployments.map((d) => ({
                  ...d,
                  price_currency: undefined,
                  price_note: undefined,
                }))
              : [],
          })
        : undefined,
    );
    const client = renderModels();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add upstream model" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("Upstream model ID"),
      "second-model",
    );
    await userEvent.type(dialog.getByLabelText("Price currency"), "CNY");
    await userEvent.type(dialog.getByLabelText("Pricing terms"), "Standard");
    firstDeploymentExists = true;
    await act(() =>
      client.invalidateQueries({ queryKey: ["gateway", "deployments"] }),
    );
    await waitFor(() =>
      expect(dialog.queryByLabelText("Price currency")).toBeNull(),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Add upstream model" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const body = sentBody(fetchMock, "POST");
    expect(body).not.toHaveProperty("price_currency");
    expect(body).not.toHaveProperty("price_note");
  });

  it("withdraws an open price editor if the deployments read is revoked", async () => {
    let revoked = false;
    stubGatewayFetch((method, path) =>
      revoked && method === "GET" && path === "deployments"
        ? Response.json(
            {
              type: "error",
              error: {
                type: "permission_error",
                message: "Deployment access revoked.",
              },
            },
            { status: 403 },
          )
        : undefined,
    );
    const client = renderModels();
    const flash = await row("deepseek-v4-flash");
    await userEvent.click(
      within(flash).getByRole("button", { name: "Edit deepseek-v4-flash" }),
    );
    expect(screen.getByLabelText("Pricing terms")).toBeVisible();
    revoked = true;
    await act(() =>
      client.invalidateQueries({ queryKey: ["gateway", "deployments"] }),
    );
    expect(await screen.findByText("Deployment access revoked.")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add upstream model" }),
    ).toBeNull();
  });

  it("preserves another operator's rates and existing note when only currency changes", async () => {
    let input = 1;
    const fetchMock = stubGatewayFetch((method, path) =>
      method === "GET" && path === "deployments"
        ? Response.json({
            data: gatewayFixtures().deployments.map((d) => ({
              ...d,
              prices: { ...d.prices, input },
              price_note: " Peak hours ",
              price_currency: "",
            })),
          })
        : undefined,
    );
    const client = renderModels();
    const flash = await row("deepseek-v4-flash");
    await userEvent.click(
      within(flash).getByRole("button", { name: "Edit deepseek-v4-flash" }),
    );
    await userEvent.type(screen.getByLabelText("Price currency"), "CNY");
    input = 9.75;
    await act(() =>
      client.invalidateQueries({ queryKey: ["gateway", "deployments"] }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sentBody(fetchMock, "POST")).toEqual({ price_currency: "CNY" });
  });

  // The row toggle shares its hook with the edit dialog, which answers a
  // refusal inline; the toggle has no dialog, so its refusal must toast.
  it("toasts a refused Enable/Disable", async () => {
    // jsdom has no matchMedia; the shell's <Toaster> needs it.
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    stubGatewayFetch((method, rest) =>
      method === "POST" && rest.startsWith("deployments/")
        ? Response.json(
            {
              type: "error",
              error: {
                type: "permission_error",
                message:
                  "this request needs the admin role; yours is developer",
              },
            },
            { status: 403 },
          )
        : undefined,
    );
    render(
      <Providers>
        <UpstreamModels provider={DEEPSEEK} />
      </Providers>,
    );
    const flash = await row("deepseek-v4-flash");
    await userEvent.click(
      within(flash).getByRole("button", { name: "Disable" }),
    );
    await waitFor(() =>
      expect(toastPlatformError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "this request needs the admin role; yours is developer",
        }),
        "Update failed",
      ),
    );
  });
});
