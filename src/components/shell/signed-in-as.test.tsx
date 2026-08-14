import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  hasBouncedToLogin,
  resetSignedOutBounceForTests,
} from "@/lib/identity/signed-out";
import { SignedInAs } from "./signed-in-as";

function renderBlock() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SignedInAs />
    </QueryClientProvider>,
  );
}

const answers = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  resetSignedOutBounceForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSignedOutBounceForTests();
});

describe("SignedInAs", () => {
  it("names the operator and offers the way out", async () => {
    vi.stubGlobal(
      "fetch",
      answers({
        signed_in: true,
        name: "Stub Operator",
        email: "operator@example.test",
      }),
    );
    const { container } = renderBlock();
    await waitFor(() =>
      expect(screen.getByText("Stub Operator")).toBeDefined(),
    );
    expect(screen.getByText("operator@example.test")).toBeDefined();
    expect(screen.getByTestId("sign-out")).toBeDefined();
    expect(
      container.querySelector("[data-account]")?.getAttribute("data-account"),
    ).toBe("operator@example.test");
  });

  it("falls back to the email, and then to a plain line", async () => {
    vi.stubGlobal("fetch", answers({ signed_in: true, email: "op@x.test" }));
    renderBlock();
    await waitFor(() => expect(screen.getByText("op@x.test")).toBeDefined());
    // With only one of the two claims there is nothing to put on a second line.
    expect(screen.getAllByText("op@x.test")).toHaveLength(1);

    cleanup();
    vi.stubGlobal("fetch", answers({ signed_in: true }));
    renderBlock();
    await waitFor(() => expect(screen.getByText("Signed in")).toBeDefined());
  });

  // A deployment without identity answers 404 here, and the sidebar it had
  // before this component existed is the right thing to keep showing.
  it.each([
    ["a deployment with no identity", { signed_in: false }, 404],
    ["a browser that is not signed in", { signed_in: false }, 200],
  ])("renders nothing for %s", async (_label, body, status) => {
    vi.stubGlobal("fetch", answers(body, status));
    const { container } = renderBlock();
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("signs out, then leaves without remembering the page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("logout")
        ? new Response(JSON.stringify({ ok: true }))
        : new Response(JSON.stringify({ signed_in: true, name: "Operator" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBlock();
    await waitFor(() => expect(screen.getByTestId("sign-out")).toBeDefined());

    await userEvent.click(screen.getByTestId("sign-out"));
    await waitFor(() => expect(hasBouncedToLogin()).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
    });
  });

  // Staying on a console the operator asked to leave — in front of whoever is
  // next at the keyboard — is worse than leaving with the server session
  // possibly still alive, which the login page lets them retry.
  it("probe: leaves even when the sign-out request fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("logout")) throw new TypeError("offline");
      return new Response(
        JSON.stringify({ signed_in: true, name: "Operator" }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBlock();
    await waitFor(() => expect(screen.getByTestId("sign-out")).toBeDefined());

    await userEvent.click(screen.getByTestId("sign-out"));
    await waitFor(() => expect(hasBouncedToLogin()).toBe(true));
  });
});
