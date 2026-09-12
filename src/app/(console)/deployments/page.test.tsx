import { useTestSearchParams } from "../../../../test/search-params";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DeploymentsPage from "./page";
import {
  deployments,
  agents,
} from "../../../../test/mock-platform/fixtures.mjs";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => useTestSearchParams(),
  useRouter: () => ({ push }),
}));
vi.mock("@/components/console/deployment-inspector", () => ({
  DeploymentInspector: ({
    id,
    onClose,
  }: {
    id: string;
    onClose: () => void;
  }) => (
    <div data-testid="deployment-inspector" data-id={id}>
      <button onClick={onClose}>Close details</button>
    </div>
  ),
}));
vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Context = React.createContext<{
    onValueChange: (value: string) => void;
  }>({
    onValueChange: vi.fn<(value: string) => void>(),
  });
  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) =>
      React.createElement(
        Context.Provider,
        { value: { onValueChange } },
        children,
      ),
    SelectTrigger: ({ children, ...props }: React.ComponentProps<"button">) =>
      React.createElement("div", props, children),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const context = React.useContext(Context);
      return React.createElement(
        "button",
        { onClick: () => context.onValueChange(value) },
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

function setup() {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/v1/agents"))
      return new Response(JSON.stringify({ data: agents, next_page: null }), {
        status: 200,
      });
    if (init?.method === "POST") {
      const id = String(input).split("/").at(-2);
      const row =
        deployments.find((candidate) => candidate.id === id) ?? deployments[0];
      return new Response(
        JSON.stringify({ ...row, archived_at: "2026-09-01T00:00:00Z" }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({ data: deployments, next_page: "cur_2" }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DeploymentsPage />
    </QueryClientProvider>,
  );
  return fetch;
}

vi.mock("@/components/console/deployment-editor", () => ({
  newDeploymentForm: () => ({}),
  DeploymentEditor: ({ onCancel }: { onCancel: () => void }) => (
    <button onClick={onCancel}>Cancel</button>
  ),
}));

describe("DeploymentsPage", () => {
  it("renders schedules and drives navigation, filtering, paging and archive", async () => {
    const fetch = setup();
    expect(
      await screen.findByText("Weekly research digest"),
    ).toBeInTheDocument();
    expect(screen.getByText("0 9 * * 1")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Create deployment" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("Weekly research digest"));
    expect(screen.getByTestId("deployment-inspector")).toHaveAttribute(
      "data-id",
      deployments[0].id,
    );
    expect(new URL(window.location.href).searchParams.get("deployment")).toBe(
      deployments[0].id,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Close details" }),
    );
    expect(
      screen.queryByTestId("deployment-inspector"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Paused" }));
    await waitFor(() =>
      expect(String(fetch.mock.calls.at(-1)?.[0])).toContain("status=paused"),
    );
    expect(String(fetch.mock.calls.at(-1)?.[0])).not.toContain(
      "include_archived",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Include archived" }),
    );
    await waitFor(() =>
      expect(String(fetch.mock.calls.at(-1)?.[0])).toContain(
        "include_archived=true",
      ),
    );
    expect(String(fetch.mock.calls.at(-1)?.[0])).not.toContain("status=");

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(String(fetch.mock.calls.at(-1)?.[0])).toContain("page="),
    );

    await userEvent.click(
      screen.getAllByRole("button", { name: "More actions" })[0],
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Archive deployment" }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, init]) =>
            init?.method === "POST" && String(url).endsWith("/archive"),
        ),
      ).toBe(true),
    );
  }, 10_000);
});
