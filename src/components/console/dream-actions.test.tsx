import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DreamActions } from "./dream-actions";
import { dreams } from "../../../test/mock-platform/fixtures.mjs";
import type { Dream } from "@/lib/platform/types";

function renderActions(index: number) {
  const dream = dreams[index] as Dream;
  const response = structuredClone(dream);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (!String(input).includes("/dreams/")) {
      return new Response(null, { status: 404 });
    }
    if (response.status === "pending") response.status = "canceled";
    else response.archived_at = "2026-08-03T00:00:00Z";
    return new Response(JSON.stringify(response), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DreamActions dream={dream} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DreamActions", () => {
  it("confirms cancellation of an active dream", async () => {
    const fetchMock = renderActions(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel dream" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep running" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel dream" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel dream",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `/dreams/${dreams[1].id}/cancel`,
    );
  });

  it("archives a terminal dream", async () => {
    const fetchMock = renderActions(0);
    expect(screen.queryByRole("button", { name: "Cancel dream" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive dream" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `/dreams/${dreams[0].id}/archive`,
    );
  });
});
