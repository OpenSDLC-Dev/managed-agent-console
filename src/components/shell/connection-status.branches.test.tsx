import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionStatus } from "./connection-status";

function renderWidget() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConnectionStatus />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ConnectionStatus (remaining branches)", () => {
  it("shows the checking state while the probe is in flight", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderWidget();
    expect(screen.getByText("Checking platform…")).toBeDefined();
    expect(
      screen.getByTestId("connection-dot").getAttribute("data-state"),
    ).toBe("checking");
  });

  it("probes the agents list through the BFF", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderWidget();
    await waitFor(() =>
      expect(
        screen.getByTestId("connection-dot").getAttribute("data-state"),
      ).toBe("up"),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/platform/v1/agents?limit=1");
  });

  it("reports the console server unreachable when fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText("Platform unreachable")).toBeDefined(),
    );
    expect(screen.getByText("console server unreachable")).toBeDefined();
    expect(screen.queryByText(/request-id/)).toBeNull();
  });

  it("falls back to the HTTP status when the error envelope has no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({}), {
            status: 500,
            headers: { "request-id": "req_fallback" },
          }),
      ),
    );
    renderWidget();
    await waitFor(() => expect(screen.getByText("HTTP 500")).toBeDefined());
    expect(screen.getByText(/req_fallback/)).toBeDefined();
  });

  it("falls back to the HTTP status when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad gateway", { status: 502 })),
    );
    renderWidget();
    await waitFor(() => expect(screen.getByText("HTTP 502")).toBeDefined());
    expect(
      screen.getByTestId("connection-dot").getAttribute("data-state"),
    ).toBe("down");
    expect(screen.queryByText(/request-id/)).toBeNull();
  });
});
