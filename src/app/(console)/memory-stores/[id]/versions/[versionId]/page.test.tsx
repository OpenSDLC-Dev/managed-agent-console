import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import MemoryVersionPage from "./page";
import {
  memories,
  memoryStores,
  memoryVersions,
} from "../../../../../../../test/mock-platform/fixtures.mjs";

const version = memoryVersions[0];

function paramsFor(versionId: string) {
  const value = { id: memoryStores[0].id, versionId };
  return {
    status: "fulfilled",
    value,
    then: (done: (resolved: { id: string; versionId: string }) => void) =>
      done(value),
  } as unknown as Promise<typeof value>;
}

function renderPage(fetch: ReturnType<typeof vi.fn>, versionId: string) {
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <MemoryVersionPage params={paramsFor(versionId)} />
      </Suspense>
    </QueryClientProvider>,
  );
}

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
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body =
      init?.method === "POST"
        ? redacted
        : url.includes("/memory_versions/")
          ? old
          : url.includes("/memories/")
            ? { ...memories[0], memory_version_id: "memver_newer" }
            : memoryStores[0];
    return new Response(JSON.stringify(body), { status: 200 });
  });
  renderPage(fetch, version.id);

  expect(await screen.findByText("API key · apikey_1")).toBeVisible();
  await userEvent.click(await screen.findByRole("button", { name: "Redact" }));
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

it("does not offer redaction for the live memory head", async () => {
  const current = memoryVersions[0];
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/memory_versions/")
      ? current
      : url.includes("/memories/")
        ? memories[0]
        : memoryStores[0];
    return new Response(JSON.stringify(body), { status: 200 });
  });
  renderPage(fetch, current.id);

  expect(await screen.findByText("current · cannot redact")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Redact" })).toBeNull();
});
