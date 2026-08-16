import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetSignedOutBounceForTests } from "@/lib/identity/signed-out";
import { SidebarFooter } from "./sidebar-footer";

/**
 * Both blocks poll on mount, so both routes are answered: the console session
 * behind `SignedInAs`, and the platform probe behind `ConnectionStatus`. The
 * session status is what decides which deployment this is.
 */
const serve = (session: { body: unknown; status: number }) =>
  vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("/api/auth/session")
      ? new Response(JSON.stringify(session.body), { status: session.status })
      : new Response(JSON.stringify({ data: [] })),
  );

function renderFooter() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SidebarFooter />
    </QueryClientProvider>,
  );
}

/**
 * jsdom computes no Tailwind, so the rule is counted as the class token that
 * draws it — `[class~=]` matches the whole token, not a prefix of one.
 */
const rules = (container: HTMLElement) =>
  container.querySelectorAll('[class~="border-t"]');

beforeEach(() => {
  resetSignedOutBounceForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSignedOutBounceForTests();
});

describe("SidebarFooter", () => {
  // The defect this group exists to make impossible (#107): the rule was on
  // each block, so a deployment with identity drew two of them and a
  // password-gated one drew one. Only the configuration nobody could shoot
  // until #99 showed it.
  it("draws one rule for the group where identity is configured, not one per block", async () => {
    vi.stubGlobal(
      "fetch",
      serve({
        body: { signed_in: true, name: "Stub Operator", email: "op@x.test" },
        status: 200,
      }),
    );
    const { container } = renderFooter();
    await screen.findByText("Stub Operator");
    await screen.findByText("Platform connected");

    expect(rules(container)).toHaveLength(1);
    // And it is the group's, not the first block's: it wraps both of them.
    const rule = rules(container)[0];
    expect(rule.contains(screen.getByTestId("signed-in-as"))).toBe(true);
    expect(rule.contains(screen.getByTestId("connection-dot"))).toBe(true);
  });

  it("draws that same one rule on a deployment without identity", async () => {
    vi.stubGlobal("fetch", serve({ body: { signed_in: false }, status: 404 }));
    const { container } = renderFooter();
    await screen.findByText("Platform connected");

    expect(screen.queryByTestId("signed-in-as")).toBeNull();
    expect(rules(container)).toHaveLength(1);
  });
});
