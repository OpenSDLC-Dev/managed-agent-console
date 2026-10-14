"use client";

import { Suspense, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  Day,
  EmptyState,
  ErrorState,
  UnavailableSurface,
} from "@/components/console/bits";
import { ResourceInspector } from "@/components/console/resource-inspector";
import { ModelDetail } from "@/components/console/model-detail";
import { ModelDialog } from "@/components/console/model-dialog";
import { RoutesTo } from "@/components/console/model-routing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useGatewayAliases,
  useGatewayDeployments,
} from "@/lib/platform/gateway-queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import type { GatewayAlias, GatewayKind } from "@/lib/platform/types";

type KindFilter = GatewayKind | "all";
const KIND_FILTERS: KindFilter[] = ["all", "chat", "embedding", "rerank"];

function AddModelButton({ variant }: { variant?: "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" /> Add model
      </Button>
      {open && <ModelDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export default function ModelsPage() {
  return (
    <Suspense>
      <ModelsList />
    </Suspense>
  );
}

function ModelsList() {
  const router = useRouter();
  const search = useSearchParams();
  const inspected = search.get("model");
  // Where focus lands when the inspected model is deleted from under it.
  const kindFilter = useRef<HTMLButtonElement>(null);
  const restoreToFallback = useRef(false);
  const inspect = (name?: string) => {
    const params = new URLSearchParams(window.location.search);
    if (name) {
      restoreToFallback.current = false;
      params.set("model", name);
    } else params.delete("model");
    router.push("/models" + (params.size ? "?" + params : ""), {
      scroll: false,
    });
  };
  const [kind, setKind] = useState<KindFilter>("all");
  const { data, error, isPending } = useGatewayAliases();
  const deployments = useGatewayDeployments();

  if (isUnimplemented(error)) return <UnavailableSurface surface="models" />;

  const all = data?.data ?? [];
  const rows = kind === "all" ? all : all.filter((a) => a.kind === kind);
  const index = rows.findIndex((a) => a.name === inspected);

  const columns: Column<GatewayAlias>[] = [
    {
      key: "name",
      header: "Name",
      cell: (a) => (
        <span className="grid">
          <span className="font-mono text-[13px]">{a.name}</span>
          {a.display_name && (
            <span className="text-[13px] text-muted-foreground">
              {a.display_name}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      cell: (a) => (
        <Badge variant="outline" className="font-normal" data-kind={a.kind}>
          {a.kind}
        </Badge>
      ),
    },
    {
      key: "routes",
      header: "Routes to",
      className: "w-full",
      cell: (a) => <RoutesTo alias={a} deployments={deployments.data?.data} />,
    },
    {
      key: "updated",
      header: "Updated at",
      cell: (a) => <Day iso={a.updated_at} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Models"
        subtitle={SURFACES.models.blurb}
        actions={<AddModelButton />}
      />
      <div className="flex items-center gap-1.5 pb-4 text-sm">
        <span className="text-muted-foreground">Kind</span>
        <Select
          value={kind}
          onValueChange={(value) => setKind(value as KindFilter)}
        >
          <SelectTrigger
            ref={kindFilter}
            size="sm"
            className="h-8 rounded-lg"
            aria-label="Kind filter"
            data-value={kind}
          >
            <SelectValue>{kind === "all" ? "All" : kind}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {KIND_FILTERS.map((k) => (
              <SelectItem key={k} value={k}>
                {k === "all" ? "All" : k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <ErrorState error={error} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(a) => a.name}
          loading={isPending}
          activeRowKey={inspected ?? undefined}
          onRowClick={(a) => inspect(a.name)}
          empty={
            <EmptyState
              title={kind === "all" ? "No models yet" : `No ${kind} models`}
              hint="A model is the name agents send. Add one that routes to your upstream models."
              action={<AddModelButton variant="outline" />}
            />
          }
        />
      )}
      {inspected && (
        <ResourceInspector
          kind="model"
          id={inspected}
          previous={index > 0 ? rows[index - 1].name : undefined}
          next={index >= 0 ? rows[index + 1]?.name : undefined}
          onSelect={inspect}
          onClose={() => inspect()}
          fallbackFocus={kindFilter}
          restoreToFallback={restoreToFallback}
        >
          <ModelDetail
            alias={all.find((a) => a.name === inspected)}
            loading={isPending}
            onDeleted={() => {
              restoreToFallback.current = true;
              inspect();
            }}
          />
        </ResourceInspector>
      )}
    </div>
  );
}
