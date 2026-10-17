import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddProviderButton } from "./add-provider-dialog";
import {
  sentBody,
  stubGatewayFetch,
} from "../../../test/mock-platform/gateway-fetch";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy }),
}));

function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AddProviderButton />
    </QueryClientProvider>,
  );
  return userEvent.click(screen.getByRole("button", { name: "Add provider" }));
}

const endpoint = (label: string) =>
  screen.getByRole("textbox", { name: `${label} endpoint` });
const submit = () =>
  screen
    .getAllByRole("button", { name: "Add provider" })
    .find((b) => b.closest("[role=dialog]"))!;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushSpy.mockReset();
});

describe("AddProviderButton", () => {
  it("starts from the first vendor's published hosts", async () => {
    stubGatewayFetch();
    await open();
    expect(
      await screen.findByRole("radio", { name: /DeepSeek/ }),
    ).toBeChecked();
    expect(endpoint("Anthropic-compatible")).toHaveValue(
      "https://api.deepseek.com/anthropic",
    );
    expect(endpoint("OpenAI-compatible")).toHaveValue(
      "https://api.deepseek.com",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("DeepSeek");
    // A single-site vendor has no region to choose.
    expect(screen.queryByRole("radio", { name: "China" })).toBeNull();
  });

  it("switches a two-site vendor's endpoints and name with its region", async () => {
    stubGatewayFetch();
    await open();
    await userEvent.click(
      await screen.findByRole("radio", { name: /MiniMax/ }),
    );
    expect(screen.getByRole("radio", { name: "China" })).toBeChecked();
    expect(endpoint("Anthropic-compatible")).toHaveValue(
      "https://api.minimax.cn/anthropic",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("MiniMax CN");

    await userEvent.click(screen.getByRole("radio", { name: "International" }));
    expect(endpoint("OpenAI-compatible")).toHaveValue(
      "https://api.minimax.io/v1",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("MiniMax Intl");
  });

  it("sends only the ticked endpoints, and nothing the operator left at its default", async () => {
    const fetchMock = stubGatewayFetch();
    await open();
    await screen.findByRole("radio", { name: /DeepSeek/ });
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Use the OpenAI-compatible endpoint",
      }),
    );
    await userEvent.click(submit());

    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\/providers\/gwprov_/),
      ),
    );
    expect(sentBody(fetchMock, "POST")).toEqual({
      name: "DeepSeek",
      profile: "deepseek",
      endpoints: { anthropic: "https://api.deepseek.com/anthropic" },
    });
  });

  it("waits for an endpoint on a vendor that publishes none", async () => {
    stubGatewayFetch();
    await open();
    await userEvent.click(
      await screen.findByRole("radio", { name: /Other OpenAI-compatible/ }),
    );
    expect(endpoint("OpenAI-compatible")).toHaveValue("");
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(submit()).toBeDisabled();

    await userEvent.type(
      endpoint("OpenAI-compatible"),
      "http://vllm.models.svc:8000/v1",
    );
    await userEvent.type(screen.getByLabelText("Name"), "vLLM");
    expect(submit()).toBeEnabled();
  });

  it("shows the gateway's refusal in the dialog and stays open", async () => {
    stubGatewayFetch((method, rest) =>
      method === "POST" && rest === "providers"
        ? new Response(
            JSON.stringify({
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "endpoints.anthropic carries userinfo",
              },
            }),
            { status: 400 },
          )
        : undefined,
    );
    await open();
    await screen.findByRole("radio", { name: /DeepSeek/ });
    await userEvent.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "endpoints.anthropic carries userinfo",
    );
    expect(pushSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
