"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { beginSignOut, leaveAfterSignOut } from "@/lib/identity/signed-out";

/**
 * Who the operator is signed in as, and the only way out.
 *
 * It renders **nothing** on a deployment without identity — where the route
 * answers 404 — so the password-gated and open configurations keep the sidebar
 * they had. That is feature detection on the console's own surface rather than
 * the platform's, which is the honest shape here: the platform cannot be asked
 * whether this console runs SSO (see docs/wire-divergences.md).
 *
 * It shows **no role**, which is a divergence from the reference console and a
 * deliberate one — the platform has no route that would tell us (plan 08 D4).
 * Claiming a role we inferred would be exactly the second copy of the authority
 * rules that CLAUDE.md principle 5 forbids.
 */
type SessionInfo = { signed_in: boolean; email?: string; name?: string };

/** Long enough that a slow logout still completes; short enough to be a wait. */
const SIGN_OUT_TIMEOUT_MS = 5_000;

async function readSession(): Promise<SessionInfo | null> {
  const response = await fetch("/api/auth/session");
  // 404 is "this deployment has no identity", not a failure — and only 404.
  // Anything else that failed has to stay a failure: read as absence it would
  // be cached as one, and a single 502 from a restarting pod or the proxy in
  // front of it would take the account block — and with it the only Sign out
  // control — away for the life of the page.
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `the console session could not be read: ${response.status}`,
    );
  }
  return (await response.json()) as SessionInfo;
}

export function SignedInAs() {
  const [signingOut, setSigningOut] = useState(false);
  const { data } = useQuery({
    queryKey: ["console-session"],
    queryFn: readSession,
    // A deployment's identity configuration cannot change without a restart
    // that ends this page's session anyway, so a *successful* answer is good
    // for the life of the page and never refetches on focus. A failed one is
    // not: it retries, and stays stale so returning to the tab tries again.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  if (!data?.signed_in) return null;
  // A provider need not release either claim; the fallback still gives the
  // operator the control they came for.
  const label = data.name ?? data.email ?? "Signed in";

  async function signOut() {
    setSigningOut(true);
    // Before the request, not after it: the POST destroys the session, so every
    // BFF call still in flight comes back marked signed-out, and the first one
    // to land would otherwise bounce to `/login?return_to=<this page>` — the
    // page the operator just chose to leave.
    beginSignOut();
    // The navigation happens whatever the POST says. If it failed, the server
    // session may still be alive — but leaving the operator on a console they
    // asked to leave, in front of whoever is next at the keyboard, is the worse
    // of the two outcomes, and the login page is where they can try again.
    //
    // Which is why the request is bounded. A refusal settles; a connection that
    // is accepted and then answered by nobody does not, and an unbounded await
    // here would strand the operator on the console with the button they used
    // now disabled — the exact failure the paragraph above refuses to accept,
    // arrived at by waiting instead of by erroring.
    const bound = new AbortController();
    const timer = window.setTimeout(() => bound.abort(), SIGN_OUT_TIMEOUT_MS);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        signal: bound.signal,
      });
    } catch {
      // Offline, refused, or timed out: all three end the same way.
    } finally {
      window.clearTimeout(timer);
      leaveAfterSignOut();
    }
  }

  return (
    <div
      className="border-t border-sidebar-border px-4 py-3 text-[13px]"
      data-testid="signed-in-as"
      data-account={data.email ?? data.name}
    >
      {/* 14px/500 over a 12px muted line is the reference's own account block,
          measured 2026-08-14; only what the second line *says* diverges. */}
      <div
        className="truncate text-sm font-medium text-sidebar-foreground"
        title={label}
      >
        {label}
      </div>
      {data.name && data.email && (
        <div className="truncate text-[12px] text-muted-foreground">
          {data.email}
        </div>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={signingOut}
        data-testid="sign-out"
        className="mt-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
