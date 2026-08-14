"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { PlatformError } from "@/lib/platform/http";
import { toastPlatformError } from "@/lib/platform/toast-error";

interface MutationMeta {
  /** Set false when the mutation's error is fully surfaced inline. */
  errorToast?: boolean;
  /** Toast title naming the failed action, e.g. "Archive failed". */
  errorTitle?: string;
}

/** The two client errors whose answer can differ on a second attempt. */
const RETRYABLE_CLIENT_ERRORS = new Set([408, 429]);

/**
 * Retries the failure that might not repeat, and only that one.
 *
 * A dropped connection or a 502 from a restarting platform is worth a second
 * attempt. A **refusal is not a hiccup**: the platform's 403 is a decision
 * about the operator's role, and the 404/501 this console reads as "the
 * deployment has not implemented this surface" (`src/lib/platform/surfaces.ts`)
 * is a fact about the deployment. Retrying either doubles the request and makes
 * the operator wait out a backoff before the UI can say what happened —
 * measured against a real stack in plan 08 slice 5, where an admin-only page
 * fired four identical 403s and sat in a skeleton while it did.
 *
 * `failureCount` is the count *before* this failure (query-core's retryer
 * increments after the check), so `< 1` is the single retry this console has
 * always taken.
 */
export function retryUnlessSettled(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof PlatformError) {
    if (error.status === 501) return false;
    if (
      error.status >= 400 &&
      error.status < 500 &&
      !RETRYABLE_CLIENT_ERRORS.has(error.status)
    ) {
      return false;
    }
  }
  return true;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: retryUnlessSettled, staleTime: 5_000 },
        },
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            const meta = mutation.options.meta as MutationMeta | undefined;
            if (meta?.errorToast === false) return;
            toastPlatformError(error, meta?.errorTitle);
          },
        }),
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
