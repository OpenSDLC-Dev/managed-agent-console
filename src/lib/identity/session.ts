import "server-only";

/**
 * The console's first stateful component — plan 08 D2, option (iv).
 *
 * An OIDC ID token is 800–2000 bytes and can pass 4 KB with group claims; a
 * refresh token adds more, and a browser caps a cookie at ~4096 bytes including
 * attributes. So the browser gets an **opaque handle** and the tokens stay here.
 * That removes the size ceiling, makes logout and refresh trivial (the cookie is
 * a handle, not the credential), and keeps the ID token out of the browser
 * altogether — the same reasoning that keeps the management key out of it.
 *
 * **What an in-memory map costs, stated rather than glossed:** it works for the
 * single-replica deployment we run (`deploy/k8s/deployment.yaml`), and nothing
 * else. Scaling past one replica needs a shared store, and **every deploy or pod
 * restart signs every operator out** — this console is redeployed on every merge
 * to `main`. Both are acceptable for a self-hosted operator console and neither
 * is a secret; a deployment that outgrows them replaces this module.
 *
 * Two maps, because the flow has two kinds of state with different threat
 * models. Pending authorizations are created by **anonymous** callers — the
 * login route has to be reachable before anyone is signed in — so that map is
 * capped and swept, or a loop over `/api/auth/login` is a memory exhaustion
 * with no credential required. Sessions are created only by a completed code
 * exchange, and are capped anyway.
 */

/** How long a browser has to come back from the identity provider. */
const PENDING_TTL_MS = 10 * 60 * 1000;

/**
 * Ceilings, not tuning knobs. Both are far above any real operator count for a
 * self-hosted console and far below anything that troubles a pod's memory.
 */
const MAX_PENDING = 512;
const MAX_SESSIONS = 512;

/** The opaque handle. Distinct from the password gate's `console_session`: the two can coexist (D3's third row) and must never be mistaken for each other. */
export const IDENTITY_COOKIE = "console_identity";

/** State carried across the redirect to the identity provider. */
export type PendingAuth = {
  verifier: string;
  nonce: string;
  /** Where to send the browser afterwards. Always a same-origin path. */
  returnTo: string;
  redirectUri: string;
  createdAt: number;
};

export type IdentitySession = {
  idToken: string;
  refreshToken?: string;
  /** Epoch ms. From the ID token's `exp`, which is the platform's own horizon. */
  expiresAt: number;
  subject: string;
  email?: string;
  name?: string;
};

const pending = new Map<string, PendingAuth>();
const sessions = new Map<string, IdentitySession>();

export function putPending(state: string, auth: PendingAuth): void {
  sweepPending(auth.createdAt);
  pending.set(state, auth);
}

/**
 * Reads a pending authorization **and removes it**, whatever the caller does
 * next. One authorization response per authorization request: without this a
 * replayed callback URL — which sits in browser history, in a referrer, in a
 * proxy log — would mint a second session from the same `state` and `nonce`.
 */
export function takePending(
  state: string,
  now: number,
): PendingAuth | undefined {
  const auth = pending.get(state);
  pending.delete(state);
  if (auth === undefined) return undefined;
  return now - auth.createdAt > PENDING_TTL_MS ? undefined : auth;
}

export function putSession(id: string, session: IdentitySession): void {
  sweepSessions(Date.now());
  sessions.set(id, session);
}

/** Reads a live session. An expired one is dropped rather than returned, so a caller cannot forget to check. */
export function getSession(
  id: string | undefined,
  now: number,
): IdentitySession | undefined {
  if (id === undefined) return undefined;
  const session = sessions.get(id);
  if (session === undefined) return undefined;
  if (session.expiresAt <= now) {
    sessions.delete(id);
    return undefined;
  }
  return session;
}

export function deleteSession(id: string | undefined): void {
  if (id !== undefined) sessions.delete(id);
}

/** Test seam: the maps are module state, and a test that leaked into the next one would be a false pass. */
export function resetIdentityStoreForTests(): void {
  pending.clear();
  sessions.clear();
}

function sweepPending(now: number): void {
  for (const [state, auth] of pending) {
    if (now - auth.createdAt > PENDING_TTL_MS) pending.delete(state);
  }
  // Insertion order is oldest-first, so the eviction is FIFO. It can discard a
  // sign-in that is still in flight, which is a login the operator retries —
  // the alternative is a map an anonymous caller can grow without limit.
  while (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next();
    if (oldest.done) break;
    pending.delete(oldest.value);
  }
}

function sweepSessions(now: number): void {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next();
    if (oldest.done) break;
    sessions.delete(oldest.value);
  }
}
