import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import MemoryVersionPage from "./page";
import {
  memoryStores,
  memoryVersions,
} from "../../../../../../../test/mock-platform/fixtures.mjs";

const version = memoryVersions[0];
const params = {
  status: "fulfilled",
  value: { id: memoryStores[0].id, versionId: version.id },
  then: (done: (value: { id: string; versionId: string }) => void) =>
    done({ id: memoryStores[0].id, versionId: version.id }),
} as unknown as Promise<{ id: string; versionId: string }>;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("renders attribution and permanently redacts an old version", async () => {
  const old = {
    ...version,
    created_by: { type: "api_actor", api_key_id: "apikey_1" },
  };
  const redacted = {
    ...old,
    path: null,
    content: null,
    content_size_bytes: null,
    content_sha256: null,
    redacted_at: "2026-09-08T00:00:00Z",
    redacted_by: { type: "user_actor", user_id: "user_1" },
  };
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(init?.method === "POST" ? redacted : old), {
        status: 200,
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <MemoryVersionPage params={params} />
      </Suspense>
    </QueryClientProvider>,
  );

  expect(await screen.findByText("API key · apikey_1")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Redact" }));
  await userEvent.click(screen.getByRole("button", { name: "Redact version" }));
  await waitFor(() => expect(screen.getByText("redacted")).toBeVisible());
  expect(
    screen.getByText((_, element) =>
      Boolean(
        element?.tagName === "DD" &&
        element.textContent?.includes("user · user_1"),
      ),
    ),
  ).toBeVisible();
  expect(screen.getByTestId("memory-version-content")).toHaveTextContent(
    "Redacted",
  );
});
