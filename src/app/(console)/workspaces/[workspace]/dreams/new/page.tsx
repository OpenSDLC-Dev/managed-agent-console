"use client";

import { DreamEditor } from "@/components/console/dream-editor";
import { PageHeader } from "@/components/shell/page-header";

export default function NewDreamPage() {
  return (
    <div>
      <PageHeader
        title="Create dream"
        subtitle="Consolidate one memory store with context from existing sessions."
      />
      <DreamEditor />
    </div>
  );
}
