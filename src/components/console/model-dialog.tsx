"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateGatewayAlias,
  useGatewayDeployments,
  useGatewayProviders,
  useUpdateGatewayAlias,
  type GatewayTargetInput,
} from "@/lib/platform/gateway-queries";
import type { GatewayAlias, GatewayKind } from "@/lib/platform/types";
import { percent, tierLabel, tiers } from "./model-routing";

const KINDS: GatewayKind[] = ["chat", "embedding", "rerank"];

interface Row {
  deployment_id: string;
  weight: string;
}

const blankRow = (): Row => ({ deployment_id: "", weight: "1" });

/** The alias's targets as editable tiers, in the order the gateway tries them. */
function rowsOf(alias: GatewayAlias | undefined): Row[][] {
  if (!alias) return [[blankRow()]];
  return tiers(alias.targets).map((tier) =>
    tier.targets.map((t) => ({
      deployment_id: t.deployment_id,
      weight: String(t.weight),
    })),
  );
}

/**
 * Tiers back to wire targets. A tier's priority is its position: the gateway
 * reads priority only as an order, so renumbering keeps the routing.
 */
function targetsOf(rows: Row[][]): GatewayTargetInput[] {
  return rows.flatMap((tier, priority) =>
    tier.map((r) => ({
      deployment_id: r.deployment_id,
      priority,
      weight: Number(r.weight),
    })),
  );
}

/**
 * Add a model, or edit its routing. The name and kind are fixed at creation
 * (aliases.go updateAlias refuses both), and `targets` is replaced whole, so
 * an edit sends it only when the routing changed. An embedding model keeps
 * its one upstream model for life (store/aliases.go): its edit shows the
 * target and sends only the display name.
 */
export function ModelDialog({
  alias,
  onClose,
}: {
  alias?: GatewayAlias;
  onClose: () => void;
}) {
  const create = useCreateGatewayAlias();
  const update = useUpdateGatewayAlias(alias?.name ?? "");
  const mutation = alias ? update : create;
  const deployments = useGatewayDeployments();
  const providers = useGatewayProviders();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState(alias?.display_name ?? "");
  const [kind, setKind] = useState<GatewayKind>(alias?.kind ?? "chat");
  const [rows, setRows] = useState(() => rowsOf(alias));
  const [routingChanged, setRoutingChanged] = useState(false);

  const fixed = alias?.kind === "embedding";
  const single = kind === "embedding";
  const chosen = rows.flat().map((r) => r.deployment_id);
  const offered = (deployments.data?.data ?? []).filter((d) => d.kind === kind);
  const providerName = (id: string) =>
    providers.data?.data.find((p) => p.id === id)?.name ?? id;

  const edit = (next: Row[][]) => {
    setRows(next.filter((tier) => tier.length > 0));
    setRoutingChanged(true);
  };
  const setRow = (t: number, i: number, row: Row) =>
    edit(
      rows.map((tier, ti) =>
        tier.map((r, ri) => (ti === t && ri === i ? row : r)),
      ),
    );
  const removeRow = (t: number, i: number) =>
    edit(rows.map((tier, ti) => tier.filter((_, ri) => ti !== t || ri !== i)));
  const addRow = (t: number) =>
    edit(rows.map((tier, ti) => (ti === t ? [...tier, blankRow()] : tier)));

  const complete = rows.every((tier) => tier.every((r) => r.deployment_id));
  const submit = () => {
    const display = displayName.trim();
    if (alias) {
      update.mutate(
        {
          display_name: display,
          ...(routingChanged ? { targets: targetsOf(rows) } : {}),
        },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        {
          name: name.trim(),
          ...(display ? { display_name: display } : {}),
          targets: targetsOf(rows),
        },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {alias ? (
              <>
                Edit routing ·{" "}
                <span className="font-mono text-xl">{alias.name}</span>
              </>
            ) : (
              "Add model"
            )}
          </DialogTitle>
          <DialogDescription>
            Requests go to the first tier. A tier is used only when every
            upstream model above it fails before answering.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!alias && (
            <div className="space-y-1.5">
              <Label htmlFor="model-name">Name</Label>
              <Input
                id="model-name"
                className="font-mono"
                placeholder="agent-default"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                What agents and applications send as the model. Fixed once
                created.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="model-display-name">Display name</Label>
            <Input
              id="model-display-name"
              placeholder="Optional"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          {!alias && (
            <fieldset className="flex items-center gap-4">
              <legend className="sr-only">Kind</legend>
              <span className="text-sm font-medium" aria-hidden>
                Kind
              </span>
              {KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="model-kind"
                    checked={kind === k}
                    onChange={() => {
                      setKind(k);
                      edit([[blankRow()]]);
                    }}
                  />
                  {k}
                </label>
              ))}
            </fieldset>
          )}
          {rows.map((tier, t) => {
            const total = tier.reduce((n, r) => n + (Number(r.weight) || 0), 0);
            return (
              <div
                key={t}
                className="rounded-lg border px-3 py-2"
                data-priority={t}
              >
                <div className="flex items-baseline justify-between pb-1.5">
                  <span className="text-sm font-medium">{tierLabel(t)}</span>
                  <span className="text-[13px] text-muted-foreground">
                    priority {t}
                  </span>
                </div>
                {tier.map((row, i) => {
                  const share =
                    total > 0 ? (Number(row.weight) || 0) / total : 0;
                  const label = `${tierLabel(t)} upstream model ${i + 1}`;
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(0,1fr)_72px_44px_32px] items-center gap-2 py-1"
                    >
                      <select
                        aria-label={label}
                        className="h-9 min-w-0 rounded-md border bg-transparent px-3 font-mono text-sm"
                        disabled={fixed}
                        value={row.deployment_id}
                        onChange={(e) =>
                          setRow(t, i, {
                            ...row,
                            deployment_id: e.target.value,
                          })
                        }
                      >
                        <option value="" disabled>
                          Choose an upstream model
                        </option>
                        {offered
                          .filter(
                            (d) =>
                              d.id === row.deployment_id ||
                              !chosen.includes(d.id),
                          )
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.upstream_model} · {providerName(d.provider_id)}
                              {d.enabled ? "" : " (disabled)"}
                            </option>
                          ))}
                      </select>
                      {single ? (
                        <span className="col-span-3" />
                      ) : (
                        <>
                          <Input
                            aria-label={`${label} weight`}
                            type="number"
                            min={1}
                            max={1000}
                            value={row.weight}
                            onChange={(e) =>
                              setRow(t, i, { ...row, weight: e.target.value })
                            }
                          />
                          <span
                            className="text-right text-[13px] tabular-nums"
                            data-share={share}
                          >
                            {percent(share)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            aria-label={`Remove ${label}`}
                            disabled={rows.length === 1 && tier.length === 1}
                            onClick={() => removeRow(t, i)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
                {!single && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => addRow(t)}
                  >
                    <Plus className="size-3.5" /> Add upstream model
                  </Button>
                )}
              </div>
            );
          })}
          {!single && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => edit([...rows, [blankRow()]])}
            >
              <Plus className="size-4" /> Add fallback tier
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {fixed
              ? "An embedding model keeps its one upstream model for life: an index built through it would mix vector spaces. A new embedding model is a new model."
              : `Only ${kind} upstream models are offered: a model has one kind.`}
          </p>
        </div>
        {mutation.error instanceof Error && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        <DialogFooter className="m-0 border-0 bg-transparent p-0">
          <Button
            variant="ghost"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            disabled={
              (!alias && !name.trim()) || !complete || mutation.isPending
            }
            onClick={submit}
          >
            {alias
              ? mutation.isPending
                ? "Saving…"
                : "Save"
              : mutation.isPending
                ? "Adding…"
                : "Add model"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
