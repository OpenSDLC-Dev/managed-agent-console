/**
 * How the BFF tells the browser that the operator's console session is over.
 *
 * **The status code alone cannot say it.** A 401 also arrives when the platform
 * refuses the *management* key — a mistyped `PLATFORM_API_KEY` on a deployment
 * with identity off — and bouncing that operator to `/login` would walk them
 * through a sign-in that cannot fix it, or around a redirect loop on a
 * deployment whose `/login` is the password form. So the BFF marks the one case
 * it authored, and the browser reads the marker rather than inferring from the
 * status.
 *
 * **A header rather than a body field**, because the proxy streams upstream
 * bodies through untouched — SSE depends on that — so the trace reader sees
 * response headers and never a parsed envelope. One signal both call sites read.
 *
 * This is the only module under `src/lib/identity/` without `server-only`: it is
 * the contract *between* the two runtimes rather than a piece of either.
 */

export const SIGNED_OUT_HEADER = "x-console-signed-out";

export function isSignedOut(response: {
  headers: { get(name: string): string | null };
}): boolean {
  return response.headers.get(SIGNED_OUT_HEADER) !== null;
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
 * makes the race possible: destroying the session turns every BFF call still in
 * flight into a marked 401, and the first one back would otherwise bounce —
 * carrying a `return_to` for the very page the operator chose to leave, so the
 * next sign-in would land them back on it. Their intent outranks that inference.
 */
let leavingDeliberately = false;

/** Test seam — the flags above outlive a single test otherwise. */
export function resetSignedOutBounceForTests(): void {
  bouncing = false;
  leavingDeliberately = false;
}

/** Records the operator's intent before the sign-out request goes out. */
export function beginSignOut(): void {
  leavingDeliberately = true;
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
  if (typeof window === "undefined" || bouncing || leavingDeliberately) return;
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

function leave(target: string): void {
  bouncing = true;
  // A full navigation, deliberately — see `bounceToLogin`. Next's
  // no-location-assign rule does not fire here because the destination is a
  // variable rather than a literal; that is an accident of the rule, not the
  // reason, and the reason is written above.
  window.location.assign(target);
}
