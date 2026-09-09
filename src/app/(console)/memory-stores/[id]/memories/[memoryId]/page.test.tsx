import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import MemoryDetailPage from "./page";
import {
  memories,
  memoryStores,
} from "../../../../../../../test/mock-platform/fixtures.mjs";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const params = {
  status: "fulfilled",
  value: { id: memoryStores[0].id, memoryId: memories[0].id },
  then: (done: (value: { id: string; memoryId: string }) => void) =>
    done({ id: memoryStores[0].id, memoryId: memories[0].id }),
} as unknown as Promise<{ id: string; memoryId: string }>;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shows full content and deletes with the loaded digest", async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "DELETE")
      return new Response(
        JSON.stringify({ id: memories[0].id, type: "memory_deleted" }),
        {
          status: 200,
        },
      );
    return new Response(
      JSON.stringify(
        String(input).includes("/memories/") ? memories[0] : memoryStores[0],
      ),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <MemoryDetailPage params={params} />
      </Suspense>
    </QueryClientProvider>,
  );

  expect(
    await screen.findByText("# Project brief", { exact: false }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(push).toHaveBeenCalledWith(
    `/memory-stores/${memoryStores[0].id}/memories/${memories[0].id}/edit`,
  );
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete memory" }));
  await waitFor(() =>
    expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(
      true,
    ),
  );
  expect(
    String(fetch.mock.calls.find(([, init]) => init?.method === "DELETE")?.[0]),
  ).toContain(`expected_content_sha256=${memories[0].content_sha256}`);
});
