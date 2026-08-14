// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IdentityConfigError,
  identityConfig,
  identityConfigFrom,
} from "./config";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The environment as a map, so every rule is a pure table row. */
const env = (values: Record<string, string>) => (name: string) => values[name];

/** Parses and asserts it failed, returning the defect for inspection. */
const failure = (values: Record<string, string>): IdentityConfigError => {
  try {
    identityConfigFrom(env(values));
  } catch (error) {
    if (error instanceof IdentityConfigError) return error;
    throw error;
  }
  throw new Error("expected this configuration to be refused, but it parsed");
};

const OIDC = {
  IDENTITY_MODE: "oidc",
  IDENTITY_OIDC_ISSUER: "https://idp.example.com",
  IDENTITY_OIDC_CLIENT_ID: "console-client",
};

describe("identityConfigFrom — mode", () => {
  it("is disabled when unset", () => {
    expect(identityConfigFrom(env({}))).toEqual({ mode: "disabled" });
  });

  it("is disabled when set to disabled", () => {
    expect(identityConfigFrom(env({ IDENTITY_MODE: "disabled" }))).toEqual({
      mode: "disabled",
    });
  });

  it("treats whitespace as unset", () => {
    expect(identityConfigFrom(env({ IDENTITY_MODE: "   " }))).toEqual({
      mode: "disabled",
    });
  });

  // A staged rollout places the configuration first and flips the mode second,
  // so half-written identity config must not stop a disabled console serving.
  it("reads no other variable while disabled", () => {
    expect(
      identityConfigFrom(env({ IDENTITY_OIDC_ISSUER: "not-a-url" })),
    ).toEqual({ mode: "disabled" });
  });

  it("refuses trusted_proxy, naming it as the platform's Mode B", () => {
    const error = failure({ IDENTITY_MODE: "trusted_proxy" });
    expect(error.invalid).toEqual(["IDENTITY_MODE"]);
    expect(error.message).toContain("Mode B");
  });

  it("refuses an unknown mode", () => {
    expect(failure({ IDENTITY_MODE: "saml" }).invalid).toEqual([
      "IDENTITY_MODE",
    ]);
  });
});

describe("identityConfigFrom — oidc", () => {
  it("parses the minimum configuration", () => {
    expect(identityConfigFrom(env(OIDC))).toEqual({
      mode: "oidc",
      issuer: "https://idp.example.com",
      clientId: "console-client",
      scopes: ["openid", "profile", "email"],
    });
  });

  it("carries an optional client secret and redirect URL", () => {
    expect(
      identityConfigFrom(
        env({
          ...OIDC,
          IDENTITY_OIDC_CLIENT_SECRET: "s3cret",
          IDENTITY_OIDC_REDIRECT_URL:
            "https://console.example.com/api/auth/callback",
        }),
      ),
    ).toMatchObject({
      clientSecret: "s3cret",
      redirectUrl: "https://console.example.com/api/auth/callback",
    });
  });

  it("names every missing variable at once", () => {
    expect(failure({ IDENTITY_MODE: "oidc" }).missing).toEqual([
      "IDENTITY_OIDC_ISSUER",
      "IDENTITY_OIDC_CLIENT_ID",
    ]);
  });

  it.each([
    ["not a URL at all", "idp.example.com"],
    ["a query", "https://idp.example.com/?tenant=a"],
    ["a fragment", "https://idp.example.com/#x"],
    ["credentials in the URL", "https://user:pw@idp.example.com"],
    ["a non-loopback http host", "http://idp.example.com"],
    ["a non-http scheme", "ftp://idp.example.com"],
  ])("refuses an issuer with %s", (_why, issuer) => {
    expect(failure({ ...OIDC, IDENTITY_OIDC_ISSUER: issuer }).invalid).toEqual([
      "IDENTITY_OIDC_ISSUER",
    ]);
  });

  // The platform accepts http to a loopback host; a console that refused one
  // could not run against an IdP in `deploy/compose` at all.
  it.each([
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://[::1]:8000",
  ])("accepts %s, matching the platform's own scheme rule", (issuer) => {
    expect(
      identityConfigFrom(env({ ...OIDC, IDENTITY_OIDC_ISSUER: issuer })),
    ).toMatchObject({ issuer });
  });

  it("splits scopes on whitespace and commas", () => {
    expect(
      identityConfigFrom(
        env({ ...OIDC, IDENTITY_OIDC_SCOPES: "openid, profile  groups" }),
      ),
    ).toMatchObject({ scopes: ["openid", "profile", "groups"] });
  });

  it("refuses scopes without openid", () => {
    expect(
      failure({ ...OIDC, IDENTITY_OIDC_SCOPES: "profile email" }).invalid,
    ).toEqual(["IDENTITY_OIDC_SCOPES"]);
  });

  it("refuses a redirect URL that is not absolute", () => {
    expect(
      failure({ ...OIDC, IDENTITY_OIDC_REDIRECT_URL: "/api/auth/callback" })
        .invalid,
    ).toEqual(["IDENTITY_OIDC_REDIRECT_URL"]);
  });

  // The health route serves these defects to an anonymous caller, so a message
  // quoting what it refused publishes the thing it refused. Naming the variable
  // and the rule is enough to fix a deployment and is all that is safe to
  // serve — a stronger property than redaction, and cheaper.
  it("probe: never quotes a configured value", () => {
    const values = {
      IDENTITY_MODE: "oidc",
      IDENTITY_OIDC_ISSUER: "https://tenant-7c1f.idp.internal/?leak=issuer",
      IDENTITY_OIDC_CLIENT_ID: "",
      IDENTITY_OIDC_CLIENT_SECRET: "leak-client-secret",
      IDENTITY_OIDC_REDIRECT_URL: "http://192.0.2.7/leak-redirect",
      IDENTITY_OIDC_SCOPES: "profile",
    };
    const error = failure(values);
    const serialized = `${error.message}${JSON.stringify(error)}${error.stack ?? ""}`;
    for (const value of [
      values.IDENTITY_OIDC_ISSUER,
      values.IDENTITY_OIDC_CLIENT_SECRET,
      values.IDENTITY_OIDC_REDIRECT_URL,
    ]) {
      expect(serialized).not.toContain(value);
    }
    // And it still names everything an operator has to fix.
    expect(error.missing).toEqual(["IDENTITY_OIDC_CLIENT_ID"]);
    expect(error.invalid).toEqual([
      "IDENTITY_OIDC_ISSUER",
      "IDENTITY_OIDC_REDIRECT_URL",
      "IDENTITY_OIDC_SCOPES",
    ]);
  });
});

describe("identityConfig", () => {
  it("reads the process environment", () => {
    vi.stubEnv("IDENTITY_MODE", "oidc");
    vi.stubEnv("IDENTITY_OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", "console-client");
    expect(identityConfig()).toMatchObject({
      mode: "oidc",
      clientId: "console-client",
    });
  });

  it("is disabled with nothing set", () => {
    vi.stubEnv("IDENTITY_MODE", undefined);
    expect(identityConfig()).toEqual({ mode: "disabled" });
  });
});
