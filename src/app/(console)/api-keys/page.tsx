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
 * This deployment-wide surface stays admin-only in plan 69 slice 1. A refused
 * collection read hides its entry point; SurfaceGuard explains the refusal at
 * direct URLs. It is not evidence that the deployment lacks the feature.
 */
export default function ApiKeysPage() {
  const keys = useApiKeys();
  if (keys.error && isUnimplemented(keys.error))
    return <UnavailableSurface surface="api-keys" />;

  return (
    <div>
      <PageHeader
        title="API Keys"
        subtitle="API keys carry full management authority and stay active after the person who created them is gone."
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
