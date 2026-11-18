"use client";

import { useLeaveConfirmation } from "./unsaved-changes";
import { useContext } from "react";
import { ConsoleSessionContext, useConsoleSession } from "./console-session";
import { SignOutStatus, signOut, useSignOutState } from "./sign-out";

export function SignedInAs() {
  const session = useContext(ConsoleSessionContext);
  return session ? <Account session={session} /> : <ObservedAccount />;
}

function ObservedAccount() {
  const session = useConsoleSession();
  const signOutState = useSignOutState();
  return signOutState === "idle" ? (
    <Account session={session} />
  ) : (
    <SignOutStatus pending={signOutState === "pending"} />
  );
}

function Account({
  session,
}: {
  session: ReturnType<typeof useConsoleSession>;
}) {
  const leave = useLeaveConfirmation();
  const { data } = session;

  if (!data?.signed_in) return null;
  // A provider need not release either claim; the fallback still gives the
  // operator the control they came for.
  const label =
    data.name || data.email || data.login_name || data.id || "Signed in";

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
      <div className="text-[12px] text-muted-foreground" data-role={data.role}>
        {data.role}
      </div>
      {data.role === "user" && (
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
        data-testid="sign-out"
        className="mt-1 text-muted-foreground hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}
