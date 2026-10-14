import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ModelsPage from "./page";
import { stubGatewayFetch } from "../../../../test/mock-platform/gateway-fetch";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

// Minimal harness for base-ui's portal Select (status-filter.test.tsx pattern).
vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  interface CtxShape {
    value: string;
    onValueChange: (value: string) => void;
  }
  const Ctx = React.createContext<CtxShape>({
    value: "",
    onValueChange: () => {},
  });
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: CtxShape & { children?: React.ReactNode }) =>
      React.createElement(
        Ctx.Provider,
        { value: { value, onValueChange } },
        children,
      ),
    SelectTrigger: (props: { children?: React.ReactNode }) =>
      React.createElement("span", null, props.children),
    SelectValue: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("span", null, children),
    SelectContent: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(
        "button",
        {
          type: "button",
          "aria-label": `Kind ${value}`,
          onClick: () => ctx.onValueChange(value),
        },
        children,
      );
    },
  };
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ModelsPage />
    </QueryClientProvider>,
  );
}

const row = async (name: string) =>
  (await screen.findByText(name, { selector: "td span" })).closest("tr")!;

const names = () =>
  [...document.querySelectorAll("tbody tr")].map(
    (tr) => tr.querySelector("td span span")?.textContent,
  );

beforeEach(() => window.history.replaceState({}, "", "/models"));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushSpy.mockReset();
});

describe("ModelsPage", () => {
  it("lists each model with its display name, kind and routing", async () => {
    stubGatewayFetch();
    renderPage();
    const agent = await row("agent-default");
    expect(within(agent).getByText("Agent default")).toBeInTheDocument();
    expect(agent.querySelector("[data-kind]")).toHaveAttribute(
      "data-kind",
      "chat",
    );
    await waitFor(() =>
      expect(within(agent).getByText("deepseek-v4-flash")).toBeInTheDocument(),
    );
    expect(agent.querySelector("[data-tiers]")).toHaveAttribute(
      "data-tiers",
      "2",
    );
    expect(names()).toHaveLength(5);
  });

  it("filters by kind", async () => {
    stubGatewayFetch();
    renderPage();
    await row("agent-default");
    await userEvent.click(screen.getByRole("button", { name: "Kind rerank" }));
    expect(names()).toEqual(["kb-rerank"]);
    await userEvent.click(screen.getByRole("button", { name: "Kind all" }));
    expect(names()).toHaveLength(5);
  });

  it("opens the inspector from a row", async () => {
    stubGatewayFetch();
    renderPage();
    await userEvent.click(await row("kb-embed"));
    expect(pushSpy).toHaveBeenCalledWith("/models?model=kb-embed", {
      scroll: false,
    });
  });

  it("inspects a model's routing, and closes once it is deleted", async () => {
    window.history.replaceState({}, "", "/models?model=agent-default");
    const fetchMock = stubGatewayFetch();
    renderPage();
    const panel = await screen.findByRole("region", { name: "Model details" });
    await waitFor(() =>
      expect(
        [...panel.querySelectorAll("[data-priority]")].map((t) =>
          t.getAttribute("data-priority"),
        ),
      ).toEqual(["0", "1"]),
    );
    expect(within(panel).getByText("Fallback 1")).toBeInTheDocument();

    await userEvent.click(
      within(panel).getByRole("button", { name: "Delete" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete model" }));
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/models", { scroll: false }),
    );
    const deleted = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "DELETE",
    );
    expect(String(deleted?.[0])).toBe(
      "/api/gateway/admin/v1/aliases/agent-default",
    );
  });

  it("says so when the inspected model does not exist", async () => {
    window.history.replaceState({}, "", "/models?model=gone");
    stubGatewayFetch();
    renderPage();
    const panel = await screen.findByRole("region", { name: "Model details" });
    expect(await within(panel).findByText("No such model")).toBeInTheDocument();
  });

  it("offers the first-run setup while the gateway has no models", async () => {
    stubGatewayFetch((method, rest) =>
      method === "GET" && rest === "aliases"
        ? Response.json({ data: [] })
        : undefined,
    );
    renderPage();
    const callout = await screen.findByTestId("no-models");
    await userEvent.click(
      within(callout).getByRole("button", { name: "Set up a model" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Set up a model" }),
    ).toBeInTheDocument();
  });

  it("offers no setup once a model exists", async () => {
    stubGatewayFetch();
    renderPage();
    await row("agent-default");
    expect(screen.queryByTestId("no-models")).toBeNull();
  });

  it("probe: stands in for the page on a console that runs without a gateway", async () => {
    // What the BFF answers every path while MODEL_GATEWAY_BASE_URL is unset.
    stubGatewayFetch(() =>
      Response.json(
        { type: "error", error: { type: "not_found_error", message: "x" } },
        { status: 404 },
      ),
    );
    renderPage();
    expect(await screen.findByTestId("unavailable-surface")).toHaveAttribute(
      "data-surface",
      "models",
    );
  });
});
