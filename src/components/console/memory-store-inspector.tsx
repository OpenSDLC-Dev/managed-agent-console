"use client";

import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Database } from "lucide-react";
import { ResourceInspector } from "./resource-inspector";
import { DetailSkeleton, ErrorState, Time } from "./bits";
import { Field, JsonBlock } from "./detail";
import { MemoryStoreActions } from "./memory-store-actions";
import { MemoryTree } from "./memory-tree";
import { Button } from "@/components/ui/button";
import { useMemoryStore } from "@/lib/platform/queries";
import { cn } from "@/lib/utils";

export function MemoryStoreInspector(
  props: Omit<ComponentProps<typeof ResourceInspector>, "kind" | "children"> & {
    onDeleted: () => void;
  },
) {
  return (
    <ResourceInspector {...props} kind="memory-store">
      <MemorySummary key={props.id} id={props.id} onDeleted={props.onDeleted} />
    </ResourceInspector>
  );
}
function MemorySummary({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted: () => void;
}) {
  const store = useMemoryStore(id);
  const router = useRouter();
  const [view, setView] = useState("rendered");
  if (store.error) return <ErrorState error={store.error} />;
  if (store.isPending || !store.data) return <DetailSkeleton />;
  const item = store.data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 pb-4">
        <Database className="size-4 shrink-0" />
        <h2 className="min-w-0 flex-1 truncate font-medium" title={item.name}>
          {item.name}
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/memory-stores/" + id)}
        >
          Open <ArrowRight className="size-3.5" />
        </Button>
        <MemoryStoreActions store={item} onDeleted={onDeleted} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {view === "api" ? (
          <JsonBlock value={item} />
        ) : (
          <div className="space-y-6">
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <Field label="State">
                <span data-status={item.archived_at ? "archived" : "active"}>
                  {item.archived_at ? "Archived" : "Active"}
                </span>
              </Field>
              <Field label="Created">
                <Time iso={item.created_at} />
              </Field>
              <Field label="Updated">
                <Time iso={item.updated_at} />
              </Field>
            </dl>
            <section>
              <h3 className="mb-2 text-sm font-medium">Description</h3>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">
                {item.description || "—"}
              </p>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium">Contents</h3>
              <MemoryTree
                storeId={id}
                onSelect={(memoryId) =>
                  router.push(
                    "/memory-stores/" +
                      id +
                      "?memory=" +
                      encodeURIComponent(memoryId),
                  )
                }
              />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium">Metadata</h3>
              <dl className="grid grid-cols-[120px_1fr] gap-2 text-sm">
                {Object.entries(item.metadata).map(([key, value]) => (
                  <Field key={key} label={key}>
                    {value}
                  </Field>
                ))}
              </dl>
            </section>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-1 pt-2">
        {["rendered", "api"].map((tab) => (
          <button
            key={tab}
            aria-pressed={view === tab}
            onClick={() => setView(tab)}
            className={cn(
              "rounded-md px-2 py-1 text-xs",
              view === tab ? "border bg-secondary" : "text-muted-foreground",
            )}
          >
            {tab === "api" ? "API" : "Rendered"}
          </button>
        ))}
      </div>
    </div>
  );
}
