import { useTestSearchParams } from "../../../../../test/search-params";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import MemoryStoreDetailPage from "./page";
import {
  memories,
  memoryStores,
  memoryVersions,
} from "../../../../../test/mock-platform/fixtures.mjs";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => useTestSearchParams(),
}));

function params(id: string): Promise<{ id: string }> {
  const value = { id };
  return {
    status: "fulfilled",
    value,
    then: (done: (value: { id: string }) => void) => done(value),
  } as unknown as Promise<{ id: string }>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup() {
  const store = structuredClone(memoryStores[0]);
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST")
      return new Response(
        JSON.stringify({ ...store, archived_at: "2026-09-08T00:00:00Z" }),
        { status: 200 },
      );
    if (url.includes("/memories?"))
      return new Response(
        JSON.stringify({ data: memories, next_page: "cur_mem" }),
        { status: 200 },
      );
    if (url.includes("/memory_versions?"))
      return new Response(
        JSON.stringify({ data: memoryVersions, next_page: "cur_ver" }),
        { status: 200 },
      );
    return new Response(JSON.stringify(store), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <MemoryStoreDetailPage params={params(store.id)} />
      </Suspense>
    </QueryClientProvider>,
  );
  return { fetch, store };
}

describe("MemoryStoreDetailPage", () => {
  it("renders the tree and history and drives navigation and archive", async () => {
    const { fetch, store } = setup();
    expect(
      await screen.findByRole("heading", { name: "Project notes" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByText("Store details and version history"),
    );
    expect(screen.getAllByText("/brief.md").length).toBeGreaterThan(0);
    expect(screen.getAllByText("modified").length).toBeGreaterThan(0);
    expect(screen.getByText(/"owner": "research"/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add memory" }));
    expect(push).toHaveBeenCalledWith(
      `/memory-stores/${store.id}/memories/new`,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(push).toHaveBeenCalledWith(`/memory-stores/${store.id}/edit`);

    fireEvent.change(screen.getByLabelText("Path prefix"), {
      target: { value: "/decisions/" },
    });
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) =>
          String(url).includes("path_prefix=%2Fdecisions%2F"),
        ),
      ).toBe(true),
    );

    const rows = document.querySelectorAll("tbody tr");
    await userEvent.click([...rows].at(-1)!);
    expect(push).toHaveBeenCalledWith(
      expect.stringContaining(`/memory-stores/${store.id}/versions/`),
    );

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
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
