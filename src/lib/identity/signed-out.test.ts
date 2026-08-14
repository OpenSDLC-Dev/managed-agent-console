import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIGNED_OUT_HEADER,
  bounceToLogin,
  hasBouncedToLogin,
  isSignedOut,
  resetSignedOutBounceForTests,
} from "./signed-out";

const assign = vi.fn<(url: string) => void>();

/** jsdom's `window.location` is not assignable; only the pieces read here are needed. */
const at = (pathname: string, search = "") => {
  vi.stubGlobal("window", { location: { pathname, search, assign } });
};

beforeEach(() => {
  assign.mockReset();
  resetSignedOutBounceForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isSignedOut", () => {
  it("reads the marker, not the status", () => {
    expect(isSignedOut(new Response(null, { status: 401 }))).toBe(false);
    expect(
      isSignedOut(
        new Response(null, {
          status: 200,
          headers: { [SIGNED_OUT_HEADER]: "1" },
        }),
      ),
    ).toBe(true);
  });
});

describe("bounceToLogin", () => {
  it("remembers where the operator was, query and all", () => {
    at("/sessions/sess_1", "?tab=trace");
    bounceToLogin();
    expect(assign).toHaveBeenCalledWith(
      "/login?return_to=%2Fsessions%2Fsess_1%3Ftab%3Dtrace",
    );
  });

  // A page holds several queries and they fail together. Without the guard one
  // expired session fires a navigation per in-flight request.
  it("probe: navigates once however many callers ask", () => {
    at("/agents");
    bounceToLogin();
    bounceToLogin();
    bounceToLogin();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(hasBouncedToLogin()).toBe(true);
  });

  it("probe: does not bounce the login page to itself", () => {
    at("/login", "?sso_error=state_mismatch");
    bounceToLogin();
    expect(assign).not.toHaveBeenCalled();
    expect(hasBouncedToLogin()).toBe(false);
  });

  it("is inert on the server, where there is no browser to send anywhere", () => {
    vi.stubGlobal("window", undefined);
    expect(() => bounceToLogin()).not.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });
});
