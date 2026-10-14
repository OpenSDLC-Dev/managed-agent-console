"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Circle, LoaderCircle, X } from "lucide-react";
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
import { IdCode, WARNING_BOX } from "@/components/console/bits";
import { gatewayGet, gatewayPost } from "@/lib/platform/http";
import {
  useGatewayProfiles,
  useGatewayProviders,
} from "@/lib/platform/gateway-queries";
import type {
  GatewayAlias,
  GatewayCredential,
  GatewayDeployment,
  GatewayProvider,
} from "@/lib/platform/types";
import {
  defaultEndpoints,
  defaultName,
  isRegional,
  type Region,
} from "./add-provider-dialog";
import { REGION_LABEL } from "./gateway-bits";

type Step = "provider" | "key" | "deployment" | "model";
const STEPS: Step[] = ["provider", "key", "deployment", "model"];

/** What each step made: its id, and what the list shows for it. */
type Row = { id: string; label: string };
type Made = Partial<Record<Step, Row>>;

/**
 * Shown on Models while the gateway has none. Until one exists, every
 * agent's model call fails, so the page says so and offers the setup.
 *
 * The dialog stays mounted once opened, so closing it partway and opening it
 * again resumes where it stopped. Starting over would make a second provider:
 * the gateway does not refuse a duplicate name. For the same reason the form
 * is offered only while the gateway has no provider: a reload forgets what an
 * earlier run made, and the gateway can hold it without a model.
 */
export function NoModelsCallout({
  onDone,
}: {
  onDone: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const providers = useGatewayProviders();
  const fresh = providers.data?.data.length === 0;
  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${WARNING_BOX}`}
      data-testid="no-models"
    >
      <span>
        The gateway has no models yet. Every agent&apos;s model call fails until
        one exists.
        {providers.data && !fresh && !opened && (
          <>
            {" "}
            Add one with Add model. Its upstream model is set up under{" "}
            <Link href="/providers" className="underline underline-offset-2">
              Providers
            </Link>
            .
          </>
        )}
      </span>
      {(fresh || opened) && (
        <Button
          size="sm"
          className="h-8"
          onClick={() => {
            setOpen(true);
            setOpened(true);
          }}
        >
          Set up a model
        </Button>
      )}
      {opened && (
        <ModelSetupDialog
          open={open}
          onClose={() => setOpen(false)}
          onDone={(name) => {
            setOpen(false);
            onDone(name);
          }}
        />
      )}
    </div>
  );
}

/**
 * One form for the first vendor: a provider, its key, an upstream model and
 * a model name, made in that order by the four admin calls an operator would
 * otherwise make by hand. It stops at the first refusal and keeps what it
 * made — nothing is rolled back — and Continue resumes at the step that
 * failed. That is orchestration of the operator's own calls, not domain
 * logic: each call's body is what the single-resource dialogs send.
 *
 * The vendor key lives in this form's state only until the gateway seals it
 * or the dialog closes, and goes through no mutation cache.
 */
export function ModelSetupDialog({
  open = true,
  onClose,
  onDone,
}: {
  open?: boolean;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const client = useQueryClient();
  const profiles = useGatewayProfiles();
  // A vendor without published hosts needs an endpoint typed in: that is the
  // Add provider dialog's job, not a first-run form's.
  const vendors = (profiles.data?.data ?? []).filter((p) => p.hosts.length);
  const [vendor, setVendor] = useState<string>();
  const profile = vendors.find((p) => p.name === vendor) ?? vendors[0];
  const [region, setRegion] = useState<Region>("cn");
  const [key, setKey] = useState("");
  const [upstream, setUpstream] = useState("");
  // Until edited, the name agents send is the upstream model's own.
  const [name, setName] = useState<string>();
  const modelName = (name ?? upstream).trim();
  const [made, setMade] = useState<Made>({});
  const [running, setRunning] = useState<Step>();
  const [failure, setFailure] = useState<{
    step: Step;
    message: string;
    /** Looks for what the failed attempt sent, whatever the form says now. */
    find?: () => Promise<Row | undefined>;
  }>();

  const label: Record<Step, string> = {
    provider: "Provider",
    key: "Key",
    deployment: "Upstream model",
    model: "Model",
  };
  const subject: Record<Step, string> = {
    provider: profile ? defaultName(profile, region) : "",
    key: "",
    deployment: upstream.trim(),
    model: modelName,
  };

  const run = async () => {
    if (!profile) return;
    // None of these writes is idempotent, and a lost answer can hide one that
    // landed. So the step that failed is looked up, by what it sent, before
    // it is tried again; a failed lookup fails the step again rather than
    // repeat the write.
    const retry = failure;
    setFailure(undefined);
    const ids: Made = { ...made };
    let current: Step = "provider";
    let inDoubt: (() => Promise<Row | undefined>) | undefined;
    const step = async (
      id: Step,
      call: () => Promise<Row>,
      find: () => Promise<Row | undefined>,
    ) => {
      current = id;
      if (ids[id]) return;
      setRunning(id);
      if (id === retry?.step && retry.find) {
        inDoubt = retry.find;
        const found = await retry.find();
        if (found) {
          ids[id] = found;
          setMade({ ...ids });
          return;
        }
      }
      inDoubt = find;
      ids[id] = await call();
      setMade({ ...ids });
    };
    const list = async <T,>(path: string, match: (row: T) => boolean) =>
      // The newest match: keys and upstream models list oldest first
      // (store/*.go), and a model name is unique.
      (await gatewayGet<{ data: T[] }>(path)).data.filter(match).at(-1);
    const providerName = defaultName(profile, region);
    const readProviders = async () =>
      (await gatewayGet<{ data: GatewayProvider[] }>("providers")).data;
    // Provider names are not unique, so the provider lookup takes only one
    // that appeared after the write was sent. The later lookups search under
    // that provider, so they find only this run's rows.
    let before: Set<string> | undefined;
    try {
      await step(
        "provider",
        async () => {
          before = new Set((await readProviders()).map((p) => p.id));
          const created = await gatewayPost<GatewayProvider>("providers", {
            name: providerName,
            profile: profile.name,
            endpoints: Object.fromEntries(
              Object.entries(defaultEndpoints(profile, region))
                .filter(([, e]) => e?.on && e.url)
                .map(([protocol, e]) => [protocol, e!.url]),
            ),
          });
          return { id: created.id, label: created.name };
        },
        async () => {
          if (!before) return undefined; // the write was never sent
          const seen = before;
          const fresh = (await readProviders()).filter(
            (p) =>
              !seen.has(p.id) &&
              p.name === providerName &&
              p.profile === profile.name,
          );
          if (fresh.length > 1)
            throw new Error(
              `More than one provider named "${providerName}" appeared after this form sent one. Check Providers before you continue.`,
            );
          return fresh[0] && { id: fresh[0].id, label: fresh[0].name };
        },
      );
      await step(
        "key",
        async () => {
          // A failed attempt clears the key too, so only a lookup that finds
          // no key asks for it again.
          if (!key.trim())
            throw new Error(
              "The gateway has no key from this provider yet. Enter the API key again.",
            );
          try {
            const created = await gatewayPost<GatewayCredential>(
              `providers/${ids.provider!.id}/credentials`,
              { key },
            );
            return { id: created.id, label: `••••${created.last_four}` };
          } finally {
            setKey("");
          }
        },
        // The provider is this run's, so any key on it is too.
        async () => {
          const found = await list<GatewayCredential>(
            `providers/${ids.provider!.id}/credentials`,
            () => true,
          );
          if (!found) return undefined;
          setKey("");
          return { id: found.id, label: `••••${found.last_four}` };
        },
      );
      await step(
        "deployment",
        async () => {
          // Capabilities and prices start at the wire's zero values; the
          // provider's page edits them.
          const created = await gatewayPost<GatewayDeployment>("deployments", {
            provider_id: ids.provider!.id,
            upstream_model: upstream.trim(),
            kind: "chat",
            capabilities: { tools: false, thinking: false, vision: false },
            prices: {},
          });
          return { id: created.id, label: created.upstream_model };
        },
        async () => {
          const found = await list<GatewayDeployment>(
            "deployments",
            (d) =>
              d.provider_id === ids.provider!.id &&
              d.upstream_model === upstream.trim(),
          );
          return found && { id: found.id, label: found.upstream_model };
        },
      );
      await step(
        "model",
        async () => {
          const created = await gatewayPost<GatewayAlias>("aliases", {
            name: modelName,
            targets: [
              { deployment_id: ids.deployment!.id, priority: 0, weight: 1 },
            ],
          });
          return { id: created.name, label: created.name };
        },
        async () => {
          const found = await list<GatewayAlias>(
            "aliases",
            (a) =>
              a.name === modelName &&
              a.targets.some((t) => t.deployment_id === ids.deployment!.id),
          );
          return found && { id: found.name, label: found.name };
        },
      );
      // The list is read again before the page inspects the new model, so the
      // inspector never opens on a list that lacks it.
      await client.invalidateQueries({ queryKey: ["gateway"] });
      // The row that exists, which a recovered write may name differently
      // from the form.
      onDone(ids.model!.id);
    } catch (error) {
      setFailure({
        step: current,
        message: error instanceof Error ? error.message : String(error),
        find: inDoubt,
      });
      void client.invalidateQueries({ queryKey: ["gateway"] });
    } finally {
      setRunning(undefined);
    }
  };

  const state = (s: Step) =>
    made[s]
      ? "done"
      : running === s
        ? "running"
        : failure?.step === s
          ? "failed"
          : "pending";
  // Closing drops a key the gateway has not sealed; everything else stays
  // for the next open.
  const close = () => {
    setKey("");
    onClose();
  };
  const ready =
    !!profile &&
    (!!made.key || !!key.trim() || failure?.step === "key") &&
    (!!made.deployment || !!upstream.trim()) &&
    !!modelName;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !running) close();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Set up a model</DialogTitle>
          <DialogDescription>
            One form for the first vendor. It makes a provider, its key, an
            upstream model and a model name, in that order. Capabilities and
            prices are set later on the provider&apos;s page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="setup-vendor">Vendor</Label>
              <select
                id="setup-vendor"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                disabled={!!made.provider}
                value={profile?.name ?? ""}
                onChange={(e) => setVendor(e.target.value)}
              >
                {vendors.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
            {profile && isRegional(profile) && (
              <fieldset className="space-y-1.5">
                <legend className="pb-1.5 text-sm font-medium">Region</legend>
                <span className="inline-flex gap-0.5 rounded-lg border p-0.5">
                  {(Object.keys(REGION_LABEL) as Region[]).map((r) => (
                    <label
                      key={r}
                      data-region={r}
                      className="cursor-pointer rounded-md px-2.5 py-1 text-[13px] has-[:checked]:bg-secondary has-[:checked]:font-medium has-[:disabled]:cursor-default has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
                    >
                      <input
                        type="radio"
                        name="setup-region"
                        className="sr-only"
                        disabled={!!made.provider}
                        checked={region === r}
                        onChange={() => setRegion(r)}
                      />
                      {REGION_LABEL[r]}
                    </label>
                  ))}
                </span>
              </fieldset>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setup-key">API key</Label>
            <Input
              id="setup-key"
              type="password"
              autoComplete="off"
              className="font-mono"
              disabled={!!made.key}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Sealed by the gateway. No one can read it back.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="setup-upstream">Upstream model ID</Label>
              <Input
                id="setup-upstream"
                className="font-mono"
                disabled={!!made.deployment}
                value={upstream}
                onChange={(e) => setUpstream(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-name">Model name agents send</Label>
              <Input
                id="setup-name"
                className="font-mono"
                value={name ?? upstream}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <ol aria-label="Progress" className="grid gap-1.5 text-sm">
            {STEPS.map((s) => {
              const at = state(s);
              return (
                <li
                  key={s}
                  data-step={s}
                  data-state={at}
                  className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2"
                >
                  {at === "done" ? (
                    <Check className="size-4" aria-hidden />
                  ) : at === "running" ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : at === "failed" ? (
                    <X className="size-4 text-destructive" aria-hidden />
                  ) : (
                    <Circle
                      className="size-3.5 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <span
                    className={at === "pending" ? "text-muted-foreground" : ""}
                  >
                    {label[s]}{" "}
                    <span className="font-mono">
                      {made[s]?.label ?? subject[s]}
                    </span>
                  </span>
                  {made[s] && s !== "model" ? <IdCode id={made[s].id} /> : null}
                </li>
              );
            })}
          </ol>
        </div>
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure.message}
          </p>
        )}
        <DialogFooter className="m-0 items-center border-0 bg-transparent p-0 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            A failed step stops here and keeps what was made.
          </span>
          <span className="flex gap-2">
            <Button variant="ghost" disabled={!!running} onClick={close}>
              Cancel
            </Button>
            <Button disabled={!ready || !!running} onClick={() => void run()}>
              {running
                ? "Creating…"
                : failure || Object.keys(made).length
                  ? "Continue"
                  : "Create"}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
