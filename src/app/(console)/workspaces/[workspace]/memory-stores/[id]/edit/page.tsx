"use client";

import { use } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSkeleton, ErrorState } from "@/components/console/bits";
import {
  MemoryStoreEditor,
  memoryStoreForm,
} from "@/components/console/memory-store-editor";
import { useMemoryStore } from "@/lib/platform/queries";

export default function EditMemoryStorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const query = useMemoryStore(id);
  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending || !query.data) return <DetailSkeleton />;
  if (query.data.archived_at)
    return (
      <ErrorState error={new Error("Archived memory stores are read only.")} />
    );
  return (
    <div>
      <PageHeader
        title={`Edit ${query.data.name}`}
        subtitle="Name changes affect mount paths only for future sessions."
      />
      <MemoryStoreEditor
        key={query.data.updated_at}
        mode="edit"
        storeId={id}
        initial={memoryStoreForm(query.data)}
      />
    </div>
  );
}
