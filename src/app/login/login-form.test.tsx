import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./login-form";

const { replaceSpy } = vi.hoisted(() => ({ replaceSpy: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: replaceSpy }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  replaceSpy.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function submitPassword(password: string) {
  const user = userEvent.setup();
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginForm", () => {
  it("renders a post form and marks it hydrated on the client", () => {
    const { container } = render(<LoginForm sso={false} password />);
    const form = container.querySelector("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("data-hydrated")).toBe("true");
  });

  it("omits the hydration marker from server-rendered HTML", () => {
    const html = renderToString(<LoginForm sso={false} password />);
    expect(html).toContain("<form");
    expect(html).not.toContain("data-hydrated");
  });

  it("posts the password and navigates to /agents on success", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, gate: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm sso={false} password />);
    await submitPassword("hunter2");
    expect(fetchMock).toHaveBeenCalledWith("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "hunter2" }),
    });
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/agents"));
    expect(screen.queryByText("Wrong password.")).toBeNull();
  });

  it("returns to where the operator was, when it knows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
    );
    render(<LoginForm sso={false} password returnTo="/environments/env_1" />);
    await submitPassword("hunter2");
    await waitFor(() =>
      expect(replaceSpy).toHaveBeenCalledWith("/environments/env_1"),
    );
  });

  it("shows an error for a wrong password and stays put", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: {
                type: "authentication_error",
                message: "wrong password",
              },
            }),
            { status: 401, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    render(<LoginForm sso={false} password />);
    await submitPassword("nope");
    expect(await screen.findByText("Wrong password.")).toBeDefined();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("shows the error when the login request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    render(<LoginForm sso={false} password />);
    await submitPassword("hunter2");
    expect(await screen.findByText("Wrong password.")).toBeDefined();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("disables the submit button while the request is in flight", async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    render(<LoginForm sso={false} password />);
    await submitPassword("hunter2");
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toHaveProperty("disabled", true);
    release(new Response(JSON.stringify({ ok: true, gate: true })));
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/agents"));
    expect(button).toHaveProperty("disabled", false);
  });
});

describe("LoginForm — single sign-on", () => {
  it("offers SSO alone when no password gate is configured", () => {
    const { container } = render(<LoginForm sso password={false} />);
    const link = screen.getByTestId("sso-sign-in");
    // A top-level navigation, because the first step is a 302 the browser has
    // to follow — a fetch would resolve it and land nowhere.
    expect(link.getAttribute("href")).toBe("/api/auth/login");
    expect(link.tagName).toBe("A");
    expect(container.querySelector("form")).toBeNull();
    expect(container.firstElementChild?.getAttribute("data-sso")).toBe("true");
  });

  it("offers both controls when the deployment also keeps a password", () => {
    const { container } = render(<LoginForm sso password />);
    expect(screen.getByTestId("sso-sign-in")).toBeDefined();
    expect(container.querySelector("form")).not.toBeNull();
    // The password admits you to the console and authorizes nothing on the
    // platform (plan 08 D3, third row); the page has to say so, or an operator
    // reasonably reads two controls as two ways in.
    expect(
      screen.getByText(/does not authorize anything on the platform/),
    ).toBeDefined();
  });

  // Where the operator was when the BFF signed them out. `/api/auth/login`
  // re-sanitizes it and stores it with the pending authorization, so the
  // callback can put them back on the page they lost.
  it("carries the return path into the authorization request", () => {
    const { container } = render(
      <LoginForm sso password={false} returnTo="/sessions/sess_1?tab=trace" />,
    );
    expect(screen.getByTestId("sso-sign-in").getAttribute("href")).toBe(
      "/api/auth/login?return_to=%2Fsessions%2Fsess_1%3Ftab%3Dtrace",
    );
    expect(container.firstElementChild?.getAttribute("data-return-to")).toBe(
      "/sessions/sess_1?tab=trace",
    );
  });

  it("marks the absence of SSO machine-readably", () => {
    const { container } = render(<LoginForm sso={false} password />);
    expect(container.firstElementChild?.getAttribute("data-sso")).toBe("false");
    expect(screen.queryByTestId("sso-sign-in")).toBeNull();
  });

  it.each([
    ["provider_unavailable", /could not be reached/],
    ["provider_refused", /refused the sign-in/],
    ["state_mismatch", /expired/],
    ["session_failed", /could not be completed/],
  ])("explains the %s failure", (code, matcher) => {
    render(<LoginForm sso password={false} ssoError={code} />);
    expect(screen.getByRole("alert").textContent).toMatch(matcher);
  });

  // The callback never reflects the provider's own text, so this map is the
  // whole vocabulary — and a code from outside it is a value somebody put in
  // the query string by hand.
  it("probe: renders no attacker-supplied error text", () => {
    render(
      <LoginForm
        sso
        password={false}
        ssoError={"<img src=x onerror=alert(1)> contact evil.example"}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Sign-in could not be completed.");
    expect(alert.innerHTML).not.toContain("evil.example");
    expect(document.querySelector("img")).toBeNull();
  });

  // The key comes from the query string, so it can name a prototype member. On
  // a plain object `SSO_ERRORS["constructor"]` resolves to an inherited
  // *function*, which `??` does not replace and React refuses to render — the
  // alert would come out empty rather than saying anything (found in review,
  // PR #94).
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "probe: falls back to the generic line for the inherited key %s",
    (code) => {
      render(<LoginForm sso password={false} ssoError={code} />);
      expect(screen.getByRole("alert").textContent).toBe(
        "Sign-in could not be completed.",
      );
    },
  );
});
