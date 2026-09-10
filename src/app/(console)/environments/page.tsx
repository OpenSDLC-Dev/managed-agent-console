"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  Day,
  EmptyState,
  ErrorState,
  HostingType,
  UnavailableSurface,
} from "@/components/console/bits";
import { IdCell } from "@/components/console/copy-id";
import { ResourceActions } from "@/components/console/resource-actions";
import { CreateEnvironmentButton } from "@/components/console/create-environment-dialog";
import { ResourceInspector } from "@/components/console/resource-inspector";
import { EnvironmentDetail } from "@/components/console/environment-detail";
import { EnvironmentSelectionActions } from "@/components/console/environment-selection-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusFilter } from "@/components/console/status-filter";
import {
  useArchiveEnvironment,
  useDeleteEnvironment,
  useEnvironments,
} from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Environment } from "@/lib/platform/types";

function EnvironmentRowActions({ environment }: { environment: Environment }) {
  const archive = useArchiveEnvironment(environment.id);
  const remove = useDeleteEnvironment(environment.id);
  return (
    <ResourceActions
      resource="environment"
      archived={!!environment.archived_at}
      archiveWarning="Sessions can no longer be created in it."
      deleteDescription="Deleting is permanent and cannot be undone. The platform refuses if any session still references this environment."
      onArchive={environment.archived_at ? undefined : () => archive.mutate()}
      onDelete={() => remove.mutate()}
      archivePending={archive.isPending}
      deletePending={remove.isPending}
    />
  );
}

const COLUMNS: Column<Environment>[] = [
  { key: "id", header: "ID", cell: (e) => <IdCell id={e.id} /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (e) => e.name,
  },
  {
    key: "type",
    header: "Type",
    cell: (e) => <HostingType type={e.config.type} />,
  },
  {
    key: "updated",
    header: "Updated at",
    cell: (e) => <Day iso={e.updated_at} />,
  },
  {
    key: "archived",
    header: "Archived at",
    cell: (e) => (e.archived_at ? <Day iso={e.archived_at} /> : null),
  },
  {
    key: "actions",
    header: "Actions",
    cell: (e) => <EnvironmentRowActions environment={e} />,
  },
];

export default function EnvironmentsPage() {
  return (
    <Suspense>
      <EnvironmentsList />
    </Suspense>
  );
}

function EnvironmentsList() {
  const router = useRouter();
  const search = useSearchParams();
  const inspected = search.get("environment");
  const lookup = useRef<HTMLInputElement>(null);
  const inspect = (id?: string) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("environment", id);
    else params.delete("environment");
    router.push("/environments" + (params.size ? "?" + params : ""), {
      scroll: false,
    });
  };
  const [includeArchived, setIncludeArchived] = useState(false);
  const pager = useCursorPage(String(includeArchived));
  const { data, error, isPending, isPlaceholderData } = useEnvironments({
    page: pager.page,
    include_archived: includeArchived || undefined,
  });

  const rows = data?.data ?? [];
  const scope = String(includeArchived) + ":" + (pager.page ?? "");
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({
    scope,
    ids: [],
  });
  if (selection.scope !== scope) setSelection({ scope, ids: [] });
  const ids = selection.scope === scope ? selection.ids : [];
  const selectedRows = rows.filter((environment) =>
    ids.includes(environment.id),
  );
  const index = rows.findIndex((environment) => environment.id === inspected);
  const select = (ids: string[]) => setSelection({ scope, ids });
  const columns: Column<Environment>[] = [
    {
      key: "selection",
      header: (
        <input
          type="checkbox"
          aria-label="Select all rows"
          disabled={rows.length === 0 || isPlaceholderData}
          checked={rows.length > 0 && selectedRows.length === rows.length}
          ref={(input) => {
            if (input)
              input.indeterminate =
                selectedRows.length > 0 && selectedRows.length < rows.length;
          }}
          onChange={(event) =>
            select(
              event.target.checked
                ? rows.map((environment) => environment.id)
                : [],
            )
          }
        />
      ),
      cell: (environment) => (
        <input
          type="checkbox"
          aria-label={"Select " + environment.name}
          disabled={isPlaceholderData}
          checked={ids.includes(environment.id)}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) =>
            select(
              event.target.checked
                ? [...ids, environment.id]
                : ids.filter((id) => id !== environment.id),
            )
          }
        />
      ),
    },
    ...COLUMNS,
  ];

  if (isUnimplemented(error))
    return <UnavailableSurface surface="environments" />;

  return (
    <div>
      <PageHeader
        className="flex-wrap"
        title="Environments"
        subtitle={SURFACES.environments.blurb}
        actions={<CreateEnvironmentButton />}
      />
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const id = lookup.current?.value.trim();
            if (id) inspect(id);
          }}
        >
          <Input
            ref={lookup}
            aria-label="Find environment by ID"
            placeholder="Find environment by ID"
            className="h-8 w-56"
          />
          <Button type="submit" variant="outline" size="sm">
            Find
          </Button>
        </form>
        <StatusFilter
          includeArchived={includeArchived}
          onChange={setIncludeArchived}
        />
      </div>
      <div data-selected-count={selectedRows.length}>
        <EnvironmentSelectionActions
          selected={selectedRows}
          clear={() => select([])}
          onComplete={(succeeded, action) => {
            setSelection((current) => ({
              ...current,
              ids: current.ids.filter((id) => !succeeded.includes(id)),
            }));
            const current = new URLSearchParams(window.location.search).get(
              "environment",
            );
            if (action === "delete" && current && succeeded.includes(current))
              inspect();
          }}
        />
      </div>
      {error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.data ?? []}
            rowKey={(e) => e.id}
            loading={isPending}
            activeRowKey={inspected ?? undefined}
            onRowClick={(e) => inspect(e.id)}
            empty={
              <EmptyState
                title="No environments yet"
                hint="Create your first environment to get started."
                action={<CreateEnvironmentButton variant="outline" />}
              />
            }
          />
          <Pager
            hasPrev={pager.hasPrev}
            hasNext={!!data?.next_page}
            onPrev={pager.goPrev}
            onNext={() => data?.next_page && pager.goNext(data.next_page)}
          />
        </>
      )}
      {inspected && (
        <ResourceInspector
          kind="environment"
          id={inspected}
          previous={index > 0 ? rows[index - 1].id : undefined}
          next={index >= 0 ? rows[index + 1]?.id : undefined}
          onSelect={inspect}
          onClose={() => inspect()}
          fallbackFocus={lookup}
        >
          <EnvironmentDetail
            key={inspected}
            id={inspected}
            inspector
            onDeleted={() => inspect()}
          />
        </ResourceInspector>
      )}
    </div>
  );
}
