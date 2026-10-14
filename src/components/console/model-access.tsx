"use client";

import { useState } from "react";
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
import {
  useDeleteGatewayKeyPolicy,
  useGatewayAliases,
  useGatewayKeyPolicies,
  usePutGatewayKeyPolicy,
} from "@/lib/platform/gateway-queries";
import { useApiKeys } from "@/lib/platform/queries";
import type { ApiKey, GatewayKeyPolicy } from "@/lib/platform/types";

/**
 * What a key may call through the model gateway (auth.go authenticate): its
 * policy when it has one; else every model for the bootstrap and brain keys,
 * which the gateway knows by value and the control plane registers with no
 * issuer; else nothing. A policy written for either of those still applies.
 */
export interface Access {
  models: "all" | "none" | number;
  rpm: number | null;
  tpm: number | null;
  builtIn: boolean;
}

export function accessOf(
  key: ApiKey,
  policy: GatewayKeyPolicy | undefined,
): Access {
  if (policy)
    return {
      models: policy.aliases === null ? "all" : policy.aliases.length,
      rpm: policy.rpm,
      tpm: policy.tpm,
      builtIn: false,
    };
  return {
    models: key.created_by ? "none" : "all",
    rpm: null,
    tpm: null,
    builtIn: !key.created_by,
  };
}

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "120 RPM", "400K TPM", or "no limit". */
function limits(a: Access): string[] {
  const set = [
    ...(a.rpm === null ? [] : [`${compact.format(a.rpm)} RPM`]),
    ...(a.tpm === null ? [] : [`${compact.format(a.tpm)} TPM`]),
  ];
  return set.length ? set : ["no limit"];
}

/** "3 models · 120 RPM · 400K TPM", "All models · no limit", "No model access". */
export function accessLine(a: Access): string {
  if (a.models === "none") return "No model access";
  const models =
    a.models === "all"
      ? "All models"
      : `${a.models} ${a.models === 1 ? "model" : "models"}`;
  if (a.builtIn) return `${models} · built-in`;
  return [models, ...limits(a)].join(" · ");
}

/** Why a key may call one model: "granted · 60 RPM", "all models · no limit", "built-in". */
export function grantLine(a: Access): string {
  if (a.builtIn) return "built-in";
  return [a.models === "all" ? "all models" : "granted", ...limits(a)].join(
    " · ",
  );
}

/**
 * The active keys that may call `alias` — what the gateway would admit
 * (auth.go): a key's policy naming it or every model, or the built-in grant.
 * A key that is not active calls nothing, so it is not listed.
 */
export function ModelKeys({ alias }: { alias: string }) {
  const keys = useApiKeys();
  const policies = useGatewayKeyPolicies();
  if (!keys.data || !policies.data)
    return (
      <p className="text-[13px] text-muted-foreground">
        {keys.error || policies.error ? "Could not read the keys." : "…"}
      </p>
    );
  const callers = keys.data.flatMap((key) => {
    if (key.status !== "active") return [];
    const policy = policies.data.data.find((p) => p.api_key_id === key.id);
    const access = accessOf(key, policy);
    const may = access.models === "all" || !!policy?.aliases?.includes(alias);
    return may ? [{ key, access }] : [];
  });
  if (callers.length === 0)
    return (
      <p className="text-[13px] text-muted-foreground">
        No active key can call it. Grant one on API Keys.
      </p>
    );
  return (
    <ul className="grid gap-1 text-sm" data-callers={callers.length}>
      {callers.map(({ key, access }) => (
        <li
          key={key.id}
          className="flex items-baseline justify-between gap-3"
          data-key-id={key.id}
        >
          <span>{key.name}</span>
          <span className="text-[13px] text-muted-foreground">
            {grantLine(access)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ModelAccessCell({
  apiKey,
  policies,
  loading,
}: {
  apiKey: ApiKey;
  policies: GatewayKeyPolicy[] | undefined;
  loading: boolean;
}) {
  if (!policies)
    return (
      <span className="text-muted-foreground" data-models="unknown">
        {loading ? "…" : "Unknown"}
      </span>
    );
  const access = accessOf(
    apiKey,
    policies.find((p) => p.api_key_id === apiKey.id),
  );
  return (
    <span
      className={
        access.models === "none"
          ? "whitespace-nowrap text-muted-foreground"
          : "whitespace-nowrap"
      }
      data-models={access.models}
      data-rpm={access.rpm ?? ""}
      data-tpm={access.tpm ?? ""}
      data-built-in={access.builtIn || undefined}
    >
      {accessLine(access)}
    </span>
  );
}

type Grant = "none" | "all" | "some";

const limitText = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);
const limitValue = (v: string) => (v.trim() ? Number(v) : null);

export function ModelAccessButton({
  apiKey,
  policy,
}: {
  apiKey: ApiKey;
  policy: GatewayKeyPolicy | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7"
        onClick={() => setOpen(true)}
      >
        Model access
      </Button>
      {open && (
        <ModelAccessDialog
          apiKey={apiKey}
          policy={policy}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * A key's grant, written whole (keypolicies.go putKeyPolicy): no access
 * deletes the policy, all models sends `aliases: null`, and a blank limit is
 * `null`, no limit. Management rights are the platform's and do not change.
 */
function ModelAccessDialog({
  apiKey,
  policy,
  onClose,
}: {
  apiKey: ApiKey;
  policy: GatewayKeyPolicy | undefined;
  onClose: () => void;
}) {
  const aliases = useGatewayAliases();
  const put = usePutGatewayKeyPolicy(apiKey.id);
  const remove = useDeleteGatewayKeyPolicy(apiKey.id);
  const [grant, setGrant] = useState<Grant>(
    !policy ? "none" : policy.aliases === null ? "all" : "some",
  );
  const [selected, setSelected] = useState<string[]>(policy?.aliases ?? []);
  const [rpm, setRpm] = useState(limitText(policy?.rpm));
  const [tpm, setTpm] = useState(limitText(policy?.tpm));
  const pending = put.isPending || remove.isPending;
  const error = put.error ?? remove.error;

  const submit = () => {
    if (grant === "none") {
      // No policy is already no access; the gateway answers 404 to a delete.
      if (!policy) onClose();
      else remove.mutate(undefined, { onSuccess: onClose });
      return;
    }
    put.mutate(
      {
        aliases: grant === "all" ? null : selected,
        rpm: limitValue(rpm),
        tpm: limitValue(tpm),
      },
      { onSuccess: onClose },
    );
  };

  const GRANTS: [Grant, string][] = [
    ["none", "No model access"],
    ["all", "All models, including ones added later"],
    ["some", "Selected models"],
  ];

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Model access · {apiKey.name}
          </DialogTitle>
          <DialogDescription>
            Which models this key may call through the gateway, and how fast.
            Management rights do not change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="grid gap-2">
            <legend className="sr-only">Access</legend>
            {GRANTS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="model-access"
                  checked={grant === value}
                  onChange={() => setGrant(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {grant === "some" && (
            <fieldset className="grid gap-1.5 rounded-lg border px-3 py-2">
              <legend className="sr-only">Models</legend>
              {(aliases.data?.data ?? []).map((a) => (
                <label
                  key={a.name}
                  className="flex items-center gap-2 text-sm"
                  data-alias={a.name}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(a.name)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, a.name]
                          : selected.filter((n) => n !== a.name),
                      )
                    }
                  />
                  <span className="font-mono text-[13px]">{a.name}</span>
                  <Badge variant="outline" className="font-normal">
                    {a.kind}
                  </Badge>
                </label>
              ))}
              {aliases.data?.data.length === 0 && (
                <p className="text-[13px] text-muted-foreground">
                  The gateway has no models yet.
                </p>
              )}
            </fieldset>
          )}
          {grant !== "none" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="access-rpm">Requests per minute</Label>
                  <Input
                    id="access-rpm"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="No limit"
                    value={rpm}
                    onChange={(e) => setRpm(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="access-tpm">Tokens per minute</Label>
                  <Input
                    id="access-tpm"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="No limit"
                    value={tpm}
                    onChange={(e) => setTpm(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tokens per minute counts input, cache writes and output, not
                cache reads. Requests already running can pass it.
              </p>
            </>
          )}
        </div>
        {error instanceof Error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        <DialogFooter className="m-0 border-0 bg-transparent p-0">
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || (grant === "some" && selected.length === 0)}
            onClick={submit}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
