"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  EmptyState,
  ErrorState,
  IdCode,
  Time,
} from "@/components/console/bits";
import { Badge } from "@/components/ui/badge";
import { useFiles } from "@/lib/platform/queries";
import type { PlatformFile } from "@/lib/platform/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const COLUMNS: Column<PlatformFile>[] = [
  { key: "id", header: "ID", cell: (f) => <IdCode id={f.id} /> },
  {
    key: "filename",
    header: "Filename",
    className: "w-full",
    cell: (f) => f.filename,
  },
  {
    key: "mime",
    header: "Type",
    cell: (f) => (
      <span className="font-mono text-[12px] text-muted-foreground">
        {f.mime_type}
      </span>
    ),
  },
  { key: "size", header: "Size", cell: (f) => formatBytes(f.size_bytes) },
  {
    key: "scope",
    header: "Scope",
    cell: (f) =>
      f.scope ? (
        <Badge variant="outline" className="font-normal">
          session output
        </Badge>
      ) : (
        <span className="text-muted-foreground">upload</span>
      ),
  },
  {
    key: "downloadable",
    header: "Downloadable",
    // Management-lane downloads of plain uploads 400 on the platform
    // (downloadable:false) — surface the flag instead of a dead button.
    cell: (f) => (f.downloadable ? "yes" : "no"),
  },
  {
    key: "created",
    header: "Created",
    cell: (f) => <Time iso={f.created_at} />,
  },
];

export default function FilesPage() {
  // Classic Files pagination: forward via after_id, back via a client stack.
  const [after, setAfter] = useState<{
    current?: string;
    stack: (string | undefined)[];
  }>({ stack: [] });
  const { data, error, isPending } = useFiles(after.current);

  return (
    <div>
      <PageHeader
        title="Files"
        subtitle="Uploads and session outputs available as session mounts."
      />
      {error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            rows={data?.data ?? []}
            rowKey={(f) => f.id}
            loading={isPending}
            empty={
              <EmptyState
                title="No files yet"
                hint="Files are uploaded through the API until slice 4 lands."
              />
            }
          />
          <Pager
            hasPrev={after.stack.length > 0}
            hasNext={!!data?.has_more}
            onPrev={() =>
              setAfter((s) => ({
                current: s.stack[s.stack.length - 1],
                stack: s.stack.slice(0, -1),
              }))
            }
            onNext={() =>
              data?.last_id &&
              setAfter((s) => ({
                current: data.last_id ?? undefined,
                stack: [...s.stack, s.current],
              }))
            }
          />
        </>
      )}
    </div>
  );
}
