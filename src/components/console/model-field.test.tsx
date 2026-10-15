import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelField, modelChosen, useModelChoices } from "./model-field";
import { AgentEditor, formFromConfig } from "./agent-editor";
import { stubGatewayFetch } from "../../../test/mock-platform/gateway-fetch";
import {
  gatewayFixtures,
  resetGateway,
} from "../../../test/mock-platform/gateway.mjs";
import type { GatewayAlias } from "@/lib/platform/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/agents",
  useSearchParams: () => new URLSearchParams(),
}));

// Minimal harness for base-ui's portal Select (models/page.test.tsx pattern):
// each item is an option button wired to onValueChange.
vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Ctx = React.createContext<(value: string) => void>(() => {});
  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (value: string) => void;
      children?: React.ReactNode;
    }) => React.createElement(Ctx.Provider, { value: onValueChange }, children),
    SelectTrigger: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) =>
      React.createElement(
        "span",
        { "data-model": props["data-model"] },
        children,
      ),
    SelectValue: ({ placeholder }: { placeholder?: string }) =>
      React.createElement("span", { "data-placeholder": placeholder }),
    SelectContent: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => {
      const choose = React.useContext(Ctx);
      return React.createElement(
        "button",
        { type: "button", role: "option", onClick: () => choose(value) },
        children,
      );
    },
  };
});

resetGateway();
const ALIASES = gatewayFixtures().aliases as GatewayAlias[];
const CHAT = ALIASES.filter((a) => a.kind === "chat").map((a) => a.name);

function Field({ initial = "", readOnly = false }) {
  const [value, setValue] = useState(initial);
  const choices = useModelChoices();
  return (
    <>
      <label htmlFor="model">Model</label>
      <ModelField
        id="model"
        value={value}
        onChange={setValue}
        choices={choices}
        readOnly={readOnly}
      />
      <output data-chosen={String(modelChosen(choices, value))} />
    </>
  );
}

function renderWith(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const options = () =>
  screen.getAllByRole("option").map((o) => o.textContent ?? "");
const chosen = () =>
  document.querySelector("output")?.getAttribute("data-chosen");
const shown = () =>
  document.querySelector("[data-model]")?.getAttribute("data-model");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModelField", () => {
  it("offers the gateway's chat models by name, without the catch-all", async () => {
    stubGatewayFetch((method, rest) =>
      method === "GET" && rest === "aliases"
        ? Response.json({
            data: [...ALIASES, { ...ALIASES[0], name: "*" }],
          })
        : undefined,
    );
    renderWith(<Field />);
    await waitFor(() => expect(options()).toEqual(CHAT));
  });

  it("shows a saved name the list lacks as empty, and waits for a choice", async () => {
    stubGatewayFetch();
    renderWith(<Field initial="claude-opus-4-2" />);
    await screen.findAllByRole("option");
    expect(shown()).toBe("");
    expect(chosen()).toBe("false");
    await userEvent.click(screen.getByRole("option", { name: CHAT[0] }));
    expect(shown()).toBe(CHAT[0]);
    expect(chosen()).toBe("true");
  });

  // An empty list has nothing to choose: the trigger says so, and the hint
  // under it links to Models (PR #224 review).
  it("probe: says the gateway has no chat models, and links to Models", async () => {
    stubGatewayFetch((method, rest) =>
      method === "GET" && rest === "aliases"
        ? Response.json({ data: [] })
        : undefined,
    );
    renderWith(<Field />);
    await waitFor(() =>
      expect(document.querySelector("[data-placeholder]")).toHaveAttribute(
        "data-placeholder",
        "The gateway has no chat models yet",
      ),
    );
    expect(
      screen.getByRole("link", { name: "Model Gateway → Models" }),
    ).toHaveAttribute("href", "/models");
  });

  // A slow gateway must not leave a window in which Save takes a name the
  // list would refuse (PR #224 review).
  it("probe: waits for the gateway's list before Save takes any name", async () => {
    stubGatewayFetch((method, rest) =>
      method === "GET" && rest === "aliases"
        ? (new Promise<Response>(() => {}) as unknown as Response)
        : undefined,
    );
    renderWith(<Field initial="claude-opus-4-2" />);
    expect(screen.getByLabelText("Model")).toBeDisabled();
    expect(chosen()).toBe("false");
  });

  // TanStack keeps the last list in `data` when a refetch fails; the field
  // falls back to the text box all the same (PR #224 review).
  it("probe: falls back to the text box when a refetch fails over a cached list", async () => {
    let reads = 0;
    stubGatewayFetch((method, rest) =>
      method === "GET" && rest === "aliases" && ++reads > 1
        ? Response.json(
            {
              type: "error",
              error: { type: "api_error", message: "gateway down" },
            },
            { status: 502 },
          )
        : undefined,
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Field initial="claude-opus-4-2" />
      </QueryClientProvider>,
    );
    await screen.findAllByRole("option");
    await client.refetchQueries({ queryKey: ["gateway", "aliases"] });
    await waitFor(() =>
      expect(screen.getByLabelText("Model")).toHaveValue("claude-opus-4-2"),
    );
    expect(chosen()).toBe("true");
    expect(screen.getByText(/gateway down/)).toBeInTheDocument();
  });

  it("shows the saved name as it is when read-only", async () => {
    stubGatewayFetch();
    renderWith(<Field initial="claude-opus-4-2" readOnly />);
    expect(screen.getByLabelText("Model")).toHaveValue("claude-opus-4-2");
  });

  it("probe: stays a text box on a console without a gateway", async () => {
    // What the BFF answers every path while MODEL_GATEWAY_BASE_URL is unset.
    const fetchMock = stubGatewayFetch(() =>
      Response.json(
        { type: "error", error: { type: "not_found_error", message: "" } },
        { status: 404 },
      ),
    );
    renderWith(<Field initial="claude-opus-4-2" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(chosen()).toBe("true"));
    expect(screen.getByLabelText("Model")).toHaveValue("claude-opus-4-2");
    expect(screen.queryByText(/Could not read/)).toBeNull();
  });

  it("stays a text box when the read fails, and says why", async () => {
    stubGatewayFetch(() =>
      Response.json(
        { type: "error", error: { type: "api_error", message: "down" } },
        { status: 500 },
      ),
    );
    renderWith(<Field initial="claude-opus-4-2" />);
    expect(await screen.findByText(/Could not read/)).toHaveTextContent("down");
    expect(screen.getByLabelText("Model")).toHaveValue("claude-opus-4-2");
    expect(chosen()).toBe("true");
  });
});

describe("the agent editor's model", () => {
  it("sends nothing until a listed model is chosen, and says why on the field", async () => {
    const fetchMock = stubGatewayFetch((method, rest) => {
      if (!rest.startsWith("/api/platform/")) return undefined;
      return method === "POST"
        ? Response.json({ id: "agent_1", version: 2 })
        : Response.json({ data: [] });
    });
    renderWith(
      <AgentEditor
        mode="edit"
        agentId="agent_1"
        version={1}
        initial={formFromConfig({
          name: "Deep researcher",
          model: { id: "claude-opus-4-2" },
        })}
      />,
    );
    const save = screen.getByRole("button", { name: "Save changes" });
    const minimax = await screen.findByRole("option", { name: "minimax-m3" });
    const sent = () =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    // Enabled, as for every field the platform requires; it sends nothing.
    await userEvent.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "choose one of the gateway's models",
    );
    expect(sent()).toHaveLength(0);
    await userEvent.click(minimax);
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(save);
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(JSON.parse(String(sent()[0][1]!.body)).model).toEqual({
      id: "minimax-m3",
    });
  });
});
