"use client";

import { use } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSkeleton, ErrorState } from "@/components/console/bits";
import { MemoryEditor } from "@/components/console/memory-editor";
import { useMemoryStore } from "@/lib/platform/queries";

export default function NewMemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const store = useMemoryStore(id);
  if (store.error) return <ErrorState error={store.error} />;
  if (store.isPending || !store.data) return <DetailSkeleton />;
  if (store.data.archived_at)
    return (
      <ErrorState error={new Error("Archived memory stores are read only.")} />
    );
  return (
    <div>
      <PageHeader
        title="Create memory"
        subtitle="Paths are absolute and unique within the store."
      />
      <MemoryEditor storeId={id} />
    </div>
  );
}
