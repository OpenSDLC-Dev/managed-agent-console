"use client";

import { createContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DetailSkeleton, ErrorState } from "@/components/console/bits";
import { isNativeConsole } from "@/lib/platform/http";
import { readAccount } from "@/lib/platform/native";
import {
  hasBouncedToLogin,
  leaveIfPrincipalChanged,
} from "@/lib/identity/signed-out";
import { useLeaveConfirmation } from "./unsaved-changes";

export function useConsoleSession() {
  const leave = useLeaveConfirmation();
  const session = useQuery({
    queryKey: ["console-session"],
    queryFn: readAccount,
    // Native authority can change while this document remains open.
    staleTime: isNativeConsole() ? 0 : Infinity,
    gcTime: isNativeConsole() ? 0 : Infinity,
    refetchInterval: isNativeConsole() ? 15_000 : false,
    retry: 1,
  });
  useEffect(() => {
    if (isNativeConsole() && session.data?.signed_in && session.data.id) {
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
  native,
}: {
  children: React.ReactNode;
  native: boolean;
}) {
  // Legacy pages intentionally do not wait for optional account metadata.
  return native ? (
    <NativeSessionBoundary>{children}</NativeSessionBoundary>
  ) : (
    children
  );
}

function NativeSessionBoundary({ children }: { children: React.ReactNode }) {
  const session = useConsoleSession();
  const [boundId, setBoundId] = useState<string>();
  const data = session.data;
  useEffect(() => {
    // The observer above confirms the document id before private children mount.
    // Keep this boundary mounted through errors, including the initial retry.
    // Admission needs a committed effect after the external document identity check.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.signed_in && data.id && !hasBouncedToLogin()) setBoundId(data.id);
  }, [data?.signed_in, data?.id]);
  if (!boundId || boundId !== data?.id || hasBouncedToLogin()) {
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
