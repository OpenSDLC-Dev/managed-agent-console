"use client";

import { PageHeader } from "@/components/shell/page-header";
import {
  MemoryStoreEditor,
  newMemoryStoreForm,
} from "@/components/console/memory-store-editor";

export default function NewMemoryStorePage() {
  return (
    <div>
      <PageHeader
        title="Create memory store"
        subtitle="Create durable memory that sessions can share."
      />
      <MemoryStoreEditor mode="create" initial={newMemoryStoreForm()} />
    </div>
  );
}
