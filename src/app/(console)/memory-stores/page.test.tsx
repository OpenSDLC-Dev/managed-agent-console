import { useTestSearchParams } from "../../../../test/search-params";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MemoryStoresPage from "./page";
import { memoryStores } from "../../../../test/mock-platform/fixtures.mjs";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => useTestSearchParams(),
  useRouter: () => ({ push }),
}));
vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Context = React.createContext<(value: string) => void>(() => {});
  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) =>
      React.createElement(Context.Provider, { value: onValueChange }, children),
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
      const change = React.useContext(Context);
      return React.createElement(
        "button",
        { onClick: () => change(value) },
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
    if (init?.method === "POST")
      return new Response(
        JSON.stringify({
          ...memoryStores[0],
          archived_at: "2026-09-08T00:00:00Z",
        }),
        { status: 200 },
      );
    if (String(input).includes("/memories?"))
      return new Response(JSON.stringify({ data: [], next_page: null }));
    if (String(input).endsWith("/" + memoryStores[0].id))
      return new Response(JSON.stringify(memoryStores[0]));
    return new Response(
      JSON.stringify({ data: memoryStores, next_page: "cur_2" }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryStoresPage />
    </QueryClientProvider>,
  );
  return fetch;
}

describe("MemoryStoresPage", () => {
  it("renders stores and drives create, filtering, paging and row actions", async () => {
    const fetch = setup();
    expect(await screen.findByText("Project notes")).toBeInTheDocument();
    expect(screen.getByText("Archived notes")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Create memory store" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("Project notes"));
    expect(new URLSearchParams(location.search).get("store")).toBe(
      memoryStores[0].id,
    );
    expect(
      await screen.findByRole("region", { name: "Memory store details" }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Close details" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Include archived" }),
    );
    await waitFor(() =>
      expect(String(fetch.mock.calls.at(-1)?.[0])).toContain(
        "include_archived=true",
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(String(fetch.mock.calls.at(-1)?.[0])).toContain("page="),
    );

    await userEvent.click(
      screen.getAllByRole("button", { name: "More actions" })[0],
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Archive memory store" }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, init]) =>
            init?.method === "POST" && String(url).endsWith("/archive"),
        ),
      ).toBe(true),
    );
  });
});
