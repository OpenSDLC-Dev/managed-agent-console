"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/console/archive-button";
import { Day, EmptyState, ListSkeleton } from "@/components/console/bits";
import {
  useDeleteGatewayAlias,
  useGatewayDeployments,
  useGatewayProviders,
} from "@/lib/platform/gateway-queries";
import type { GatewayAlias } from "@/lib/platform/types";
import { ModelKeys } from "./model-access";
import { ModelDialog } from "./model-dialog";
import { RoutingTiers } from "./model-routing";

/**
 * The models inspector. It reads the model from the list the page already
 * holds: the admin API's alias list is unpaged, so every model is in it.
 */
export function ModelDetail({
  alias,
  loading,
  onDeleted,
}: {
  alias: GatewayAlias | undefined;
  loading: boolean;
  onDeleted: () => void;
}) {
  if (loading) return <ListSkeleton />;
  if (!alias)
    return (
      <EmptyState
        title="No such model"
        hint="It may have been deleted. Choose another model from the list."
      />
    );
  return <Model key={alias.name} alias={alias} onDeleted={onDeleted} />;
}

function Model({
  alias,
  onDeleted,
}: {
  alias: GatewayAlias;
  onDeleted: () => void;
}) {
  const deployments = useGatewayDeployments();
  const providers = useGatewayProviders();
  const remove = useDeleteGatewayAlias(alias.name);
  const [editing, setEditing] = useState(false);
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="font-normal" data-kind={alias.kind}>
          {alias.kind}
        </Badge>
        <span className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setEditing(true)}
          >
            Edit routing
          </Button>
          <DeleteButton
            resource="model"
            description="Agents and applications that send this name fail until a model takes it again. The gateway refuses while an API key's policy grants it."
            pending={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDeleted })}
          />
        </span>
      </div>
      <h3 className="pt-3 font-mono text-lg">{alias.name}</h3>
      <p className="text-[13px] text-muted-foreground">
        {alias.display_name && <>{alias.display_name} · </>}created{" "}
        <Day iso={alias.created_at} />
      </p>
      <section className="pt-5">
        <h4 className="text-[15px] font-medium">Routing</h4>
        <p className="pb-2 text-[13px] text-muted-foreground">
          Tried top to bottom. Inside a tier, traffic splits by weight across
          the upstream models that can serve the request. A failure before the
          first byte tries the next key, then the next upstream model in the
          tier, then the next tier.
        </p>
        <RoutingTiers
          alias={alias}
          deployments={deployments.data?.data}
          providers={providers.data?.data}
        />
      </section>
      <section className="pt-5">
        <h4 className="pb-1.5 text-[15px] font-medium">
          Keys that can call it
        </h4>
        <ModelKeys alias={alias.name} />
      </section>
      {editing && (
        <ModelDialog alias={alias} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
