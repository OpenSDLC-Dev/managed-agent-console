import "server-only";
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from "jose";
import { isHttpsRequest } from "@/lib/auth";
import { type OidcConfig } from "./config";
import { type ProviderMetadata } from "./discovery";

/**
 * The relying-party half of the authorization-code flow: where to send the
 * browser, and what to do with what comes back.
 *
 * Kept out of the route handlers so the adversarial cases — a forged `state`, a
 * replayed `nonce`, a `returnTo` pointing off-origin — are unit-testable
 * without a redirect dance, and so the probe ratchet has a module to hold.
 */

export class RelyingPartyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelyingPartyError";
  }
}

const TOKEN_TIMEOUT_MS = 10_000;

export type TokenSet = {
  idToken: string;
  refreshToken?: string;
};

export type VerifiedIdentity = {
  subject: string;
  email?: string;
  name?: string;
  /** Epoch ms, from the ID token's own `exp`. */
  expiresAt: number;
};

/** The path this console sends the browser back to after a sign-in. */
export const DEFAULT_RETURN_TO = "/agents";

/** CR, LF and their neighbours: a `Location` header is built from this value. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Narrows a caller-supplied return path to a same-origin one.
 *
 * The value reaches this console in a query string, so it is attacker-authored
 * by construction: `//evil.example` is a protocol-relative URL that a browser
 * resolves off-origin, and `https://evil.example` needs no explanation. A
 * console that redirected to either would be an open redirect wearing the
 * deployment's own hostname, which is exactly the credibility a phishing page
 * wants. Anything that is not a plain absolute path becomes the default.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_RETURN_TO;
  if (!raw.startsWith("/")) return DEFAULT_RETURN_TO;
  // `//host` and `/\host` are both protocol-relative to some parser.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_RETURN_TO;
  if (CONTROL_CHARACTERS.test(raw)) return DEFAULT_RETURN_TO;
  return raw;
}

/**
 * The redirect URI, which must be **byte-identical** between the authorization
 * request and the token exchange (RFC 6749 §4.1.3) — which is why the value is
 * stored with the pending authorization rather than recomputed on the way back.
 *
 * `IDENTITY_OIDC_REDIRECT_URL` wins when set, and production should set it. The
 * derived form reads the forwarded host, which is client-supplied where no
 * proxy overwrites it; that is survivable rather than fine, because a redirect
 * URI has to be pre-registered at the provider, so a forged host produces a URI
 * the provider refuses instead of one it honours.
 */
export function resolveRedirectUri(
  request: { headers: Headers; nextUrl: URL },
  config: OidcConfig,
): string {
  if (config.redirectUrl !== undefined) return config.redirectUrl;
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  const scheme = isHttpsRequest(request) ? "https" : "http";
  return `${scheme}://${host}/api/auth/callback`;
}

export function authorizationUrl(
  metadata: ProviderMetadata,
  config: OidcConfig,
  params: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  },
): string {
  const url = new URL(metadata.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Exchanges the authorization code. The client secret leaves this process only here, over the discovery-validated token endpoint. */
export async function exchangeCode(
  metadata: ProviderMetadata,
  config: OidcConfig,
  params: { code: string; verifier: string; redirectUri: string },
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier,
    client_id: config.clientId,
  });
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  });

  if (config.clientSecret !== undefined) {
    // OIDC's default is client_secret_basic, and it is the default here too —
    // but the provider's own advertisement wins where it disagrees, because
    // sending the wrong one surfaces as an opaque 401 at the end of a redirect
    // dance rather than as anything an operator can act on.
    const methods = metadata.tokenEndpointAuthMethods;
    const usePost =
      methods.includes("client_secret_post") &&
      !methods.includes("client_secret_basic");
    if (usePost) {
      body.set("client_secret", config.clientSecret);
    } else {
      // RFC 6749 §2.3.1: both halves are **form-urlencoded** before base64,
      // which is not what `encodeURIComponent` does — it renders a space as
      // `%20` where form encoding wants `+`, and leaves `!'()*` alone. A secret
      // containing any of those would be decoded by the provider as a different
      // secret, and every exchange would fail with an opaque 401 (found in
      // review, PR #94). `URLSearchParams` is the encoder the spec names.
      const credentials = `${formUrlEncode(config.clientId)}:${formUrlEncode(config.clientSecret)}`;
      headers.set("authorization", `Basic ${btoa(credentials)}`);
    }
  }

  let response: Response;
  try {
    response = await fetch(metadata.tokenEndpoint, {
      method: "POST",
      headers,
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch {
    throw new RelyingPartyError("the identity provider could not be reached");
  }

  // The body is read either way, because a failed exchange is where a provider
  // says something useful — but only its `error` code is quoted, never the
  // description, which some providers echo the request into.
  const text = await response.text().catch(() => "");
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    // Falls through to the shape checks below.
  }

  if (!response.ok) {
    const code = payload["error"];
    throw new RelyingPartyError(
      typeof code === "string" && /^[a-z_]{1,64}$/.test(code)
        ? `the identity provider refused the authorization code (${code})`
        : `the identity provider refused the authorization code (${response.status})`,
    );
  }

  const idToken = payload["id_token"];
  if (typeof idToken !== "string" || idToken === "") {
    // A provider that returns only an access token is configured as a plain
    // OAuth client. The platform verifies an ID token, so there is nothing to
    // forward, and saying so beats a session that fails on every later call.
    throw new RelyingPartyError(
      "the identity provider returned no id_token — check that `openid` is in IDENTITY_OIDC_SCOPES",
    );
  }
  const refreshToken = payload["refresh_token"];
  return {
    idToken,
    ...(typeof refreshToken === "string" && refreshToken !== ""
      ? { refreshToken }
      : {}),
  };
}

/** `application/x-www-form-urlencoded`, borrowed from the encoder rather than hand-rolled. */
function formUrlEncode(value: string): string {
  return new URLSearchParams({ v: value }).toString().slice("v=".length);
}

/**
 * A display claim, or `undefined` if the provider left it blank.
 *
 * Blank is not the same as absent to a `??` chain, and this is the seam where
 * that matters: every consumer of these claims picks the first one *present*,
 * so an empty `name` beside a good email renders a blank line where the
 * operator's identity belongs and hides the email behind it. Same idiom the
 * `sub` and `refresh_token` checks in this file already use.
 */
function textClaim(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function resetJwksCacheForTests(): void {
  jwks.clear();
}

/**
 * Verifies the ID token and reads the operator out of it.
 *
 * OIDC Core §3.1.3.7 permits an RP to skip signature validation for a token
 * taken straight from the token endpoint over TLS. It is done anyway: the
 * platform verifies the same signature on every proxied request, so a token
 * this console accepts and the platform rejects is a deployment that signs
 * people in and then serves them 401s — better caught here, once, with a
 * message naming the provider.
 *
 * `nonce` is not optional in either reading. It is the only thing tying this
 * token to the authorization request this browser started.
 */
export async function verifyIdToken(
  metadata: ProviderMetadata,
  config: OidcConfig,
  idToken: string,
  expectedNonce: string,
): Promise<VerifiedIdentity> {
  let keys = jwks.get(metadata.jwksUri);
  if (keys === undefined) {
    keys = createRemoteJWKSet(new URL(metadata.jwksUri));
    jwks.set(metadata.jwksUri, keys);
  }

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, {
      issuer: metadata.issuer,
      audience: config.clientId,
      // `exp` is required by OIDC Core §2 but jose only enforces it when it is
      // present. Without this a token carrying none would verify, `expiresAt`
      // would be 0, and the operator would be "signed in" to a session already
      // expired — a sign-in that silently does nothing (found in review, #94).
      requiredClaims: ["exp"],
    }));
  } catch {
    // Deliberately not the library's message: it can quote header and claim
    // values from a token this console is about to refuse.
    throw new RelyingPartyError(
      "the identity provider's id_token failed verification",
    );
  }

  if (typeof payload.nonce !== "string" || payload.nonce !== expectedNonce) {
    throw new RelyingPartyError(
      "the identity provider's id_token replayed a nonce",
    );
  }
  if (typeof payload.sub !== "string" || payload.sub === "") {
    throw new RelyingPartyError(
      "the identity provider's id_token has no subject",
    );
  }
  // `azp` matters only when `aud` carries more than one value; jose has already
  // required clientId to be among them.
  if (Array.isArray(payload.aud) && payload.aud.length > 1) {
    if (payload.azp !== config.clientId) {
      throw new RelyingPartyError(
        "the identity provider's id_token was authorized for a different client",
      );
    }
  }

  const email = textClaim(payload.email);
  const name = textClaim(payload.name);
  return {
    subject: payload.sub,
    ...(email === undefined ? {} : { email }),
    ...(name === undefined ? {} : { name }),
    // `exp` is required by JWT and enforced by jose above; this is its ms form.
    expiresAt: (payload.exp ?? 0) * 1000,
  };
}
