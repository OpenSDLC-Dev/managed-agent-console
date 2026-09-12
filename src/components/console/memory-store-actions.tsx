"use client";

import { useRouter } from "next/navigation";
import { ResourceActions } from "@/components/console/resource-actions";
import {
  useArchiveMemoryStore,
  useDeleteMemoryStore,
} from "@/lib/platform/queries";
import type { MemoryStore } from "@/lib/platform/types";

export function MemoryStoreActions({
  store,
  onDeleted,
}: {
  store: MemoryStore;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const archive = useArchiveMemoryStore(store.id);
  const remove = useDeleteMemoryStore(store.id);
  return (
    <ResourceActions
      resource="memory store"
      archived={!!store.archived_at}
      archiveWarning="Existing memories remain readable, but no content can be changed."
      deleteDescription="Deleting permanently removes the store, every memory, and all version history."
      onArchive={store.archived_at ? undefined : () => archive.mutate()}
      onDelete={() =>
        remove.mutate(undefined, {
          onSuccess: () =>
            onDeleted ? onDeleted() : router.push("/memory-stores"),
        })
      }
      archivePending={archive.isPending}
      deletePending={remove.isPending}
    />
  );
}
