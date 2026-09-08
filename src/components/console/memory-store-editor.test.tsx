import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  MemoryStoreEditor,
  memoryStoreBody,
  memoryStoreForm,
  newMemoryStoreForm,
} from "./memory-store-editor";
import type { MemoryStore } from "@/lib/platform/types";

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const store: MemoryStore = {
  id: "memstore_1",
  type: "memory_store",
  name: "Notes",
  description: "Shared",
  metadata: { owner: "console", remove: "yes" },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  archived_at: null,
};

function renderEditor(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("memory store editor", () => {
  it("maps forms and uses null tombstones for removed metadata", () => {
    expect(newMemoryStoreForm()).toEqual({
      name: "",
      description: "",
      metadata: "{}",
    });
    expect(memoryStoreForm(store)).toMatchObject({ name: "Notes" });
    expect(
      memoryStoreBody(
        { name: "Notes", description: "Updated", metadata: '{"owner":"api"}' },
        store.metadata,
      ),
    ).toEqual({
      name: "Notes",
      description: "Updated",
      metadata: { owner: "api", remove: null },
    });
  });

  it("keeps invalid JSON local and sends a valid edit to the wire", async () => {
    const fetchMock = vi.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(JSON.stringify({ ...store, description: "Updated" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderEditor(
      <MemoryStoreEditor
        mode="edit"
        storeId={store.id}
        initial={memoryStoreForm(store)}
      />,
    );

    fireEvent.change(screen.getByLabelText("Metadata (JSON object)"), {
      target: { value: "{" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Updated" },
    });
    fireEvent.change(screen.getByLabelText("Metadata (JSON object)"), {
      target: { value: '{"owner":"api"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/platform/v1/memory_stores/memstore_1",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      name: "Notes",
      description: "Updated",
      metadata: { owner: "api", remove: null },
    });
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/memory-stores/memstore_1"),
    );
  });
});
