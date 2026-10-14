"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { ErrorState } from "@/components/console/bits";
import {
  useCreateGatewayProvider,
  useGatewayProfiles,
} from "@/lib/platform/gateway-queries";
import type { GatewayProfile, GatewayProtocol } from "@/lib/platform/types";
import { PROTOCOL_LABEL, REGION_LABEL } from "./gateway-bits";

type Region = keyof typeof REGION_LABEL;
type Endpoints = Partial<Record<GatewayProtocol, { on: boolean; url: string }>>;

const isRegional = (profile: GatewayProfile) =>
  profile.hosts.some((h) => h.region);

/**
 * Each protocol the vendor speaks, prefilled with the host the profile
 * publishes for it in `region`. A protocol the vendor publishes only in the
 * other region starts unticked; a profile with no hosts at all (the "any
 * endpoint" profiles) starts ticked and empty, for the operator to fill.
 */
function defaultEndpoints(profile: GatewayProfile, region: Region): Endpoints {
  return Object.fromEntries(
    profile.protocols.map((protocol) => {
      const hosts = profile.hosts.filter((h) => h.protocol === protocol);
      const host = hosts.find((h) => !h.region || h.region === region);
      return [
        protocol,
        { on: !!host || hosts.length === 0, url: host?.base_url ?? "" },
      ];
    }),
  );
}

/** A name to start from, which the operator may change: "MiniMax CN". */
function defaultName(profile: GatewayProfile, region: Region): string {
  if (profile.hosts.length === 0) return "";
  const base = profile.display_name.split(" (")[0];
  if (!isRegional(profile)) return base;
  return `${base} ${region === "cn" ? "CN" : "Intl"}`;
}

export function AddProviderButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="h-8" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add provider
      </Button>
      {open && <AddProviderDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * One vendor account: `POST /admin/v1/providers`. Its keys and upstream
 * models are added on the provider's page, so this dialog never holds a
 * secret. Nothing is checked here that the gateway does not check itself
 * (principle 4): the submit waits only for the fields the wire requires.
 */
function AddProviderDialog({ onClose }: { onClose: () => void }) {
  const profiles = useGatewayProfiles();
  const create = useCreateGatewayProvider();
  const list = profiles.data?.data ?? [];
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !create.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Add provider</DialogTitle>
          <DialogDescription>
            One vendor account. Its keys and upstream models are added on the
            provider&apos;s page.
          </DialogDescription>
        </DialogHeader>
        {list.length > 0 ? (
          <ProviderForm profiles={list} create={create} onClose={onClose} />
        ) : (
          <>
            {profiles.error ? (
              <ErrorState error={profiles.error} />
            ) : (
              <p className="text-sm text-muted-foreground">Loading vendors…</p>
            )}
            <DialogFooter className="m-0 border-0 bg-transparent p-0">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProviderForm({
  profiles,
  create,
  onClose,
}: {
  profiles: GatewayProfile[];
  create: ReturnType<typeof useCreateGatewayProvider>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(profiles[0]);
  const [region, setRegion] = useState<Region>("cn");
  const [endpoints, setEndpoints] = useState(() =>
    defaultEndpoints(profiles[0], "cn"),
  );
  const [name, setName] = useState(() => defaultName(profiles[0], "cn"));
  const [stallMs, setStallMs] = useState("");
  const [trace, setTrace] = useState(false);

  // Choosing a vendor or a region starts the form over from that vendor's
  // published hosts — an endpoint typed for one vendor is wrong for another.
  const choose = (next: GatewayProfile, nextRegion: Region) => {
    setProfile(next);
    setRegion(nextRegion);
    setEndpoints(defaultEndpoints(next, nextRegion));
    setName(defaultName(next, nextRegion));
  };

  const chosen = (
    Object.entries(endpoints) as [
      GatewayProtocol,
      { on: boolean; url: string },
    ][]
  ).filter(([, e]) => e.on && e.url.trim());

  const submit = () =>
    create.mutate(
      {
        name: name.trim(),
        profile: profile.name,
        endpoints: Object.fromEntries(
          chosen.map(([protocol, e]) => [protocol, e.url.trim()]),
        ),
        ...(stallMs.trim() ? { stall_timeout_ms: Number(stallMs) } : {}),
        ...(trace ? { propagate_trace: true } : {}),
      },
      { onSuccess: (created) => router.push(`/providers/${created.id}`) },
    );

  return (
    <>
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="pb-2 text-sm font-medium">Vendor</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {profiles.map((p) => (
              <label
                key={p.name}
                data-profile={p.name}
                className="grid cursor-pointer gap-1 rounded-lg border px-2.5 py-2 text-sm has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
              >
                <input
                  type="radio"
                  name="provider-profile"
                  className="sr-only"
                  checked={p.name === profile.name}
                  onChange={() => choose(p, region)}
                />
                <span>{p.display_name}</span>
                <span className="font-mono text-[11.5px] text-muted-foreground">
                  {p.protocols.join(" · ")}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {isRegional(profile) && (
          <fieldset className="flex flex-wrap items-center gap-4">
            <legend className="sr-only">Region</legend>
            <span className="text-sm font-medium" aria-hidden>
              Region
            </span>
            <span className="inline-flex gap-0.5 rounded-lg border p-0.5">
              {(Object.keys(REGION_LABEL) as Region[]).map((r) => (
                <label
                  key={r}
                  data-region={r}
                  className="cursor-pointer rounded-md px-2.5 py-0.5 text-[13px] has-[:checked]:bg-secondary has-[:checked]:font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
                >
                  <input
                    type="radio"
                    name="provider-region"
                    className="sr-only"
                    checked={region === r}
                    onChange={() => choose(profile, r)}
                  />
                  {REGION_LABEL[r]}
                </label>
              ))}
            </span>
            <span className="text-[13px] text-muted-foreground">
              The two sites issue different keys.
            </span>
          </fieldset>
        )}
        <fieldset className="space-y-1.5">
          <legend className="pb-1.5 text-sm font-medium">Endpoints</legend>
          {profile.protocols.map((protocol) => {
            const entry = endpoints[protocol] ?? { on: false, url: "" };
            const set = (patch: Partial<typeof entry>) =>
              setEndpoints({
                ...endpoints,
                [protocol]: { ...entry, ...patch },
              });
            const published = profile.hosts.some(
              (h) => h.protocol === protocol,
            );
            return (
              <div
                key={protocol}
                className="grid grid-cols-[18px_150px_minmax(0,1fr)] items-center gap-2"
              >
                <input
                  type="checkbox"
                  aria-label={`Use the ${PROTOCOL_LABEL[protocol]} endpoint`}
                  checked={entry.on}
                  onChange={(e) => set({ on: e.target.checked })}
                />
                <span className="text-[13px]">{PROTOCOL_LABEL[protocol]}</span>
                <Input
                  aria-label={`${PROTOCOL_LABEL[protocol]} endpoint`}
                  className="font-mono text-[13px]"
                  value={entry.url}
                  placeholder={
                    published
                      ? "Not published in this region"
                      : "https://your-endpoint.example/…"
                  }
                  onChange={(e) => set({ url: e.target.value, on: true })}
                />
              </div>
            );
          })}
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
            Endpoints cannot change after creation. Plain{" "}
            <span className="font-mono">http</span> sends the vendor key
            unencrypted.
          </p>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="provider-name">Name</Label>
          <Input
            id="provider-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-[13px]">
            Advanced: stall timeout, trace context
          </summary>
          <div className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="provider-stall">Stall timeout (ms)</Label>
              <Input
                id="provider-stall"
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
        </details>
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
          disabled={!name.trim() || chosen.length === 0 || create.isPending}
          onClick={submit}
        >
          {create.isPending ? "Adding…" : "Add provider"}
        </Button>
      </DialogFooter>
    </>
  );
}
