import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryEditor } from "./memory-editor";
import type { Memory } from "@/lib/platform/types";

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const memory: Memory = {
  id: "mem_1",
  type: "memory",
  memory_store_id: "memstore_1",
  path: "/brief.md",
  content: "Draft",
  content_size_bytes: 5,
  content_sha256: "old-digest",
  memory_version_id: "memver_1",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("updates full content with the loaded digest as its precondition", async () => {
  const fetchMock = vi.fn<
    (input: string, init?: RequestInit) => Promise<Response>
  >(
    async () =>
      new Response(JSON.stringify({ ...memory, content: "Final" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryEditor storeId="memstore_1" memory={memory} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Content"), {
    target: { value: "Final" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save memory" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock.mock.calls[0][0]).toBe(
    "/api/platform/v1/memory_stores/memstore_1/memories/mem_1?view=full",
  );
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
    path: "/brief.md",
    content: "Final",
    precondition: {
      type: "content_sha256",
      content_sha256: "old-digest",
    },
  });
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(
      "/memory-stores/memstore_1/memories/mem_1",
    ),
  );
});
