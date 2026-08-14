// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { type IdentityConfig, IdentityConfigError } from "./config";
import { consoleAuthMode, consoleAuthModeFrom, sendsUserToken } from "./mode";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

const OIDC: IdentityConfig = {
  mode: "oidc",
  issuer: "https://idp.example.com",
  clientId: "console-client",
  scopes: ["openid"],
};

const DISABLED: IdentityConfig = { mode: "disabled" };

// Plan 08 D3's table, one test per row. The point of pinning all four is that
// the rows are not independent: the dangerous configuration is the one where
// both switches are on, and it is only dangerous relative to the other three.
describe("consoleAuthModeFrom — the D3 mode matrix", () => {
  it("password set, identity unset: the password gate, and the management key behind it", () => {
    const mode = consoleAuthModeFrom(DISABLED, "hunter2");
    expect(mode).toEqual({ kind: "password", password: "hunter2" });
    expect(sendsUserToken(mode)).toBe(false);
  });

  it("password unset, identity set: SSO, and the BFF acts as the user", () => {
    const mode = consoleAuthModeFrom(OIDC, undefined);
    expect(mode).toMatchObject({ kind: "sso", passwordGate: false });
    expect(sendsUserToken(mode)).toBe(true);
  });

  it("both set: SSO wins, and the password gate is only what stands in front of it", () => {
    const mode = consoleAuthModeFrom(OIDC, "hunter2");
    expect(mode).toMatchObject({ kind: "sso", passwordGate: true });
    expect(sendsUserToken(mode)).toBe(true);
  });

  it("neither set: no gate, and the management key", () => {
    const mode = consoleAuthModeFrom(DISABLED, undefined);
    expect(mode).toEqual({ kind: "open" });
    expect(sendsUserToken(mode)).toBe(false);
  });

  // The load-bearing negative: with identity configured there is no
  // configuration in which a platform call is made with the management key on a
  // browser's behalf. A fallback here would silently restore root for whoever
  // holds the shared password — which is precisely what this plan removes.
  it("never sends the management key once identity is configured", () => {
    for (const password of [undefined, "hunter2", ""]) {
      expect(sendsUserToken(consoleAuthModeFrom(OIDC, password))).toBe(true);
    }
  });

  it("carries the identity configuration without its discriminant", () => {
    const mode = consoleAuthModeFrom(OIDC, undefined);
    expect(mode.kind === "sso" && mode.identity).toEqual({
      issuer: "https://idp.example.com",
      clientId: "console-client",
      scopes: ["openid"],
    });
  });
});

describe("consoleAuthMode", () => {
  it("reads the process environment", () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    vi.stubEnv("IDENTITY_MODE", undefined);
    expect(consoleAuthMode()).toEqual({
      kind: "password",
      password: "hunter2",
    });
  });

  // Fail closed: a console that cannot parse its own identity configuration
  // cannot authorize anybody, and must not answer as though identity were off.
  it("throws rather than degrading to a lesser mode on broken identity config", () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    vi.stubEnv("IDENTITY_MODE", "oidc");
    expect(() => consoleAuthMode()).toThrow(IdentityConfigError);
  });
});
