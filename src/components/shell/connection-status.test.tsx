import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  SIGNED_OUT_HEADER,
  hasBouncedToLogin,
  resetSignedOutBounceForTests,
} from "@/lib/identity/signed-out";
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

beforeEach(() => {
  resetSignedOutBounceForTests();
});

afterEach(() => {
  resetSignedOutBounceForTests();
});

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
    // A 401 with identity off is a bad management key, and no sign-in fixes
    // that — this poll must not send the operator to a login page over it.
    expect(hasBouncedToLogin()).toBe(false);
  });

  // On an idle page this 30-second poll is the only BFF consumer still running,
  // so if it read a sign-out as an outage the operator would sit in front of
  // "Platform unreachable" with a live SSE trace beside it and nothing left to
  // notice (found in review, PR #95).
  it("probe: sends the operator to sign in when the console session has ended", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ type: "error" }), {
            status: 401,
            headers: { [SIGNED_OUT_HEADER]: "1" },
          }),
      ),
    );
    renderWidget();
    await waitFor(() => expect(hasBouncedToLogin()).toBe(true));
  });
});
