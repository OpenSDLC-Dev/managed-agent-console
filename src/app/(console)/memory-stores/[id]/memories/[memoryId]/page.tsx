"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { ResourceActions } from "@/components/console/resource-actions";
import { IdCell } from "@/components/console/copy-id";
import { DetailSection, Field, FieldList } from "@/components/console/detail";
import { DetailSkeleton, ErrorState, Time } from "@/components/console/bits";
import {
  useDeleteMemory,
  useMemory,
  useMemoryStore,
} from "@/lib/platform/queries";

export default function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string; memoryId: string }>;
}) {
  const { id, memoryId } = use(params);
  const router = useRouter();
  const memory = useMemory(id, memoryId);
  const store = useMemoryStore(id);
  const remove = useDeleteMemory(id, memoryId);
  if (memory.error) return <ErrorState error={memory.error} />;
  if (store.error) return <ErrorState error={store.error} />;
  if (memory.isPending || store.isPending || !memory.data || !store.data)
    return <DetailSkeleton />;
  const item = memory.data;
  const archived = !!store.data.archived_at;
  return (
    <div>
      <Breadcrumb
        parent={{ href: `/memory-stores/${id}`, label: "Memory store" }}
        current={item.path}
      />
      <PageHeader
        title={item.path}
        subtitle={item.id}
        actions={
          <span className="flex items-center gap-2">
            {!archived && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  router.push(`/memory-stores/${id}/memories/${memoryId}/edit`)
                }
              >
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            {!archived && (
              <ResourceActions
                resource="memory"
                deleteDescription="Deleting removes the live memory. Its version history remains until the store is deleted."
                onDelete={() =>
                  remove.mutate(item.content_sha256, {
                    onSuccess: () => router.push(`/memory-stores/${id}`),
                  })
                }
                deletePending={remove.isPending}
              />
            )}
          </span>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={item.id} />
          </Field>
          <Field label="Store">
            <IdCell id={item.memory_store_id} />
          </Field>
          <Field label="Head version">
            <IdCell id={item.memory_version_id} />
          </Field>
          <Field label="Size">
            {item.content_size_bytes.toLocaleString()} bytes
          </Field>
          <Field label="SHA-256">
            <span className="break-all font-mono text-[12px]">
              {item.content_sha256}
            </span>
          </Field>
          <Field label="Created">
            <Time iso={item.created_at} />
          </Field>
          <Field label="Updated">
            <Time iso={item.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Content" testId="memory-content">
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border bg-card p-4 font-mono text-[13px] leading-relaxed">
          {item.content ?? ""}
        </pre>
      </DetailSection>
    </div>
  );
}
