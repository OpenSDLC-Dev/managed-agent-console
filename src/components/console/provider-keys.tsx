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
import { DataTable, type Column } from "@/components/console/data-table";
import { DetailSection } from "@/components/console/detail";
import { EmptyState, ErrorState } from "@/components/console/bits";
import { IdCell } from "@/components/console/copy-id";
import { ConfirmIconButton } from "@/components/console/archive-button";
import {
  useCreateGatewayCredential,
  useDeleteGatewayCredential,
  useGatewayCredentials,
  useUpdateGatewayCredential,
} from "@/lib/platform/gateway-queries";
import type {
  GatewayCredential,
  GatewayProtocol,
  GatewayProvider,
} from "@/lib/platform/types";
import {
  EnabledBadge,
  PROTOCOL_LABEL,
  ProtocolBadge,
  endpointEntries,
} from "./gateway-bits";

/**
 * A provider's vendor keys (`/admin/v1/providers/{id}/credentials`). The
 * gateway seals a key and renders only its last four characters, so nothing
 * on this page can show one; the Add key dialog is the only place a key is
 * ever typed, and it keeps none once the gateway has it.
 */
export function ProviderKeys({
  provider,
  vendor,
}: {
  provider: GatewayProvider;
  vendor: string;
}) {
  const { data, error, isPending } = useGatewayCredentials(provider.id);
  const update = useUpdateGatewayCredential(provider.id);
  const remove = useDeleteGatewayCredential(provider.id);
  const keys = data?.data ?? [];

  const columns: Column<GatewayCredential>[] = [
    { key: "id", header: "ID", cell: (k) => <IdCell id={k.id} /> },
    {
      key: "key",
      header: "Key",
      className: "w-full",
      cell: (k) => (
        <span className="font-mono text-[13px]" data-last-four={k.last_four}>
          {k.last_four ? `••••${k.last_four}` : "••••"}
        </span>
      ),
    },
    {
      key: "protocols",
      header: "Protocols",
      cell: (k) => (
        <span className="flex gap-1">
          {k.protocols.map((p) => (
            <ProtocolBadge key={p} protocol={p} />
          ))}
        </span>
      ),
    },
    {
      key: "weight",
      header: "Weight",
      className: "text-right whitespace-nowrap",
      // The weight alone, not a share of the total: which keys share a
      // request depends on its protocol and each key's (catalog/route.go
      // upstreamProtocol), so one percentage would be wrong for some callers.
      cell: (k) => (
        <span className="tabular-nums" data-weight={k.weight}>
          {k.weight}
        </span>
      ),
    },
    {
      key: "enabled",
      header: "Status",
      cell: (k) => <EnabledBadge enabled={k.enabled} />,
    },
    {
      key: "actions",
      header: "",
      cell: (k) => (
        <span className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: k.id, enabled: !k.enabled })}
          >
            {k.enabled ? "Disable" : "Enable"}
          </Button>
          <ConfirmIconButton
            label={`Delete key ${k.id}`}
            title="Delete key"
            description="The gateway stops using this key at once. A deleted key cannot be restored: add it again to use it."
            pending={remove.isPending}
            onConfirm={() => remove.mutate(k.id)}
          >
            <Trash2 className="size-3.5" />
          </ConfirmIconButton>
        </span>
      ),
    },
  ];

  return (
    <DetailSection
      title="Keys"
      action={<AddKeyButton provider={provider} vendor={vendor} />}
    >
      <p className="pb-3 text-[13px] text-muted-foreground">
        Write-only. Every key here must belong to the same {vendor} account; a
        key from another account needs its own provider.
      </p>
      {error ? (
        <ErrorState error={error} />
      ) : (
        <DataTable
          columns={columns}
          rows={keys}
          rowKey={(k) => k.id}
          loading={isPending}
          empty={
            <EmptyState
              title="No keys yet"
              hint="The gateway cannot call this provider until it has a key."
            />
          }
        />
      )}
    </DetailSection>
  );
}

function AddKeyButton({
  provider,
  vendor,
}: {
  provider: GatewayProvider;
  vendor: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" /> Add key
      </Button>
      {/* Mounted only while open, so a closed dialog holds no key in state. */}
      {open && (
        <AddKeyDialog
          provider={provider}
          vendor={vendor}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddKeyDialog({
  provider,
  vendor,
  onClose,
}: {
  provider: GatewayProvider;
  vendor: string;
  onClose: () => void;
}) {
  const create = useCreateGatewayCredential(provider.id);
  const served = endpointEntries(provider).map((e) => e.protocol);
  const [key, setKey] = useState("");
  const [protocols, setProtocols] = useState<GatewayProtocol[]>(served);
  const [weight, setWeight] = useState("1");

  const submit = () =>
    create.mutate(
      {
        key,
        // Left out, the gateway gives the key every protocol the provider
        // serves (store/credentials.go), which is what all ticked means.
        ...(protocols.length < served.length ? { protocols } : {}),
        ...(weight.trim() && weight !== "1" ? { weight: Number(weight) } : {}),
      },
      { onSuccess: onClose },
    );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !create.isPending) onClose();
      }}
    >
      <DialogContent className="p-6 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Add key</DialogTitle>
          <DialogDescription>
            A key for this {vendor} account. The gateway seals it; no one can
            read it back.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gateway-key">API key</Label>
            <Input
              id="gateway-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          {served.length > 1 && (
            <fieldset className="space-y-1.5">
              <legend className="pb-1 text-sm font-medium">Protocols</legend>
              {served.map((p) => (
                <label key={p} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={protocols.includes(p)}
                    onChange={(e) =>
                      setProtocols(
                        e.target.checked
                          ? served.filter(
                              (s) => s === p || protocols.includes(s),
                            )
                          : protocols.filter((s) => s !== p),
                      )
                    }
                  />
                  {PROTOCOL_LABEL[p]}
                </label>
              ))}
            </fieldset>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="gateway-key-weight">Weight</Label>
            <Input
              id="gateway-key-weight"
              type="number"
              min={1}
              step={1}
              className="w-28"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The gateway spreads requests across the enabled keys that can
              serve them, in proportion to their weights.
            </p>
          </div>
        </div>
        {create.error instanceof Error && (
          <p role="alert" className="text-sm text-destructive">
            {create.error.message}
          </p>
        )}
        <DialogFooter className="m-0 border-0 bg-transparent p-0">
          <Button variant="ghost" disabled={create.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!key || protocols.length === 0 || create.isPending}
            onClick={submit}
          >
            {create.isPending ? "Adding…" : "Add key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
