import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditProviderButton } from "./edit-provider-dialog";
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

function renderEdit(provider: GatewayProvider) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <EditProviderButton provider={provider} />
    </QueryClientProvider>,
  );
  return userEvent.click(screen.getByRole("button", { name: "Edit" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("EditProviderButton", () => {
  it("sends the mutable fields, with a blank stall timeout as the default", async () => {
    const fetchMock = stubGatewayFetch();
    await renderEdit({
      ...providers[0],
      stall_timeout_ms: 30000,
      headers: { "X-Team": "agents" },
    });
    await userEvent.clear(screen.getByLabelText("Stall timeout (ms)"));
    await userEvent.click(screen.getByRole("button", { name: "Add header" }));
    await userEvent.type(screen.getByLabelText("Header 2 name"), "X-Env");
    await userEvent.type(screen.getByLabelText("Header 2 value"), "staging");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove header 1" }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Send W3C trace context to this vendor",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sentBody(fetchMock, "POST")).toEqual({
      name: "DeepSeek",
      headers: { "X-Env": "staging" },
      stall_timeout_ms: null,
      propagate_trace: true,
    });
  });

  // Inline only: the shell's toast would report the same refusal twice.
  it("shows the gateway's refusal inline, without a toast, and stays open", async () => {
    // jsdom has no matchMedia; the shell's <Toaster> needs it.
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    stubGatewayFetch(() =>
      Response.json(
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: 'header "Authorization" would carry a credential',
          },
        },
        { status: 400 },
      ),
    );
    render(
      <Providers>
        <EditProviderButton provider={providers[0]} />
      </Providers>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "would carry a credential",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toastPlatformError).not.toHaveBeenCalled();
  });
});
