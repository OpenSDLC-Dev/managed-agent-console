"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
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
import { useUpdateGatewayProvider } from "@/lib/platform/gateway-queries";
import type { GatewayProvider } from "@/lib/platform/types";

export function EditProviderButton({
  provider,
}: {
  provider: GatewayProvider;
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
        <Pencil className="size-4" /> Edit
      </Button>
      {open && (
        <EditProviderDialog
          provider={provider}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The fields `updateProvider` takes (providers.go). The vendor and endpoints
 * are fixed at creation, so they are not here at all; another host or account
 * is another provider.
 */
function EditProviderDialog({
  provider,
  onClose,
}: {
  provider: GatewayProvider;
  onClose: () => void;
}) {
  const update = useUpdateGatewayProvider(provider.id, { errorToast: false });
  const [name, setName] = useState(provider.name);
  const [headers, setHeaders] = useState(() =>
    Object.entries(provider.headers).map(([key, value]) => ({ key, value })),
  );
  const [stallMs, setStallMs] = useState(
    provider.stall_timeout_ms === null ? "" : String(provider.stall_timeout_ms),
  );
  const [trace, setTrace] = useState(provider.propagate_trace);

  const setHeader = (index: number, patch: { key?: string; value?: string }) =>
    setHeaders(headers.map((h, i) => (i === index ? { ...h, ...patch } : h)));

  const submit = () =>
    update.mutate(
      {
        name: name.trim(),
        headers: Object.fromEntries(
          headers
            .filter((h) => h.key.trim())
            .map((h) => [h.key.trim(), h.value]),
        ),
        // Blank puts the gateway's default back.
        stall_timeout_ms: stallMs.trim() ? Number(stallMs) : null,
        propagate_trace: trace,
      },
      { onSuccess: onClose },
    );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !update.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Edit provider</DialogTitle>
          <DialogDescription>
            The vendor and endpoints are fixed at creation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-provider-name">Name</Label>
            <Input
              id="edit-provider-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="pb-1 text-sm font-medium">Extra headers</legend>
            {headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  aria-label={`Header ${i + 1} name`}
                  className="font-mono text-[13px]"
                  placeholder="Name"
                  value={h.key}
                  onChange={(e) => setHeader(i, { key: e.target.value })}
                />
                <Input
                  aria-label={`Header ${i + 1} value`}
                  className="font-mono text-[13px]"
                  placeholder="Value"
                  value={h.value}
                  onChange={(e) => setHeader(i, { value: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0"
                  aria-label={`Remove header ${i + 1}`}
                  onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setHeaders([...headers, { key: "", value: "" }])}
            >
              <Plus className="size-3.5" /> Add header
            </Button>
            <p className="text-xs text-muted-foreground">
              Sent with every request to this vendor. A secret belongs in a key,
              and the gateway refuses a header that would carry one.
            </p>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="edit-provider-stall">Stall timeout (ms)</Label>
            <Input
              id="edit-provider-stall"
              type="number"
              min={1}
              step={1}
              placeholder="Gateway default"
              value={stallMs}
              onChange={(e) => setStallMs(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={trace}
              onChange={(e) => setTrace(e.target.checked)}
            />
            Send W3C trace context to this vendor
          </label>
        </div>
        {update.error instanceof Error && (
          <p role="alert" className="text-sm text-destructive">
            {update.error.message}
          </p>
        )}
        <DialogFooter className="m-0 border-0 bg-transparent p-0">
          <Button variant="ghost" disabled={update.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || update.isPending} onClick={submit}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
