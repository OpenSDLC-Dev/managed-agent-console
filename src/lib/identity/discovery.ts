import "server-only";
import { type OidcConfig } from "./config";

/**
 * OIDC discovery: the three endpoints the console needs, read from the
 * provider's own document rather than guessed from the issuer.
 *
 * Guessing is what principle 1 forbids one layer down, and it is just as wrong
 * here: `/protocol/openid-connect/auth` (Keycloak), `/api/login/oauth/authorize`
 * (Casdoor) and `/o/oauth2/v2/auth` (Google) are three different answers to the
 * same question, and only the provider knows which.
 */

export type ProviderMetadata = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  endSessionEndpoint?: string;
  /** From `token_endpoint_auth_methods_supported`. Empty means the provider did not say, and OIDC's default applies. */
  tokenEndpointAuthMethods: string[];
};

export class DiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryError";
  }
}

const TIMEOUT_MS = 5000;
/** Generous for a real document (Google's is ~2 KB, Keycloak's ~6 KB); a ceiling for a broken or hostile endpoint. */
const MAX_BYTES = 128 * 1024;
/** Endpoints move on a provider upgrade, not on a request. */
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { at: number; metadata: ProviderMetadata }>();

export function resetDiscoveryCacheForTests(): void {
  cache.clear();
}

export async function discover(
  config: OidcConfig,
  now: number = Date.now(),
): Promise<ProviderMetadata> {
  const hit = cache.get(config.issuer);
  if (hit !== undefined && now - hit.at < CACHE_TTL_MS) return hit.metadata;

  // The issuer identifier is validated at config time to carry no query or
  // fragment, which is what makes this concatenation safe.
  const url = `${config.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // The URL is operator-configured and already public in `.env.example`, but
    // the cause is not quoted: a fetch failure's message can carry the resolved
    // address and the request's own headers.
    throw new DiscoveryError("the identity provider could not be reached");
  }
  if (!response.ok) {
    throw new DiscoveryError(
      `the identity provider's discovery document answered ${response.status}`,
    );
  }

  const document = parse(await readBounded(response));
  const metadata = validate(document, config.issuer);
  cache.set(config.issuer, { at: now, metadata });
  return metadata;
}

/** Reads at most MAX_BYTES, so a provider that streams without end costs a bounded amount rather than the pod. */
async function readBounded(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        throw new DiscoveryError(
          "the identity provider's discovery document is too large",
        );
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function parse(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DiscoveryError(
      "the identity provider's discovery document is not JSON",
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DiscoveryError(
      "the identity provider's discovery document is not an object",
    );
  }
  return value as Record<string, unknown>;
}

function validate(
  document: Record<string, unknown>,
  configuredIssuer: string,
): ProviderMetadata {
  // OIDC Discovery §4.3: the `issuer` in the document MUST be identical to the
  // one used to fetch it. Enforced because `iss` is compared as an exact string
  // everywhere downstream — including by the platform's verifier — so a
  // document claiming a different issuer describes a provider whose tokens this
  // deployment will reject, and failing here says why.
  const issuer = stringField(document, "issuer");
  if (issuer !== configuredIssuer) {
    throw new DiscoveryError(
      "the identity provider's discovery document names a different issuer than IDENTITY_OIDC_ISSUER",
    );
  }
  const metadata: ProviderMetadata = {
    issuer,
    authorizationEndpoint: endpoint(document, "authorization_endpoint"),
    tokenEndpoint: endpoint(document, "token_endpoint"),
    jwksUri: endpoint(document, "jwks_uri"),
    // Read rather than assumed: `client_secret_basic` and `client_secret_post`
    // are both common defaults across providers, and sending the wrong one is
    // an opaque 401 from the token endpoint at the end of a redirect dance.
    tokenEndpointAuthMethods: stringArray(
      document["token_endpoint_auth_methods_supported"],
    ),
  };
  const endSession = document["end_session_endpoint"];
  if (typeof endSession === "string" && endSession !== "") {
    metadata.endSessionEndpoint = endpoint(document, "end_session_endpoint");
  }
  return metadata;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function stringField(document: Record<string, unknown>, name: string): string {
  const value = document[name];
  if (typeof value !== "string" || value === "") {
    throw new DiscoveryError(
      `the identity provider's discovery document has no ${name}`,
    );
  }
  return value;
}

/**
 * Endpoints get the same scheme rule the issuer does — https, or http to a
 * loopback host, and never credentials in the URL. The document is fetched from
 * the operator's provider, but it is still remote input deciding where this
 * process sends a client secret and an authorization code.
 */
function endpoint(document: Record<string, unknown>, name: string): string {
  const raw = stringField(document, name);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DiscoveryError(
      `the identity provider's ${name} is not an absolute URL`,
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new DiscoveryError(
      `the identity provider's ${name} carries credentials in the URL`,
    );
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new DiscoveryError(
      `the identity provider's ${name} is not https (or http to a loopback host)`,
    );
  }
  return url.toString();
}
