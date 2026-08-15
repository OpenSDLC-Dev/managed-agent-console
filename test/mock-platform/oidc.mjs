// A minimal OpenID Provider, so the console's identity mode can be walked (#99).
//
// **Not a platform surface.** The console reaches this as its OIDC *issuer*, and
// it lives beside the platform double only because one process is cheaper than
// two; it binds its own port so the issuer and PLATFORM_BASE_URL stay different
// origins, which is what a real deployment has and what keeps a test from
// passing because the console confused the two.
//
// Everything here is what `src/lib/identity/{config,discovery,rp,pkce}.ts`
// actually reads, and nothing else — a stub serving fields no client reads
// invites the next reader to believe the console reads them.
//
// It proves the console's *flow*, never its cryptography: these signatures are
// made with the library that verifies them (as `src/lib/identity/rp.test.ts`
// already does), and the platform double does not check them at all — it decodes
// the payload and reads `exp` (server.mjs, `authenticate`). A green fidelity run
// is evidence about pixels, not about crypto.
//
// **Happy path only, and deliberately so.** The platform's equivalent fixture
// (`internal/identity/identitytest` in the sibling checkout) carries a rich
// adversarial API — FailJWKS, SetDiscovery, Rotate, Retire, BlockJWKS — because
// it is what that repo's verifier tests drive. This one has none, because the
// console already owns those cases one tier down and more cheaply: a wrong
// issuer, an unbounded document, a replayed nonce, a foreign audience, a key the
// provider never published and a token with no `exp` are all `probe:` tests in
// `src/lib/identity/{discovery,rp}.test.ts`. A failure hook here would be a
// second, slower copy of coverage that exists — so if you are about to add one,
// add a unit test instead.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const PORT = Number(process.env.MOCK_OIDC_PORT ?? 18090);
/**
 * The issuer identifier, compared to `IDENTITY_OIDC_ISSUER` as an **exact
 * string** (`discovery.ts`, OIDC Discovery §4.3) — normalized on neither side.
 * A trailing slash on one of them is a sign-in that never starts while every
 * fetch still succeeds, so the two values come from one constant in the
 * Playwright config rather than being typed twice.
 *
 * Loopback on purpose: `config.ts`/`discovery.ts` accept http only for
 * `localhost`, `[::1]` and `127.x`, so a stub on any other host is refused
 * before a redirect happens.
 */
const ISSUER = process.env.MOCK_OIDC_ISSUER ?? `http://127.0.0.1:${PORT}`;
const CLIENT_ID = process.env.MOCK_OIDC_CLIENT_ID ?? "managed-agent-console";

/**
 * The one operator this provider knows. Fixed, because these claims are
 * *rendered*: a varying display name is a varying screenshot.
 *
 * Both claims are set because the account block puts `name` on the 14px line and
 * shows the 12px second line only when `email` is there too
 * (`signed-in-as.tsx`) — a provider releasing one claim is a different layout,
 * and would be a second fixture rather than a flag on this one.
 */
const OPERATOR = {
  sub: "operator_console0000000001",
  name: "Ada Okafor",
  email: "ada.okafor@example.test",
};

/** An hour: longer than any pass, short enough to be a real `exp` rather than a decoration. */
const TOKEN_TTL_S = 3600;

const KID = "mock-oidc-1";

/**
 * ES256, generated once per process and **never rotated — not even by
 * `/__reset`**.
 *
 * Rotation is what a naive stub gets wrong. jose holds a fetched JWKS fresh for
 * ten minutes and refuses to refetch it for thirty seconds, so a key regenerated
 * between two tests verifies nothing for half a minute and the failure surfaces
 * as an opaque `?sso_error=session_failed`. ES256 rather than RS256 because
 * P-256 keygen is milliseconds where RSA-2048 is not — measured at 4 ms here —
 * and it is what `src/lib/identity/rp.test.ts` already signs with. Never a
 * symmetric alg: `createRemoteJWKSet` throws before it even looks at a key.
 *
 * Lazy and promise-memoized, so importing this module costs nothing and two
 * concurrent first requests cannot generate two keys.
 */
let keys;
function signingKeys() {
  keys ??= generateKeyPair("ES256", { extractable: true }).then(
    async ({ publicKey, privateKey }) => ({
      privateKey,
      // The **public** half. A JWK carrying `d` fails jose's "members must be
      // public keys" check — the other thing an export-the-pair stub gets wrong.
      jwk: {
        ...(await exportJWK(publicKey)),
        alg: "ES256",
        use: "sig",
        kid: KID,
      },
    }),
  );
  return keys;
}

/** Authorization codes in flight: code -> what the exchange has to prove. Deleted on read. */
const codes = new Map();

/**
 * Clears codes in flight. Called from the platform double's `resetStore()`.
 *
 * It deliberately does **not** touch the signing key; see `signingKeys()` for
 * the thirty seconds that would cost.
 */
export function resetOidc() {
  codes.clear();
}

/** The provider's own HTTP server. Bound by `server.mjs`, which owns the process. */
export const oidcServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // `discovery.ts` builds this path by concatenation onto the issuer, so it has
  // to sit on the issuer's own root.
  if (
    req.method === "GET" &&
    url.pathname === "/.well-known/openid-configuration"
  ) {
    return json(res, 200, {
      // Byte-identical to IDENTITY_OIDC_ISSUER or discovery throws (§4.3).
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      // Read only when a client secret is configured, and named so the exchange
      // picks Basic from the document rather than from an absence of
      // information. No `end_session_endpoint`: logout destroys the server-side
      // session and never calls the provider, so advertising one is a fiction.
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      // Ignored by this console, and cheap honesty for anyone reading the doc.
      response_types_supported: ["code"],
      id_token_signing_alg_values_supported: ["ES256"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["openid", "profile", "email"],
    });
  }

  if (req.method === "GET" && url.pathname === "/jwks") {
    const { jwk } = await signingKeys();
    // Exactly 200: jose throws on any other status, redirects included.
    return json(res, 200, { keys: [jwk] });
  }

  if (req.method === "GET" && url.pathname === "/authorize") {
    return authorize(res, url);
  }

  if (req.method === "POST" && url.pathname === "/token") {
    return token(res, new URLSearchParams((await readBody(req)).toString()));
  }

  return json(res, 404, { error: "not_found" });
});

/**
 * Auto-approving: no consent screen, no password, no session of its own.
 *
 * That is the design rather than a shortcut. The console's half of the flow is
 * what these tiers exercise, and every control on a real provider's sign-in UI
 * is one more thing that can hang a shot.
 *
 * The parameters it checks are exactly the ones `authorizationUrl` sets.
 * Checking them is the point: a stub that ignored `code_challenge` would keep
 * passing a console that had stopped sending PKCE altogether.
 */
function authorize(res, url) {
  const q = url.searchParams;
  const redirectUri = q.get("redirect_uri") ?? "";

  // RFC 6749 §4.1.2.1: an unknown client or an unregistered redirect_uri must
  // NOT be redirected anywhere. It is also the one error an operator sees
  // directly, so it says what happened in plain text rather than becoming an
  // `?sso_error=` code with no provider detail.
  if (q.get("client_id") !== CLIENT_ID || !registered(redirectUri)) {
    return text(
      res,
      400,
      "mock oidc: unknown client_id or unregistered redirect_uri",
    );
  }

  const state = q.get("state") ?? "";
  const scope = (q.get("scope") ?? "").split(" ");
  const problem =
    q.get("response_type") !== "code"
      ? "unsupported_response_type"
      : !scope.includes("openid")
        ? "invalid_scope"
        : q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")
          ? "invalid_request"
          : !q.get("nonce")
            ? "invalid_request"
            : null;
  if (problem !== null) {
    return redirect(res, back(redirectUri, { error: problem, state }));
  }

  const code = randomBytes(24).toString("base64url");
  codes.set(code, {
    nonce: q.get("nonce"),
    challenge: q.get("code_challenge"),
    redirectUri,
  });
  // A top-level GET with `state` echoed **verbatim**. The callback compares it
  // to an httpOnly SameSite=Lax cookie in constant time, so a stub that dropped
  // it, re-encoded it, or came back by form_post would be indistinguishable from
  // the login-CSRF defence firing.
  return redirect(res, back(redirectUri, { code, state }));
}

async function token(res, form) {
  const code = form.get("code") ?? "";
  const pending = codes.get(code);
  // Single use, whatever happens next — the same delete-on-read the console's
  // own `takePending` does, so a replayed exchange fails loudly.
  codes.delete(code);

  if (
    pending === undefined ||
    form.get("grant_type") !== "authorization_code" ||
    form.get("client_id") !== CLIENT_ID ||
    // Byte-identical, because the console replays the value it stored rather
    // than recomputing it (RFC 6749 §4.1.3). Normalizing here would 400 a
    // correct client.
    form.get("redirect_uri") !== pending.redirectUri ||
    !verifierMatches(form.get("code_verifier"), pending.challenge)
  ) {
    // The console quotes this `error` code and never `error_description`, so the
    // code is the entire diagnostic vocabulary available to a failing exchange.
    return json(res, 400, { error: "invalid_grant" });
  }

  const { privateKey } = await signingKeys();
  const idToken = await new SignJWT({
    // Not optional in either reading: it is the only thing tying this token to
    // the authorization request this browser started.
    nonce: pending.nonce,
    name: OPERATOR.name,
    email: OPERATOR.email,
  })
    .setProtectedHeader({ alg: "ES256", kid: KID })
    .setIssuer(ISSUER)
    // A single string, not an array: an array of more than one would oblige the
    // console to check `azp`, which is a different test than this one.
    .setAudience(CLIENT_ID)
    .setSubject(OPERATOR.sub)
    .setIssuedAt()
    // jose enforces `exp` with zero clock tolerance, and the platform double
    // reads the same claim off the wire when the console forwards this token.
    .setExpirationTime(`${TOKEN_TTL_S}s`)
    .sign(privateKey);

  return json(res, 200, {
    // Opaque and unread: the console forwards the **id_token**, which is why
    // that is the value that has to be JWT-shaped.
    access_token: randomBytes(24).toString("base64url"),
    token_type: "Bearer",
    expires_in: TOKEN_TTL_S,
    id_token: idToken,
    scope: "openid profile email",
    // No refresh_token: nothing in the console reads one, and returning one
    // would imply a refresh path that does not exist.
  });
}

/**
 * Standing in for client registration: any loopback console's callback.
 *
 * A real provider matches a pre-registered string, and matching *something* is
 * what keeps this from being an open redirector that any page open in the same
 * browser during a run could drive.
 */
function registered(raw) {
  let uri;
  try {
    uri = new URL(raw);
  } catch {
    return false;
  }
  return (
    uri.protocol === "http:" &&
    (uri.hostname === "127.0.0.1" || uri.hostname === "localhost") &&
    uri.pathname === "/api/auth/callback"
  );
}

/** RFC 7636 §4.6 — the other half of `codeChallenge` in `src/lib/identity/pkce.ts`. */
function verifierMatches(verifier, challenge) {
  if (typeof verifier !== "string" || verifier === "") return false;
  // base64url, **unpadded**: `digest("base64url")` already is, and pkce.ts
  // strips its own padding. A padded comparison here would refuse every correct
  // exchange, with `invalid_grant` as the only clue.
  return (
    createHash("sha256").update(verifier).digest("base64url") === challenge
  );
}

function back(redirectUri, params) {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function json(res, status, body) {
  res.setHeader("content-type", "application/json");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function text(res, status, body) {
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.writeHead(status);
  res.end(body);
}

export { CLIENT_ID, ISSUER, PORT };
