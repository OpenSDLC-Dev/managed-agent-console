"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, FilePlus2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import { CopyIdButton, IdCell } from "@/components/console/copy-id";
import {
  DetailSection,
  Field,
  FieldList,
  JsonBlock,
} from "@/components/console/detail";
import {
  Day,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  Time,
} from "@/components/console/bits";
import { MemoryContents } from "@/components/console/memory-contents";
import { useLeaveConfirmation } from "@/components/shell/unsaved-changes";
import { MemoryStoreActions } from "@/components/console/memory-store-actions";
import {
  useMemories,
  useMemoryStore,
  useMemoryVersions,
} from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { MemoryListItem, MemoryVersion } from "@/lib/platform/types";

const MEMORY_COLUMNS: Column<MemoryListItem>[] = [
  {
    key: "path",
    header: "Path",
    className: "w-full",
    cell: (item) => <span className="font-mono text-[13px]">{item.path}</span>,
  },
  {
    key: "type",
    header: "Type",
    cell: (item) => (item.type === "memory_prefix" ? "Folder" : "Memory"),
  },
  {
    key: "size",
    header: "Size",
    cell: (item) =>
      item.type === "memory"
        ? `${item.content_size_bytes.toLocaleString()} B`
        : "—",
  },
  {
    key: "updated",
    header: "Updated",
    cell: (item) =>
      item.type === "memory" ? <Day iso={item.updated_at} /> : "—",
  },
];

const VERSION_COLUMNS: Column<MemoryVersion>[] = [
  {
    key: "id",
    header: "Version",
    cell: (version) => <IdCell id={version.id} />,
  },
  {
    key: "path",
    header: "Path",
    className: "w-full",
    cell: (version) =>
      version.path ? (
        <span className="font-mono text-[13px]">{version.path}</span>
      ) : (
        "—"
      ),
  },
  {
    key: "operation",
    header: "Operation",
    cell: (version) => <Badge variant="outline">{version.operation}</Badge>,
  },
  {
    key: "created",
    header: "Created",
    cell: (version) => <Day iso={version.created_at} />,
  },
];

export default function MemoryStoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const leave = useLeaveConfirmation();
  const store = useMemoryStore(id);
  const [pathPrefix, setPathPrefix] = useState("/");
  const [queryPathPrefix, setQueryPathPrefix] = useState(pathPrefix);
  const [depth, setDepth] = useState<0 | 1>(1);
  const [operation, setOperation] = useState<
    "all" | "created" | "modified" | "deleted"
  >("all");
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setQueryPathPrefix(pathPrefix),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [pathPrefix]);
  const memoryPager = useCursorPage(`${id}:${queryPathPrefix}:${depth}`);
  const versionPager = useCursorPage(`${id}:${operation}`);
  const memories = useMemories(id, {
    page: memoryPager.page,
    path_prefix: queryPathPrefix,
    depth,
  });
  const versions = useMemoryVersions(id, {
    page: versionPager.page,
    operation: operation === "all" ? undefined : operation,
  });

  if (store.error && !store.data) return <ErrorState error={store.error} />;
  if (store.isPending || !store.data) return <DetailSkeleton />;
  const item = store.data;
  const archived = !!item.archived_at;

  return (
    <div>
      <Breadcrumb
        parent={{ href: "/memory-stores", label: "Memory stores" }}
        current={item.name}
      />
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Database className="size-4 shrink-0" />
            <h1 className="min-w-0 break-words text-[22px] font-medium leading-7">
              {item.name}
            </h1>
            <Badge
              variant="outline"
              data-status={archived ? "archived" : "active"}
            >
              {archived ? "Archived" : "Active"}
            </Badge>
          </div>
          {item.description && (
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {item.description}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              <code className="break-all">{item.id}</code>
              <CopyIdButton id={item.id} />
            </span>
            <span>
              Created <Time iso={item.created_at} />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-2">
          {!archived && (
            <>
              <Button
                size="sm"
                className="h-8"
                onClick={() =>
                  leave.requestLeave(() =>
                    router.push(`/memory-stores/${id}/memories/new`),
                  )
                }
              >
                <FilePlus2 className="size-4" /> Add memory
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  leave.requestLeave(() =>
                    router.push(`/memory-stores/${id}/edit`),
                  )
                }
              >
                <Pencil className="size-4" /> Edit
              </Button>
            </>
          )}
          <MemoryStoreActions store={item} />
        </div>
      </div>
      <MemoryContents storeId={id} archived={archived} />
      <details className="mb-6 rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Store details and version history
        </summary>
        <div className="pt-5">
          <DetailSection title="Overview">
            <FieldList>
              <Field label="ID">
                <IdCell id={item.id} />
              </Field>
              <Field label="Status">
                <span data-status={archived ? "archived" : "live"}>
                  {archived ? "Archived · read only" : "Live"}
                </span>
              </Field>
              <Field label="Created">
                <Time iso={item.created_at} />
              </Field>
              <Field label="Updated">
                <Time iso={item.updated_at} />
              </Field>
              {item.archived_at && (
                <Field label="Archived">
                  <Time iso={item.archived_at} />
                </Field>
              )}
            </FieldList>
          </DetailSection>
          <DetailSection title="Metadata">
            <JsonBlock value={item.metadata} />
          </DetailSection>
          <DetailSection title="Memories" testId="memory-list">
            <div className="flex flex-wrap items-center gap-2 pb-3">
              <Input
                aria-label="Path prefix"
                className="h-8 max-w-sm font-mono"
                value={pathPrefix}
                onChange={(event) => setPathPrefix(event.target.value)}
              />
              <Select
                value={String(depth)}
                onValueChange={(value) => setDepth(Number(value) as 0 | 1)}
              >
                <SelectTrigger aria-label="Memory depth" className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">One level</SelectItem>
                  <SelectItem value="0">Recursive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {memories.error ? (
              <ErrorState error={memories.error} />
            ) : (
              <>
                <DataTable
                  columns={MEMORY_COLUMNS}
                  rows={memories.data?.data ?? []}
                  rowKey={(memory) =>
                    memory.type === "memory" ? memory.id : memory.path
                  }
                  loading={memories.isPending}
                  onRowClick={(memory) =>
                    memory.type === "memory_prefix"
                      ? setPathPrefix(memory.path)
                      : router.push(
                          `/memory-stores/${id}/memories/${memory.id}`,
                        )
                  }
                  empty={
                    <EmptyState
                      title="No memories at this path"
                      hint="Create a memory or choose another prefix."
                    />
                  }
                />
                <Pager
                  hasPrev={memoryPager.hasPrev}
                  hasNext={!!memories.data?.next_page}
                  onPrev={memoryPager.goPrev}
                  onNext={() =>
                    memories.data?.next_page &&
                    memoryPager.goNext(memories.data.next_page)
                  }
                />
              </>
            )}
          </DetailSection>
          <DetailSection title="Version history" testId="memory-version-list">
            <div className="pb-3">
              <Select
                value={operation}
                onValueChange={(value) =>
                  setOperation(value as typeof operation)
                }
              >
                <SelectTrigger
                  aria-label="Version operation"
                  className="h-8 w-44"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All operations</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="modified">Modified</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {versions.error ? (
              <ErrorState error={versions.error} />
            ) : (
              <>
                <DataTable
                  columns={VERSION_COLUMNS}
                  rows={versions.data?.data ?? []}
                  rowKey={(version) => version.id}
                  loading={versions.isPending}
                  onRowClick={(version) =>
                    router.push(`/memory-stores/${id}/versions/${version.id}`)
                  }
                  empty={
                    <EmptyState
                      title="No versions yet"
                      hint="Memory changes appear here."
                    />
                  }
                />
                <Pager
                  hasPrev={versionPager.hasPrev}
                  hasNext={!!versions.data?.next_page}
                  onPrev={versionPager.goPrev}
                  onNext={() =>
                    versions.data?.next_page &&
                    versionPager.goNext(versions.data.next_page)
                  }
                />
              </>
            )}
          </DetailSection>
        </div>
      </details>
    </div>
  );
}
