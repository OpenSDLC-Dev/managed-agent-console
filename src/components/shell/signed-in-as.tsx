"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { leaveAfterSignOut } from "@/lib/identity/signed-out";

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

async function readSession(): Promise<SessionInfo | null> {
  const response = await fetch("/api/auth/session");
  // 404 is "this deployment has no identity", not a failure.
  if (!response.ok) return null;
  return (await response.json()) as SessionInfo;
}

export function SignedInAs() {
  const [signingOut, setSigningOut] = useState(false);
  const { data } = useQuery({
    queryKey: ["console-session"],
    queryFn: readSession,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!data?.signed_in) return null;
  // A provider need not release either claim; the fallback still gives the
  // operator the control they came for.
  const label = data.name ?? data.email ?? "Signed in";

  async function signOut() {
    setSigningOut(true);
    // The navigation happens whatever the POST says. If it failed, the server
    // session may still be alive — but leaving the operator on a console they
    // asked to leave, in front of whoever is next at the keyboard, is the worse
    // of the two outcomes, and the login page is where they can try again.
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    leaveAfterSignOut();
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
