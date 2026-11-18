"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  beginSignOut,
  getSignOutState,
  leaveAfterSignOut,
  type SignOutState,
  signOutUnconfirmed,
  subscribeToSignOut,
} from "@/lib/identity/signed-out";
import {
  assertOk,
  csrfHeaders,
  PlatformError,
  SessionPrincipalChangedError,
} from "@/lib/platform/http";
import { enterConsole } from "@/lib/platform/native";

const SIGN_OUT_TIMEOUT_MS = 5_000;

export function useSignOutState() {
  return useSyncExternalStore(
    subscribeToSignOut,
    getSignOutState,
    () => "idle" as const,
  );
}

export async function signOut() {
  if (!beginSignOut()) return;
  const request = new AbortController();
  const timer = window.setTimeout(() => request.abort(), SIGN_OUT_TIMEOUT_MS);
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: await csrfHeaders({ logoutSignal: request.signal }),
      redirect: "error",
      signal: request.signal,
    });
    await assertOk(response);
    const result = (await response.json()) as { ok?: boolean } | null;
    if (result?.ok !== true) throw new Error("Logout was not confirmed.");
  } catch (error) {
    if (!(error instanceof PlatformError && error.signedOut)) {
      signOutUnconfirmed(error instanceof SessionPrincipalChangedError);
      return;
    }
  } finally {
    window.clearTimeout(timer);
  }
  leaveAfterSignOut();
}

export function SignOutStatus({
  state,
}: {
  state: Exclude<SignOutState, "idle">;
}) {
  const pending = state === "pending";
  const accountChanged = state === "account-changed";
  return (
    <main
      className="flex min-h-screen flex-col items-start justify-center gap-4 self-center px-6 py-10"
      data-native-identity={
        pending
          ? "signing-out"
          : accountChanged
            ? "sign-out-account-changed"
            : "sign-out-unconfirmed"
      }
    >
      {pending ? (
        <p role="status">Signing out…</p>
      ) : accountChanged ? (
        <p role="alert">
          The signed-in account changed before sign-out could be confirmed.
          Reopen the console to review the current account.
        </p>
      ) : (
        <p role="alert">
          The platform could not confirm sign-out. Retry before leaving this
          device unattended.
        </p>
      )}
      {accountChanged ? (
        <Button type="button" onClick={enterConsole}>
          Reopen console
        </Button>
      ) : (
        <Button
          type="button"
          disabled={pending}
          data-testid="sign-out"
          onClick={() => void signOut()}
        >
          {pending ? "Sign out" : "Retry sign out"}
        </Button>
      )}
    </main>
  );
}
