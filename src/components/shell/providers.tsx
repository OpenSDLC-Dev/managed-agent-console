"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { toastPlatformError } from "@/lib/platform/toast-error";

interface MutationMeta {
  /** Set false when the mutation's error is fully surfaced inline. */
  errorToast?: boolean;
  /** Toast title naming the failed action, e.g. "Archive failed". */
  errorTitle?: string;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
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
