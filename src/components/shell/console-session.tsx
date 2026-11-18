"use client";

import { createContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DetailSkeleton, ErrorState } from "@/components/console/bits";
import { readAccount } from "@/lib/platform/native";
import {
  hasBouncedToLogin,
  leaveIfPrincipalChanged,
} from "@/lib/identity/signed-out";
import { useLeaveConfirmation } from "./unsaved-changes";
import { SignOutStatus, useSignOutState } from "./sign-out";

export function useConsoleSession() {
  const leave = useLeaveConfirmation();
  const session = useQuery({
    queryKey: ["console-session"],
    queryFn: readAccount,
    // Native authority can change while this document remains open.
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 15_000,
    retry: 1,
  });
  useEffect(() => {
    if (
      session.data?.signed_in === true &&
      typeof session.data.id === "string" &&
      session.data.id
    ) {
      leaveIfPrincipalChanged(session.data.id, () => leave.setDirty(false));
    }
  }, [session.data?.signed_in, session.data?.id, leave]);
  return session;
}

export const ConsoleSessionContext = createContext<ReturnType<
  typeof useConsoleSession
> | null>(null);

export function ConsoleSessionBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NativeSessionBoundary>{children}</NativeSessionBoundary>;
}

function NativeSessionBoundary({ children }: { children: React.ReactNode }) {
  const session = useConsoleSession();
  const signOutState = useSignOutState();
  const [boundId, setBoundId] = useState<string>();
  const data = session.data;
  useEffect(() => {
    // The observer above confirms the document id before private children mount.
    // Keep this boundary mounted through errors, including the initial retry.
    // Admission needs a committed effect after the external document identity check.
    if (
      data?.signed_in === true &&
      typeof data.id === "string" &&
      data.id &&
      !hasBouncedToLogin()
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBoundId((initial) => initial ?? data.id);
    }
  }, [data?.signed_in, data?.id]);
  if (signOutState !== "idle") {
    return <SignOutStatus pending={signOutState === "pending"} />;
  }
  if (
    !boundId ||
    data?.signed_in !== true ||
    boundId !== data.id ||
    hasBouncedToLogin()
  ) {
    return (
      <main
        className="px-4 py-6 sm:px-8"
        data-native-identity={session.isError ? "error" : "loading"}
      >
        {session.isError ? (
          <ErrorState error={session.error} />
        ) : (
          <DetailSkeleton />
        )}
      </main>
    );
  }
  return (
    <ConsoleSessionContext.Provider value={session}>
      {children}
    </ConsoleSessionContext.Provider>
  );
}
