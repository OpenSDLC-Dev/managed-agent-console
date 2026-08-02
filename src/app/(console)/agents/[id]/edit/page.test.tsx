import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import EditAgentPage from "./page";
import type { Agent } from "@/lib/platform/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/agents/agt_1/edit",
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
    }) =>
      React.createElement(
        "button",
        { type: "button", "aria-label": props["aria-label"] },
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

const agent: Agent = {
  id: "agt_1",
  type: "agent",
  name: "Support bot",
  version: 3,
  model: { id: "claude-sonnet-4-8" },
  system: "Be nice.",
  description: "Answers tickets",
  tools: [],
  mcp_servers: [],
  skills: [],
  multiagent: null,
  metadata: {},
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  archived_at: null,
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Pre-resolved params thenable: React's `use` reads .status/.value directly. */
function asParams(id: string): Promise<{ id: string }> {
  const value = { id };
  return {
    status: "fulfilled",
    value,
    then: (onFulfilled: (v: { id: string }) => void) => onFulfilled(value),
  } as unknown as Promise<{ id: string }>;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <EditAgentPage params={asParams("agt_1")} />
      </Suspense>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("EditAgentPage", () => {
  it("shows the detail skeleton while the agent loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderPage();
    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull(),
    );
  });

  it("surfaces the platform error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            type: "error",
            error: { type: "not_found_error", message: "agent not found" },
          },
          404,
        ),
      ),
    );
    renderPage();
    expect(await screen.findByText("agent not found")).toBeInTheDocument();
  });

  it("renders the edit-mode editor seeded from the loaded agent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://console.test");
        if (url.pathname === "/api/platform/v1/agents/agt_1")
          return json(agent);
        if (url.pathname === "/api/platform/v1/skills")
          return json({ data: [] });
        throw new Error(`unmatched fetch: ${url.pathname}`);
      }),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Edit Support bot" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Editing v3 — saving creates v4."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Support bot");
    expect(screen.getByLabelText("Model")).toHaveValue("claude-sonnet-4-8");
    expect(screen.getByLabelText("System prompt")).toHaveValue("Be nice.");
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
  });
});
