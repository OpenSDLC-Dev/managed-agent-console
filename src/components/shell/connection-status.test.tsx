import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  cleanup();
  vi.unstubAllGlobals();
  resetSignedOutBounceForTests();
});

describe("ConnectionStatus", () => {
  it("probe: a platform read refusal is not an outage or a sign-out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            type: "error",
            error: {
              type: "permission_error",
              message: "this route requires the developer role",
            },
          },
          { status: 403, headers: { "request-id": "req_read_denied" } },
        ),
      ),
    );
    renderWidget();
    await waitFor(() =>
      expect(
        screen.getByTestId("connection-dot").getAttribute("data-state"),
      ).toBe("denied"),
    );
    expect(screen.getByText("Platform Access Denied")).toBeDefined();
    expect(
      screen.getByText("this route requires the developer role"),
    ).toBeDefined();
    expect(screen.getByText(/req_read_denied/)).toBeDefined();
    expect(screen.queryByText("Platform Unreachable")).toBeNull();
    expect(hasBouncedToLogin()).toBe(false);
  });

  it.each([
    "<html>Forbidden</html>",
    JSON.stringify({
      type: "error",
      error: { type: "api_error", message: "Proxy refused the request" },
    }),
  ])(
    "probe: an intermediary's 403 is not an account access verdict (%#)",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(body, { status: 403 })),
      );
      renderWidget();
      await waitFor(() =>
        expect(
          screen.getByTestId("connection-dot").getAttribute("data-state"),
        ).toBe("down"),
      );
      expect(screen.queryByText("Platform Access Denied")).toBeNull();
      expect(hasBouncedToLogin()).toBe(false);
    },
  );

  it("shows connected when the probe succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }))),
    );
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText("Platform Connected")).toBeDefined(),
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
      expect(screen.getByText("Platform Unreachable")).toBeDefined(),
    );
    expect(screen.getByText("invalid x-api-key")).toBeDefined();
    expect(screen.getByText(/req_test1/)).toBeDefined();
    // A 401 with identity off is a bad management key, and no sign-in fixes
    // that — this poll must not send the operator to a login page over it.
    expect(hasBouncedToLogin()).toBe(false);
  });

  // On an idle page this 30-second poll is the only BFF consumer still running,
  // so if it read a sign-out as an outage the operator would sit in front of
  // "Platform Unreachable" with a live SSE trace beside it and nothing left to
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
