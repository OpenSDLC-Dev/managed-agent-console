import { withTestSession } from "@/../test/session-fixture";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { gatewayFixtures } from "@/../test/mock-platform/gateway.mjs";
import NewAgentPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/agents/new",
  useSearchParams: () => new URLSearchParams(),
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
    SelectTrigger: (props: {
      children?: React.ReactNode;
      "aria-label"?: string;
      id?: string;
      "data-model"?: string;
    }) =>
      React.createElement(
        "button",
        {
          type: "button",
          id: props.id,
          "aria-label": props["aria-label"],
          "data-model": props["data-model"],
        },
        props.children,
      ),
    SelectValue: () => {
      const ctx = React.useContext(Ctx);
      return React.createElement("span", null, ctx.value);
    },
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
        { type: "button", onClick: () => ctx.onValueChange(value) },
        children,
      );
    },
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderPage(model?: string | string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      withTestSession(
        async (input: RequestInfo | URL) =>
          new Response(
            JSON.stringify({
              data:
                String(input).endsWith("/aliases") && model
                  ? [{ ...gatewayFixtures().aliases[0], name: "team/model+A" }]
                  : [],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    ),
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      {await NewAgentPage({ searchParams: Promise.resolve({ model }) })}
    </QueryClientProvider>,
  );
}

describe("NewAgentPage", () => {
  it("renders the header and a create-mode editor seeded with defaults", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Create agent" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Name")).toHaveValue("Untitled agent");
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tools" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Create agent" })).toBeEnabled();
  });

  it("fills an editable draft from the directory templates, then restores the blank starter", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("radio", { name: "Template" }));
    await user.click(
      screen.getByRole("button", { name: /Structured extractor/ }),
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Structured extractor");
    const point = screen.getByRole("button", { name: /Starting point/ });
    expect(point).toHaveAttribute("aria-expanded", "false");
    await user.click(point);
    await user.click(screen.getByRole("button", { name: "Blank agent" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Untitled agent");
  });

  it("carries the requested gateway alias through template selection without a write", async () => {
    const user = userEvent.setup();
    await renderPage(["team/model+A", "unused"]);
    await waitFor(() =>
      expect(screen.getByLabelText("Model")).toHaveAttribute(
        "data-model",
        "team/model+A",
      ),
    );
    await user.click(screen.getByRole("radio", { name: "Template" }));
    await user.click(screen.getByRole("button", { name: /Deep researcher/ }));
    expect(screen.getByLabelText("Model")).toHaveAttribute(
      "data-model",
      "team/model+A",
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(
          ([, options]) => (options?.method ?? "GET") === "GET",
        ),
    ).toBe(true);
  });
});
