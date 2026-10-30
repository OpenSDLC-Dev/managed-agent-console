"use client";

import { useQuery } from "@tanstack/react-query";
import { useLeaveConfirmation } from "./unsaved-changes";
import { useState } from "react";
import { beginSignOut, leaveAfterSignOut } from "@/lib/identity/signed-out";

import { csrfHeaders, isNativeConsole } from "@/lib/platform/http";
import { readAccount } from "@/lib/platform/native";

const SIGN_OUT_TIMEOUT_MS = 5_000;

export function SignedInAs() {
  const leave = useLeaveConfirmation();
  const [signingOut, setSigningOut] = useState(false);
  const { data } = useQuery({
    queryKey: ["console-session"],
    queryFn: readAccount,
    // Legacy profile metadata is stable for the page. Native authority is not:
    // another administrator can change the current role or deactivate us.
    staleTime: isNativeConsole() ? 0 : Infinity,
    gcTime: isNativeConsole() ? 0 : Infinity,
    refetchInterval: isNativeConsole() ? 15_000 : false,
    retry: 1,
  });

  if (!data?.signed_in) return null;
  // A provider need not release either claim; the fallback still gives the
  // operator the control they came for.
  const label =
    data.name || data.email || data.login_name || data.id || "Signed in";

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
        ...(isNativeConsole()
          ? { headers: await csrfHeaders(bound.signal) }
          : {}),
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
      className="px-4 py-3 text-[13px]"
      data-testid="signed-in-as"
      data-account={data.email || data.name || data.login_name || data.id}
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
      {isNativeConsole() && (
        <div
          className="text-[12px] text-muted-foreground"
          data-role={data.role}
        >
          {data.role}
        </div>
      )}
      {isNativeConsole() && data.role === "user" && (
        <a href="/setup" className="block text-xs underline">
          Redeem administrator setup code
        </a>
      )}
      <button
        type="button"
        onClick={() =>
          leave.requestLeave(() => {
            leave.setDirty(false);
            void signOut();
          })
        }
        disabled={signingOut}
        data-testid="sign-out"
        className="mt-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
