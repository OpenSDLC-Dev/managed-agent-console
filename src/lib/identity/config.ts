import "server-only";

/**
 * The console's identity configuration — the relying-party half of the
 * platform's OIDC verifier (plan 08, slice 1).
 *
 * The variable names are the platform's own, deliberately: a deployment that
 * turns identity on sets `IDENTITY_MODE` and `IDENTITY_OIDC_ISSUER` to the same
 * values on both processes, and the console's `IDENTITY_OIDC_CLIENT_ID` is what
 * the platform is configured to expect as `IDENTITY_OIDC_AUDIENCE` — in an
 * authorization-code flow the ID token's `aud` *is* the relying party's client
 * id, so two different values would produce tokens the platform rejects on
 * every proxied request (plan 08 D1).
 *
 * **The console's own config carries its mode; it never probes for it.** The
 * platform makes SSO-on indistinguishable from SSO-off to an unauthenticated
 * caller by design, and a 403 is not "surface absent" — so the feature
 * detection the rest of the console rests on (CLAUDE.md principle 3) cannot see
 * identity at all. Recorded as a divergence in docs/wire-divergences.md.
 *
 * Nothing here is read when the mode is disabled, so a staged rollout can place
 * the configuration first and flip the mode second — the same property the
 * platform's `ConfigFromEnv` has, for the same reason.
 */

/** What the console does about identity. `trusted_proxy` is the platform's Mode B, which this console does not implement. */
export type IdentityMode = "disabled" | "oidc";

export type OidcConfig = {
  /** Issuer identifier, compared as an exact string by the platform. */
  issuer: string;
  /** Also the audience the platform must be configured to expect. */
  clientId: string;
  /** Absent for a public client; PKCE is used either way. */
  clientSecret?: string;
  /** Absent means "derive from the request" — slice 2's job, not this module's. */
  redirectUrl?: string;
  scopes: string[];
};

export type IdentityConfig =
  { mode: "disabled" } | ({ mode: "oidc" } & OidcConfig);

/**
 * A configuration defect, carrying the variable names implicated and nothing
 * else. **No message here ever quotes a value**, because the health route
 * reports these to an anonymous caller — naming the rule that was broken is
 * enough to fix it, and is the only thing safe to serve.
 */
export class IdentityConfigError extends Error {
  readonly missing: string[];
  readonly invalid: string[];

  constructor(
    message: string,
    names: { missing?: string[]; invalid?: string[] },
  ) {
    super(message);
    this.name = "IdentityConfigError";
    this.missing = names.missing ?? [];
    this.invalid = names.invalid ?? [];
  }
}

const DEFAULT_SCOPES = ["openid", "profile", "email"];

/** Parses the `IDENTITY_*` variables read through `getenv`. Throws `IdentityConfigError` on any defect. */
export function identityConfigFrom(
  getenv: (name: string) => string | undefined,
): IdentityConfig {
  const read = (name: string) => (getenv(name) ?? "").trim();

  // Unset and "disabled" are the same thing, and neither reads another
  // variable: os.Getenv cannot distinguish unset from set-empty on the platform
  // side, so neither does this.
  const mode = read("IDENTITY_MODE");
  if (mode === "" || mode === "disabled") return { mode: "disabled" };
  if (mode === "trusted_proxy") {
    throw new IdentityConfigError(
      "IDENTITY_MODE=trusted_proxy is the platform's Mode B, in which the browser " +
        "calls the platform directly; this console is a proxying BFF and does not " +
        "implement it (plan 08 D1). Use IDENTITY_MODE=oidc.",
      { invalid: ["IDENTITY_MODE"] },
    );
  }
  if (mode !== "oidc") {
    throw new IdentityConfigError(
      "IDENTITY_MODE must be disabled, oidc, or trusted_proxy",
      { invalid: ["IDENTITY_MODE"] },
    );
  }

  const missing: string[] = [];
  const invalid: string[] = [];

  const issuer = read("IDENTITY_OIDC_ISSUER");
  if (issuer === "") missing.push("IDENTITY_OIDC_ISSUER");
  else if (issuerProblem(issuer)) invalid.push("IDENTITY_OIDC_ISSUER");

  const clientId = read("IDENTITY_OIDC_CLIENT_ID");
  if (clientId === "") missing.push("IDENTITY_OIDC_CLIENT_ID");

  const redirectUrl = read("IDENTITY_OIDC_REDIRECT_URL");
  if (redirectUrl !== "" && urlProblem(redirectUrl)) {
    invalid.push("IDENTITY_OIDC_REDIRECT_URL");
  }

  const raw = read("IDENTITY_OIDC_SCOPES");
  const scopes =
    raw === "" ? DEFAULT_SCOPES : raw.split(/[\s,]+/).filter(Boolean);
  // The platform verifies an ID token; without `openid` the provider is not
  // obliged to issue one, and the failure would land at the token endpoint
  // rather than here.
  if (!scopes.includes("openid")) invalid.push("IDENTITY_OIDC_SCOPES");

  if (missing.length > 0 || invalid.length > 0) {
    throw new IdentityConfigError(
      "IDENTITY_MODE=oidc is missing or has an invalid value for: " +
        [...missing, ...invalid].join(", "),
      { missing, invalid },
    );
  }

  const clientSecret = read("IDENTITY_OIDC_CLIENT_SECRET");
  return {
    mode: "oidc",
    issuer,
    clientId,
    ...(clientSecret === "" ? {} : { clientSecret }),
    ...(redirectUrl === "" ? {} : { redirectUrl }),
    scopes,
  };
}

/** Reads the process environment. */
export function identityConfig(): IdentityConfig {
  return identityConfigFrom((name) => process.env[name]);
}

/**
 * The scheme rule, mirroring the platform's `requireHTTPS`
 * (`internal/identity/fetch.go`): https, or http to a loopback host, and never
 * credentials in the URL. Matching it matters — a URL this console accepts and
 * the platform refuses is a deployment that boots and cannot serve.
 */
function urlProblem(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }
  if (url.hostname === "") return true;
  if (url.username !== "" || url.password !== "") return true;
  if (url.protocol === "https:") return false;
  if (url.protocol !== "http:") return true;
  return !isLoopback(url.hostname);
}

/**
 * The issuer identifier's own rule on top of the scheme rule: OIDC Discovery §2
 * says it MUST carry neither a query nor a fragment. Enforced because `iss` is
 * compared as an exact string, and because discovery appends
 * `/.well-known/openid-configuration` to whatever it is given.
 */
function issuerProblem(raw: string): boolean {
  if (urlProblem(raw)) return true;
  const url = new URL(raw);
  return url.search !== "" || url.hash !== "" || raw.includes("#");
}

function isLoopback(hostname: string): boolean {
  // URL normalizes an IPv6 literal to bracketed lowercase.
  const host = hostname.replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "::1" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}
