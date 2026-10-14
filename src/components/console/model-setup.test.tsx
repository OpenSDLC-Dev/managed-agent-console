import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelSetupDialog, NoModelsCallout } from "./model-setup";
import { stubGatewayFetch } from "../../../test/mock-platform/gateway-fetch";
import { emptyGateway } from "../../../test/mock-platform/gateway.mjs";

const SECRET = "sk-setup-0123456789abcdef";

function renderSetup() {
  const onDone = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ModelSetupDialog onClose={vi.fn()} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { onDone, client };
}

/** Each POST the setup made, as `[path, body]`. */
const posts = (fetchMock: ReturnType<typeof stubGatewayFetch>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([url, init]) => [
      String(url).replace("/api/gateway/admin/v1/", ""),
      JSON.parse(String(init!.body)),
    ]);

const states = () =>
  [...document.querySelectorAll("[data-step]")].map(
    (s) => `${s.getAttribute("data-step")}:${s.getAttribute("data-state")}`,
  );

async function fill(model = "MiniMax-M3") {
  await screen.findByRole("option", { name: "MiniMax" });
  await userEvent.selectOptions(screen.getByLabelText("Vendor"), "minimax");
  await userEvent.type(screen.getByLabelText("API key"), SECRET);
  await userEvent.type(screen.getByLabelText("Upstream model ID"), model);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModelSetupDialog", () => {
  it("makes a provider, its key, an upstream model and a model, in that order", async () => {
    const fetchMock = stubGatewayFetch();
    const { onDone } = renderSetup();
    await fill();
    // The name agents send follows the upstream model until it is edited.
    expect(screen.getByLabelText("Model name agents send")).toHaveValue(
      "MiniMax-M3",
    );
    await userEvent.clear(screen.getByLabelText("Model name agents send"));
    await userEvent.type(
      screen.getByLabelText("Model name agents send"),
      "minimax",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("minimax"));

    const [provider, key, deployment, model] = posts(fetchMock);
    expect(provider).toEqual([
      "providers",
      {
        name: "MiniMax CN",
        profile: "minimax",
        endpoints: {
          anthropic: "https://api.minimax.cn/anthropic",
          openai: "https://api.minimax.cn/v1",
        },
      },
    ]);
    const providerId = key[0].split("/")[1];
    expect(providerId).toMatch(/^gwprov_/);
    expect(key).toEqual([
      `providers/${providerId}/credentials`,
      { key: SECRET },
    ]);
    expect(deployment).toEqual([
      "deployments",
      {
        provider_id: providerId,
        upstream_model: "MiniMax-M3",
        kind: "chat",
        capabilities: { tools: false, thinking: false, vision: false },
        prices: {},
      },
    ]);
    expect(model[1]).toMatchObject({
      name: "minimax",
      targets: [{ priority: 0, weight: 1 }],
    });
    expect(model[1].targets[0].deployment_id).toMatch(/^gwdep_/);
    expect(states()).toEqual([
      "provider:done",
      "key:done",
      "deployment:done",
      "model:done",
    ]);
  });

  // None of the four writes is idempotent. A write that landed but whose
  // answer was lost is found in the gateway, not made a second time.
  it.each(["providers", "credentials", "deployments", "aliases"])(
    "probe: does not repeat a %s write whose answer was lost",
    async (path) => {
      const fetchMock = stubGatewayFetch();
      emptyGateway();
      let lose = true;
      vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
        const answer = await fetchMock(input, init);
        if (lose && init?.method === "POST" && input.endsWith(`/${path}`)) {
          lose = false;
          return Response.json(
            {
              type: "error",
              error: { type: "api_error", message: "connection reset" },
            },
            { status: 502 },
          );
        }
        return answer;
      });
      const { onDone } = renderSetup();
      await fill();
      await userEvent.click(screen.getByRole("button", { name: "Create" }));
      await waitFor(() => expect(onDone).toHaveBeenCalledWith("MiniMax-M3"));
      expect(posts(fetchMock).map(([p]) => p.split("/").at(-1))).toEqual([
        "providers",
        "credentials",
        "deployments",
        "aliases",
      ]);
    },
  );

  it("offers only vendors whose hosts are published", async () => {
    stubGatewayFetch();
    renderSetup();
    await screen.findByRole("option", { name: "MiniMax" });
    expect(
      screen.queryByRole("option", { name: /Any .* endpoint/ }),
    ).toBeNull();
  });

  it("stops at the first refusal, keeps what it made, and continues from there", async () => {
    let refuse = true;
    const fetchMock = stubGatewayFetch((method, rest) =>
      refuse && method === "POST" && rest === "deployments"
        ? Response.json(
            {
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "upstream_model contains whitespace",
              },
            },
            { status: 400 },
          )
        : undefined,
    );
    const { onDone } = renderSetup();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "upstream_model contains whitespace",
    );
    expect(states()).toEqual([
      "provider:done",
      "key:done",
      "deployment:failed",
      "model:pending",
    ]);
    expect(screen.getByLabelText("Vendor")).toBeDisabled();
    expect(screen.getByLabelText("API key")).toBeDisabled();

    refuse = false;
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("MiniMax-M3"));
    // The provider and its key were made once, not again.
    expect(posts(fetchMock).map(([path]) => path.split("/")[0])).toEqual([
      "providers",
      "providers",
      "deployments",
      "deployments",
      "aliases",
    ]);
  });

  it("probe: keeps no trace of the key once the gateway has it", async () => {
    stubGatewayFetch((method, rest) =>
      method === "POST" && rest === "aliases"
        ? Response.json(
            { type: "error", error: { type: "api_error", message: "down" } },
            { status: 500 },
          )
        : undefined,
    );
    const { client } = renderSetup();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByRole("alert");
    // The key step shows the tail the gateway rendered, and nothing more.
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(document.querySelector("[data-step=key]")?.textContent).toMatch(
      /••••cdef/,
    );
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain(
      SECRET,
    );
    expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain(
      SECRET,
    );
  });

  describe("from the empty-gateway callout", () => {
    function renderCallout() {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <NoModelsCallout onDone={vi.fn()} />
        </QueryClientProvider>,
      );
    }
    const open = async () =>
      userEvent.click(
        await screen.findByRole("button", { name: "Set up a model" }),
      );
    const cancel = () =>
      userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // The gateway takes a second provider of the same name, so starting over
    // would leave the first one and its key behind.
    it("resumes where it stopped after a close, without a second provider", async () => {
      let refuse = true;
      const fetchMock = stubGatewayFetch((method, rest) =>
        refuse && method === "POST" && rest === "deployments"
          ? Response.json(
              { type: "error", error: { type: "api_error", message: "down" } },
              { status: 500 },
            )
          : undefined,
      );
      emptyGateway();
      renderCallout();
      await open();
      await fill();
      await userEvent.click(screen.getByRole("button", { name: "Create" }));
      await screen.findByRole("alert");
      await cancel();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      refuse = false;
      await open();
      expect(states()).toEqual([
        "provider:done",
        "key:done",
        "deployment:failed",
        "model:pending",
      ]);
      await userEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(posts(fetchMock).map(([path]) => path)).toContain("aliases");
      expect(
        posts(fetchMock).filter(([path]) => path === "providers"),
      ).toHaveLength(1);
    });

    // A reload forgets what an earlier run made, and a gateway with no models
    // can still hold its provider; a second run would add another. So the
    // form is offered only before any provider exists.
    it("probe: offers no setup on a gateway that already has a provider", async () => {
      stubGatewayFetch();
      renderCallout();
      expect(
        await screen.findByRole("link", { name: "Providers" }),
      ).toHaveAttribute("href", "/providers");
      expect(
        screen.queryByRole("button", { name: "Set up a model" }),
      ).toBeNull();
    });

    it("probe: closing drops a key the gateway has not sealed", async () => {
      stubGatewayFetch();
      emptyGateway();
      renderCallout();
      await open();
      await fill();
      await cancel();
      await open();
      expect(screen.getByLabelText("API key")).toHaveValue("");
      expect(document.body.innerHTML).not.toContain(SECRET);
    });
  });
});
