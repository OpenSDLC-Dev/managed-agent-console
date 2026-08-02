import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("ConnectionStatus", () => {
  it("shows connected when the probe succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }))),
    );
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText("Platform connected")).toBeDefined(),
    );
  });

  it("surfaces the platform error envelope and request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: {
                type: "authentication_error",
                message: "invalid x-api-key",
              },
            }),
            { status: 401, headers: { "request-id": "req_test1" } },
          ),
      ),
    );
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText("Platform unreachable")).toBeDefined(),
    );
    expect(screen.getByText("invalid x-api-key")).toBeDefined();
    expect(screen.getByText(/req_test1/)).toBeDefined();
  });
});
