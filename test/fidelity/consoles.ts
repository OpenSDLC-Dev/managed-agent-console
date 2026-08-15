/**
 * Where each console configuration the fidelity pass walks lives, named once.
 *
 * The pass drives more than one deployment now (#99): the same build over the
 * same mock platform, differing only in how an operator gets in. So a base URL
 * can no longer be a single `use.baseURL`, and the ports live here rather than
 * in the Playwright config because three files need them — the config declares
 * the servers, the walker navigates to them, and the manifest test checks route
 * coverage against the console the design reference was extracted from.
 *
 * The tiers' existing rule is "the ones digit is the tier" (0 e2e, 1 fidelity);
 * this extends it with "the tens digit is which server of that kind". 3110 and
 * 18090 are the e2e tier's slots for the same two servers, unclaimed today.
 */

export const MOCK_PORT = 18081;
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

/**
 * The stub identity provider (`test/mock-platform/oidc.mjs`), which shares the
 * mock platform's process but binds its own port.
 *
 * Its own port on purpose: a real deployment's issuer is not its platform, and
 * an issuer that happened to be the same origin as `PLATFORM_BASE_URL` would let
 * a console that confused the two keep passing.
 */
export const IDP_PORT = 18091;

/**
 * Byte-identical to the console's `IDENTITY_OIDC_ISSUER`, which is why both
 * processes are handed this one constant: `discover()` compares the discovery
 * document's `issuer` to the configured one as an exact string (OIDC Discovery
 * §4.3), so a trailing slash on one side alone is a sign-in that never starts
 * while every fetch still succeeds.
 */
export const IDP_ISSUER = `http://127.0.0.1:${IDP_PORT}`;

/** Also the ID token's `aud`, which `verifyIdToken` requires to equal the client id. */
export const IDP_CLIENT_ID = "managed-agent-console";

/**
 * One `next start` per console configuration that has a surface.
 *
 * The keys are the `mode` vocabulary itself — a separately declared union would
 * be the same fact written twice, and the two would drift the first time a row
 * was added. Adding a configuration is one entry here plus a `webServer` block.
 *
 * Deliberately no `sso+password` row. Both gates at once is a configuration this
 * deployment does not run, so its login page is not a surface anyone would be
 * comparing against anything (Henry, 2026-08-15).
 */
export const CONSOLE_PORTS = {
  password: 3101,
  sso: 3111,
} as const;

export type ConsoleMode = keyof typeof CONSOLE_PORTS;

/** What a surface with no `mode` is shot against: the deployment the reference facts were extracted from. */
export const DEFAULT_MODE: ConsoleMode = "password";

/**
 * Cookies ignore ports, so both consoles share the host `127.0.0.1` in the
 * browser's jar — a session minted against one is sent to the other. Harmless
 * today because Playwright gives every test a fresh context and no test visits
 * two consoles; a test that ever does must clear cookies between them, the way
 * the signed-out login shots already do.
 */
export const consoleUrl = (mode: ConsoleMode = DEFAULT_MODE) =>
  `http://127.0.0.1:${CONSOLE_PORTS[mode]}`;
