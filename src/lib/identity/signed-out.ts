/** The platform marks lost sessions; an unmarked 401 or role refusal is not sign-out. */

export const SIGNED_OUT_HEADER = "x-platform-signed-out";

export function isSignedOut(response: {
  headers: { get(name: string): string | null };
}): boolean {
  return response.headers.get(SIGNED_OUT_HEADER) === "1";
}

/**
 * Whether this browser has already been sent to the login page.
 *
 * A page holds several queries at once and they fail together, so without this
 * a single expired session would fire one navigation per in-flight request.
 * Module state is the right scope: it lives exactly as long as the document
 * that is on its way out.
 */
let bouncing = false;

/**
 * Whether the operator asked to leave, as opposed to being sent.
 *
 * Set *before* the request that signs them out, because that request is what
 * makes the race possible: destroying the session turns every private call still in
 * flight into a marked 401, and the first one back would otherwise bounce —
 * carrying a `return_to` for the very page the operator chose to leave, so the
 * next sign-in would land them back on it. Their intent outranks that inference.
 */
type SignOutState = "idle" | "pending" | "unconfirmed";
let signOutState: SignOutState = "idle";
const signOutListeners = new Set<() => void>();

export function subscribeToSignOut(listener: () => void): () => void {
  signOutListeners.add(listener);
  return () => signOutListeners.delete(listener);
}

export function getSignOutState(): SignOutState {
  return signOutState;
}

function setSignOutState(state: SignOutState): void {
  signOutState = state;
  for (const listener of signOutListeners) listener();
}

// The account observer can remount or share its query with another consumer.
// Keep the confirmed native principal for this document, not for one observer.
let confirmedPrincipalId: string | undefined;

export function getDocumentPrincipalId(): string | undefined {
  return confirmedPrincipalId;
}

/** Test seam — the flags above outlive a single test otherwise. */
export function resetSignedOutBounceForTests(): void {
  bouncing = false;
  setSignOutState("idle");
  confirmedPrincipalId = undefined;
}

/** Records the operator's intent before the sign-out request goes out. */
export function beginSignOut(): boolean {
  if (signOutState === "pending") return false;
  setSignOutState("pending");
  return true;
}

export function signOutUnconfirmed(): void {
  setSignOutState("unconfirmed");
}

/**
 * Whether a bounce is already under way.
 *
 * Asked by loops that retry on failure. `bounceToLogin` starts a navigation but
 * cannot stop a `setTimeout` that is already scheduled, so a retry loop has to
 * check for itself that the thing it is retrying is a sign-in and not an outage.
 */
export function hasBouncedToLogin(): boolean {
  return bouncing;
}

/**
 * Sends the browser to the login page, remembering where it was.
 *
 * A **full navigation**, deliberately, and Next's lint rule is disabled for it
 * rather than worked around. Two reasons a router push is the wrong call here.
 * Everything React is holding — every query cache entry, every open stream —
 * was fetched as an operator who no longer exists, and a soft navigation keeps
 * all of it; a reload is the cheapest way to be certain none survives the next
 * sign-in. And this runs from `assertOk` and from the trace loop, neither of
 * which is a component or a hook, so there is no router to reach without
 * threading one through every call site that can fail.
 */
export function bounceToLogin(): void {
  if (typeof window === "undefined" || bouncing || signOutState !== "idle")
    return;
  const { pathname, search } = window.location;
  if (pathname === "/login") return;
  leave(`/login?return_to=${encodeURIComponent(`${pathname}${search}`)}`);
}

/**
 * Leaves for the login page after an operator signs **out**, which is the other
 * way a console session ends.
 *
 * No `return_to`: someone who signed out deliberately is not asking to be put
 * back, and remembering the page would make the next sign-in land on the thing
 * they may have signed out to leave — in front of whoever is at the keyboard.
 *
 * Unguarded by `bouncing`, unlike the automatic path: this *is* the departure
 * the operator asked for, and if something already started one it was an
 * inference about a session that this request had just ended on purpose.
 */
export function leaveAfterSignOut(): void {
  if (typeof window === "undefined") return;
  leave("/login");
}

/** A shared cookie can change accounts without ending the old server session. */
export function leaveIfPrincipalChanged(
  id: string,
  discardDraft: () => void,
): void {
  if (typeof window === "undefined" || bouncing || signOutState !== "idle")
    return;
  if (confirmedPrincipalId === undefined) {
    confirmedPrincipalId = id;
    return;
  }
  if (confirmedPrincipalId === id) return;
  // This draft belongs to the old actor. An unload prompt must not retain it.
  discardDraft();
  leave(new URL("/", window.location.origin).href);
}

function leave(target: string): void {
  bouncing = true;
  // A full navigation, deliberately — see `bounceToLogin`. Next's
  // no-location-assign rule does not fire here because the destination is a
  // variable rather than a literal; that is an accident of the rule, not the
  // reason, and the reason is written above.
  window.location.assign(target);
}
