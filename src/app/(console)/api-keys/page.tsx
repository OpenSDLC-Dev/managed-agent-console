"use client";

import { PageHeader } from "@/components/shell/page-header";
import { UnavailableSurface } from "@/components/console/bits";
import { ApiKeysTable } from "@/components/console/api-keys";
import { useApiKeys } from "@/lib/platform/queries";
import { isUnimplemented } from "@/lib/platform/surfaces";

/**
 * Management keys — the credential the console itself runs on when identity is
 * off, and the one an operator hands to a CLI or a CI job.
 *
 * The surface is admin-only on the platform, so in identity mode a viewer's
 * request answers **403** rather than 404: the page stays, and the denial reads
 * as a denial (plan 08 slice 4) rather than as a deployment that lacks the
 * feature. That distinction is the whole reason `isUnimplemented` requires the
 * platform's own `not_found_error` and not merely a status.
 */
export default function ApiKeysPage() {
  const keys = useApiKeys();
  if (keys.error && isUnimplemented(keys.error))
    return <UnavailableSurface surface="api-keys" />;

  return (
    <div>
      <PageHeader
        title="API keys"
        subtitle="API keys carry full management authority and stay active after the person who created them is gone."
      />
      <ApiKeysTable
        keys={keys.data ?? []}
        loading={keys.isPending}
        error={keys.error}
      />
    </div>
  );
}
