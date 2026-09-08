"use client";

import { use } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSkeleton, ErrorState } from "@/components/console/bits";
import { MemoryEditor } from "@/components/console/memory-editor";
import { useMemory, useMemoryStore } from "@/lib/platform/queries";

export default function EditMemoryPage({
  params,
}: {
  params: Promise<{ id: string; memoryId: string }>;
}) {
  const { id, memoryId } = use(params);
  const memory = useMemory(id, memoryId);
  const store = useMemoryStore(id);
  if (memory.error) return <ErrorState error={memory.error} />;
  if (store.error) return <ErrorState error={store.error} />;
  if (memory.isPending || store.isPending || !memory.data || !store.data)
    return <DetailSkeleton />;
  if (store.data.archived_at)
    return (
      <ErrorState error={new Error("Archived memory stores are read only.")} />
    );
  return (
    <div>
      <PageHeader
        title={`Edit ${memory.data.path}`}
        subtitle="The current digest is sent as an optimistic concurrency precondition."
      />
      <MemoryEditor
        key={memory.data.memory_version_id}
        storeId={id}
        memory={memory.data}
      />
    </div>
  );
}
