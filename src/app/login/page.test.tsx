// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The server component returns the client element; its props are the decision. */
async function renderProps(search: Record<string, string> = {}) {
  const element = await LoginPage({ searchParams: Promise.resolve(search) });
  return element.props as {
    sso: boolean;
    password: boolean;
    ssoError?: string;
    returnTo?: string;
  };
}

const configureOidc = () => {
  vi.stubEnv("IDENTITY_MODE", "oidc");
  vi.stubEnv("IDENTITY_OIDC_ISSUER", "https://idp.example.com");
  vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", "console-client");
};

describe("LoginPage — which gate this deployment runs", () => {
  it("offers the password alone when identity is off", async () => {
    vi.stubEnv("IDENTITY_MODE", undefined);
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    expect(await renderProps()).toMatchObject({ sso: false, password: true });
  });

  it("offers SSO alone when identity is on and no password is set", async () => {
    configureOidc();
    vi.stubEnv("CONSOLE_PASSWORD", undefined);
    expect(await renderProps()).toMatchObject({ sso: true, password: false });
  });

  it("offers both when both are configured", async () => {
    configureOidc();
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    expect(await renderProps()).toMatchObject({ sso: true, password: true });
  });

  it("passes a failure code through for the form to explain", async () => {
    configureOidc();
    vi.stubEnv("CONSOLE_PASSWORD", undefined);
    expect(await renderProps({ sso_error: "state_mismatch" })).toMatchObject({
      ssoError: "state_mismatch",
    });
  });

  // A repeated query parameter arrives as an array. It is not a code, so it is
  // not passed on — the form would fall back to the generic line anyway, but
  // the type says `string | undefined` and this keeps that honest.
  it("ignores a repeated sso_error parameter", async () => {
    configureOidc();
    const element = await LoginPage({
      searchParams: Promise.resolve({ sso_error: ["a", "b"] }),
    });
    expect((element.props as { ssoError?: string }).ssoError).toBeUndefined();
  });

  // The BFF sends a signed-out operator here with where they were, so the
  // sign-in can put them back rather than on the landing page.
  it("carries a return path through to the form", async () => {
    configureOidc();
    expect(
      await renderProps({ return_to: "/sessions/sess_1?tab=trace" }),
    ).toMatchObject({ returnTo: "/sessions/sess_1?tab=trace" });
  });

  // `safeReturnTo` refuses anything that could resolve off-origin; the default
  // is what the flow does anyway, so it is not passed on as a prop at all.
  it("probe: drops a return path that points off this origin", async () => {
    configureOidc();
    for (const raw of [
      "//evil.example/x",
      "https://evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      expect((await renderProps({ return_to: raw })).returnTo).toBeUndefined();
    }
  });

  // A deployment in this state already answers 503 at /api/health and is
  // NotReady, so nothing production-facing reaches this page — but a 500 here
  // would be a worse way to learn it than a page that still renders.
  it("falls back to the password form when the identity config is broken", async () => {
    vi.stubEnv("IDENTITY_MODE", "oidc");
    vi.stubEnv("IDENTITY_OIDC_ISSUER", undefined);
    vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", undefined);
    expect(await renderProps()).toMatchObject({ sso: false, password: true });
  });
});
