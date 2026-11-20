"use client";

import { useLeaveConfirmation } from "./unsaved-changes";
import { useContext } from "react";
import { LogOut } from "lucide-react";
import { ConsoleSessionContext, useConsoleSession } from "./console-session";
import { SignOutStatus, signOut, useSignOutState } from "./sign-out";

type Session = ReturnType<typeof useConsoleSession>;

export function accountLabel(data: NonNullable<Session["data"]>) {
  return data.name || data.email || data.login_name || data.id || "Signed in";
}

export function SignedInAs({ children }: { children?: React.ReactNode }) {
  const session = useContext(ConsoleSessionContext);
  return session ? (
    <Account session={session}>{children}</Account>
  ) : (
    <ObservedAccount>{children}</ObservedAccount>
  );
}

function ObservedAccount({ children }: { children?: React.ReactNode }) {
  const session = useConsoleSession();
  const signOutState = useSignOutState();
  return signOutState === "idle" ? (
    <Account session={session}>{children}</Account>
  ) : (
    <SignOutStatus state={signOutState} />
  );
}

function Account({
  session,
  children,
}: {
  session: Session;
  children?: React.ReactNode;
}) {
  const leave = useLeaveConfirmation();
  const { data } = session;

  if (!data?.signed_in) return null;
  // A provider need not release either claim; the fallback still gives the
  // operator the control they came for.
  const label = accountLabel(data);

  return (
    <div
      data-testid="signed-in-as"
      data-account={data.email || data.name || data.login_name || data.id}
    >
      <div className="px-3 py-2">
        <div className="truncate text-sm font-medium" title={label}>
          {label}
        </div>
        {data.name && data.email && (
          <div className="truncate text-xs text-muted-foreground">
            {data.email}
          </div>
        )}
        <div className="text-xs text-muted-foreground">{data.role}</div>
        {data.role === "user" && (
          <a href="/setup" className="block text-xs underline">
            Redeem administrator setup code
          </a>
        )}
      </div>
      {children}
      <button
        type="button"
        onClick={() =>
          leave.requestLeave(() => {
            leave.setDirty(false);
            void signOut();
          })
        }
        data-testid="sign-out"
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
      >
        <LogOut aria-hidden className="size-4" />
        Sign out
      </button>
    </div>
  );
}
