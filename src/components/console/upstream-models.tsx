"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { DataTable, type Column } from "@/components/console/data-table";
import { DetailSection } from "@/components/console/detail";
import { EmptyState, ErrorState } from "@/components/console/bits";
import { ConfirmIconButton } from "@/components/console/archive-button";
import {
  useCreateGatewayDeployment,
  useDeleteGatewayDeployment,
  useGatewayAliases,
  useGatewayDeployments,
  useUpdateGatewayDeployment,
} from "@/lib/platform/gateway-queries";
import type {
  GatewayDeployment,
  GatewayKind,
  GatewayProvider,
} from "@/lib/platform/types";
import { EnabledBadge } from "./gateway-bits";
import { wireDecimal, wireInteger } from "@/lib/platform/http";

const KINDS: GatewayKind[] = ["chat", "embedding", "rerank"];
const CAPABILITIES = ["tools", "thinking", "vision"] as const;
const PRICES = [
  ["input", "Input"],
  ["output", "Output"],
  ["cache_write", "Cache write"],
  ["cache_read", "Cache read"],
] as const;

type Prices = GatewayDeployment["prices"];

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "128K / 32K": the context window and the output cap, or a dash for unset. */
export function tokenLimits(c: GatewayDeployment["capabilities"]): string {
  const n = (v: number | undefined) => (v ? compact.format(v) : "—");
  return `${n(c.max_input_tokens)} / ${n(c.max_tokens)}`;
}

/** "1 / 2 / — / 0.1": per million tokens, in the table header's order. */
export function priceLine(p: Prices): string {
  return PRICES.map(([k]) => (p[k] === null ? "—" : String(p[k]))).join(" / ");
}

/**
 * A provider's upstream models (`/admin/v1/deployments`, filtered here: the
 * admin API lists them all). "Used by" names the models that route to each,
 * which is also why the gateway refuses to delete one of those.
 */
export function UpstreamModels({ provider }: { provider: GatewayProvider }) {
  const { data, error, isPending } = useGatewayDeployments();
  const aliases = useGatewayAliases();
  const update = useUpdateGatewayDeployment();
  const remove = useDeleteGatewayDeployment();
  const [editing, setEditing] = useState<GatewayDeployment>();
  const rows = (data?.data ?? []).filter((d) => d.provider_id === provider.id);
  const usedBy = (id: string) =>
    (aliases.data?.data ?? [])
      .filter((a) => a.targets.some((t) => t.deployment_id === id))
      .map((a) => a.name);

  const columns: Column<GatewayDeployment>[] = [
    {
      key: "model",
      header: "Upstream model",
      className: "w-full",
      cell: (d) => (
        <span className="grid">
          <span className="font-mono text-[13px]">{d.upstream_model}</span>
          {d.display_name && (
            <span className="text-[13px] text-muted-foreground">
              {d.display_name}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      cell: (d) => (
        <Badge variant="outline" className="font-normal">
          {d.kind}
        </Badge>
      ),
    },
    {
      key: "capabilities",
      header: "Capabilities",
      cell: (d) => (
        <span className="flex gap-1">
          {CAPABILITIES.filter((c) => d.capabilities[c]).map((c) => (
            <Badge key={c} variant="secondary" className="font-normal">
              {c}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: "limits",
      header: "Context / output",
      className: "text-right whitespace-nowrap",
      cell: (d) => (
        <span
          className="tabular-nums"
          data-max-input-tokens={d.capabilities.max_input_tokens ?? ""}
          data-max-tokens={d.capabilities.max_tokens ?? ""}
        >
          {tokenLimits(d.capabilities)}
        </span>
      ),
    },
    {
      key: "prices",
      header: "Price in / out / cache write / read",
      className: "text-right whitespace-nowrap",
      cell: (d) => (
        <span className="tabular-nums" data-prices={JSON.stringify(d.prices)}>
          {priceLine(d.prices)}
        </span>
      ),
    },
    {
      key: "used",
      header: "Used by",
      cell: (d) => {
        // Unread is not unused: a dash here would invite a delete the
        // gateway refuses.
        if (!aliases.data)
          return (
            <span className="text-muted-foreground" data-used-by="unknown">
              {aliases.isError ? "Unknown" : "…"}
            </span>
          );
        const names = usedBy(d.id);
        return names.length === 0 ? (
          <span className="text-muted-foreground" data-used-by={0}>
            —
          </span>
        ) : (
          <span className="font-mono text-[13px]" data-used-by={names.length}>
            {names.join(", ")}
          </span>
        );
      },
    },
    {
      key: "enabled",
      header: "Status",
      cell: (d) => <EnabledBadge enabled={d.enabled} />,
    },
    {
      key: "actions",
      header: "",
      cell: (d) => (
        <span className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: d.id, enabled: !d.enabled })}
          >
            {d.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-muted-foreground"
            aria-label={`Edit ${d.upstream_model}`}
            onClick={() => setEditing(d)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <ConfirmIconButton
            label={`Delete ${d.upstream_model}`}
            title="Delete upstream model"
            description="The gateway refuses while a model routes to it; remove it from those models first."
            pending={remove.isPending}
            onConfirm={() => remove.mutate(d.id)}
          >
            <Trash2 className="size-3.5" />
          </ConfirmIconButton>
        </span>
      ),
    },
  ];

  return (
    <DetailSection
      title="Upstream models"
      action={<AddUpstreamModelButton provider={provider} />}
    >
      <p className="pb-3 text-[13px] text-muted-foreground">
        Models this account serves. Prices are per million tokens and set the
        cost in Usage.
      </p>
      {error ? (
        <ErrorState error={error} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          loading={isPending}
          empty={<EmptyState title="No upstream models yet" />}
        />
      )}
      {editing && (
        <UpstreamModelDialog
          provider={provider}
          deployment={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </DetailSection>
  );
}

function AddUpstreamModelButton({ provider }: { provider: GatewayProvider }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" /> Add upstream model
      </Button>
      {open && (
        <UpstreamModelDialog
          provider={provider}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const priceText = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);
const limitText = (v: number | undefined) => (v ? String(v) : "");

/**
 * Add an upstream model, or edit one. The model id and kind are fixed at
 * creation (deployments.go updateDeployment refuses them), so editing shows
 * them and sends neither; capabilities and prices are replaced whole.
 */
function UpstreamModelDialog({
  provider,
  deployment,
  onClose,
}: {
  provider: GatewayProvider;
  deployment?: GatewayDeployment;
  onClose: () => void;
}) {
  const create = useCreateGatewayDeployment();
  const update = useUpdateGatewayDeployment({ errorToast: false });
  const mutation = deployment ? update : create;
  const [model, setModel] = useState(deployment?.upstream_model ?? "");
  const [kind, setKind] = useState<GatewayKind>(deployment?.kind ?? "chat");
  const [displayName, setDisplayName] = useState(
    deployment?.display_name ?? "",
  );
  const [flags, setFlags] = useState({
    tools: deployment?.capabilities.tools ?? false,
    thinking: deployment?.capabilities.thinking ?? false,
    vision: deployment?.capabilities.vision ?? false,
  });
  const [maxInput, setMaxInput] = useState(
    limitText(deployment?.capabilities.max_input_tokens),
  );
  const [maxOutput, setMaxOutput] = useState(
    limitText(deployment?.capabilities.max_tokens),
  );
  const [prices, setPrices] = useState<Record<keyof Prices, string>>({
    input: priceText(deployment?.prices.input),
    output: priceText(deployment?.prices.output),
    cache_write: priceText(deployment?.prices.cache_write),
    cache_read: priceText(deployment?.prices.cache_read),
  });

  const capabilities = {
    ...flags,
    ...(maxInput.trim() ? { max_input_tokens: wireInteger(maxInput) } : {}),
    ...(maxOutput.trim() ? { max_tokens: wireInteger(maxOutput) } : {}),
  };
  // A blank price is unpriced: left out on create, null on an update, which
  // replaces the prices whole.
  const priceBody: Partial<Prices> = {};
  for (const [k] of PRICES) {
    if (prices[k].trim()) priceBody[k] = wireDecimal(prices[k]);
    else if (deployment) priceBody[k] = null;
  }

  const submit = () => {
    if (deployment) {
      update.mutate(
        {
          id: deployment.id,
          display_name: displayName.trim(),
          capabilities,
          prices: priceBody as Prices,
        },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        {
          provider_id: provider.id,
          upstream_model: model.trim(),
          kind,
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
          capabilities,
          prices: priceBody,
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
      <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {deployment ? "Edit upstream model" : "Add upstream model"}
          </DialogTitle>
          <DialogDescription>
            A model {provider.name} serves, as its API names it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="upstream-model">Upstream model ID</Label>
            <Input
              id="upstream-model"
              className="font-mono"
              disabled={!!deployment}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <fieldset className="flex items-center gap-4">
            <legend className="sr-only">Kind</legend>
            <span className="text-sm font-medium" aria-hidden>
              Kind
            </span>
            {KINDS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="upstream-kind"
                  disabled={!!deployment}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                {k}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="upstream-display-name">Display name</Label>
            <Input
              id="upstream-display-name"
              placeholder="Optional"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          {kind === "chat" && (
            <fieldset className="space-y-2">
              <legend className="pb-1 text-sm font-medium">Capabilities</legend>
              <div className="flex gap-4">
                {CAPABILITIES.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={flags[c]}
                      onChange={(e) =>
                        setFlags({ ...flags, [c]: e.target.checked })
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="upstream-max-input">Context window</Label>
                  <Input
                    id="upstream-max-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="Tokens"
                    value={maxInput}
                    onChange={(e) => setMaxInput(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="upstream-max-output">Max output</Label>
                  <Input
                    id="upstream-max-output"
                    type="text"
                    inputMode="numeric"
                    placeholder="Tokens"
                    value={maxOutput}
                    onChange={(e) => setMaxOutput(e.target.value)}
                  />
                </div>
              </div>
            </fieldset>
          )}
          <fieldset className="space-y-2">
            <legend className="pb-1 text-sm font-medium">
              Prices per million tokens
            </legend>
            <div className="grid grid-cols-4 gap-3">
              {PRICES.map(([k, label]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={`upstream-price-${k}`}>{label}</Label>
                  <Input
                    id={`upstream-price-${k}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="—"
                    value={prices[k]}
                    onChange={(e) =>
                      setPrices({ ...prices, [k]: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              No currency: the gateway stores the number you enter. A blank
              price leaves the cost of those tokens out of Usage.
            </p>
          </fieldset>
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
            disabled={!model.trim() || mutation.isPending}
            onClick={submit}
          >
            {deployment
              ? mutation.isPending
                ? "Saving…"
                : "Save"
              : mutation.isPending
                ? "Adding…"
                : "Add upstream model"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
