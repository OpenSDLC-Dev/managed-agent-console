"use client";

import { PageHeader } from "@/components/shell/page-header";
import { UnavailableSurface } from "@/components/console/bits";
import { ApiKeysTable, CreateKeyButton } from "@/components/console/api-keys";
import { useApiKeys } from "@/lib/platform/queries";
import { isUnimplemented } from "@/lib/platform/surfaces";

/**
 * Management keys — the credential the console itself runs on when identity is
 * off, and the one an operator hands to a CLI or a CI job.
 *
 * The server scopes native developer lists to their own owned rows; admins
 * list all. SurfaceGuard preserves the server's refusal at direct URLs.
 */
export default function ApiKeysPage() {
  const keys = useApiKeys();
  if (keys.error && isUnimplemented(keys.error))
    return <UnavailableSurface surface="api-keys" />;

  return (
    <div>
      <PageHeader
        title="API Keys"
        subtitle="Owned keys use their owner’s current role and stop working when the owner is deactivated. Unowned keys retain legacy authority."
        actions={<CreateKeyButton />}
      />
      <ApiKeysTable
        keys={keys.data ?? []}
        loading={keys.isPending}
        error={keys.error}
      />
    </div>
  );
}
