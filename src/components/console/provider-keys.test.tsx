import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProviderKeys } from "./provider-keys";
import {
  gatewayFixtures,
  resetGateway,
} from "../../../test/mock-platform/gateway.mjs";
import {
  sentBody,
  stubGatewayFetch,
} from "../../../test/mock-platform/gateway-fetch";
import type { GatewayProvider } from "@/lib/platform/types";

const SECRET = "sk-live-vendor-0123456789abcdef";

resetGateway();
const providers = gatewayFixtures().providers as GatewayProvider[];
const provider = (id: string) => providers.find((p) => p.id === id)!;

function renderKeys(id = "gwprov_deepseek01") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ProviderKeys provider={provider(id)} vendor="DeepSeek" />
    </QueryClientProvider>,
  );
  return client;
}

const addKey = async (key: string) => {
  await userEvent.click(screen.getByRole("button", { name: "Add key" }));
  await userEvent.type(screen.getByLabelText("API key"), key);
};
const submit = () =>
  screen
    .getAllByRole("button", { name: "Add key" })
    .find((b) => b.closest("[role=dialog]"))!;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProviderKeys", () => {
  it("lists each key by its last four, with its weight and no derived share", async () => {
    stubGatewayFetch();
    renderKeys();
    expect(await screen.findByText("••••a1f3")).toBeInTheDocument();
    const weights = [...document.querySelectorAll("[data-weight]")].map((s) =>
      s.getAttribute("data-weight"),
    );
    expect(weights).toEqual(["3", "1"]);
    // The weight-3 key serves both protocols and the other only Anthropic:
    // 75% of Anthropic requests but every OpenAI one. No single share is right.
    expect(document.body.textContent).not.toMatch(/\d+%/);
  });

  it("sends the key alone when every default is kept", async () => {
    const fetchMock = stubGatewayFetch();
    renderKeys();
    await screen.findByText("••••a1f3");
    await addKey(SECRET);
    await userEvent.click(submit());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sentBody(fetchMock, "POST")).toEqual({ key: SECRET });
  });

  it("names the protocols and weight only when the operator narrows them", async () => {
    const fetchMock = stubGatewayFetch();
    renderKeys();
    await screen.findByText("••••a1f3");
    await addKey(SECRET);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "OpenAI-compatible" }),
    );
    await userEvent.clear(screen.getByLabelText("Weight"));
    await userEvent.type(screen.getByLabelText("Weight"), "2");
    await userEvent.click(submit());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sentBody(fetchMock, "POST")).toEqual({
      key: SECRET,
      protocols: ["anthropic"],
      weight: 2,
    });
  });

  it("probe: keeps no trace of the key once the gateway has it", async () => {
    stubGatewayFetch();
    const client = renderKeys();
    await screen.findByText("••••a1f3");
    await addKey(SECRET);
    await userEvent.click(submit());
    // The new row shows the tail the gateway rendered, and nothing more.
    expect(await screen.findByText("••••cdef")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(SECRET);
    // The mutation's variables were the key; `gcTime: 0` drops them.
    await waitFor(() =>
      expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain(
        SECRET,
      ),
    );

    // Opening the dialog again starts empty.
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });

  it("probe: a refused key stays in the field and nowhere else on the page", async () => {
    stubGatewayFetch((method) =>
      method === "POST"
        ? Response.json(
            {
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "key contains whitespace or a control character",
              },
            },
            { status: 400 },
          )
        : undefined,
    );
    renderKeys();
    await screen.findByText("••••a1f3");
    await addKey(SECRET);
    await userEvent.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "key contains whitespace",
    );
    // Type is password, so the value is not text on the page, and the alert
    // quotes the gateway, which never echoes a key.
    expect(screen.getByLabelText("API key")).toHaveAttribute(
      "type",
      "password",
    );
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("disables a key by naming only that field", async () => {
    const fetchMock = stubGatewayFetch();
    renderKeys();
    await screen.findByText("••••a1f3");
    await userEvent.click(
      screen.getAllByRole("button", { name: "Disable" })[0],
    );
    await waitFor(() =>
      expect(sentBody(fetchMock, "POST")).toEqual({ enabled: false }),
    );
  });
});
