"use client";

import { useContext } from "react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { UnavailableSurface } from "@/components/console/bits";
import { CreateKeyButton } from "@/components/console/api-keys";
import { ApiKeysTable } from "@/components/console/api-key-list";
import { useApiKeys } from "@/lib/platform/queries";
import { isUnimplemented, useSurfaces } from "@/lib/platform/surfaces";

/**
 * Owned API keys for a CLI, SDK or CI job. Browser calls use the session cookie.
 *
 * The server scopes native developer lists to their own owned rows; admins
 * list all. SurfaceGuard preserves the server's refusal at direct URLs.
 */
export default function ApiKeysPage() {
  const keys = useApiKeys();
  const session = useContext(ConsoleSessionContext)?.data;
  const usage = useSurfaces()?.usage;
  if (keys.error && isUnimplemented(keys.error))
    return <UnavailableSurface surface="api-keys" />;

  return (
    <ApiKeysTable
      key={`${session?.id}:${session?.role}`}
      keys={keys.data ?? []}
      loading={keys.isPending}
      error={keys.error}
      action={<CreateKeyButton />}
      canViewCost={
        session?.signed_in === true &&
        (session.role === "admin" || session.role === "developer") &&
        usage?.status === "available"
      }
    />
  );
}
