import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderPage() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
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
      <NewAgentPage />
    </QueryClientProvider>,
  );
}

describe("NewAgentPage", () => {
  it("renders the header and a create-mode editor seeded with defaults", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Create agent" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Configure a new autonomous agent."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Model")).toHaveValue("claude-sonnet-4-8");
    expect(
      screen.getByRole("button", { name: "Create agent" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No skills on the platform yet."),
    ).toBeInTheDocument();
  });

  it("seeds the editor from a starter template and back to blank", async () => {
    const user = userEvent.setup();
    renderPage();

    const runnerCard = screen.getByRole("button", { name: /Code task runner/ });
    await user.click(runnerCard);
    expect(runnerCard).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Name")).toHaveValue("Code task runner");
    expect(
      (screen.getByLabelText("System prompt") as HTMLTextAreaElement).value,
    ).toContain("careful engineer");

    await user.click(screen.getByRole("button", { name: /Web researcher/ }));
    expect(screen.getByLabelText("Name")).toHaveValue("Web researcher");
    await user.click(screen.getByRole("button", { name: /Tool permissions/ }));
    expect(
      screen.getByRole("checkbox", { name: "bash enabled" }),
    ).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /Blank/ }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /Tool permissions/ }));
    expect(
      screen.getByRole("checkbox", { name: "bash enabled" }),
    ).toBeChecked();
  });
});
