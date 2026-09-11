"use client";

import { Plus, X } from "lucide-react";
import { EnvironmentSection } from "./environment-section";
import { RequestId } from "@/components/console/bits";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlatformError } from "@/lib/platform/http";
import {
  useCreateEnvironment,
  useUpdateEnvironment,
  type EnvironmentWriteBody,
} from "@/lib/platform/queries";
import type { Environment, Packages } from "@/lib/platform/types";

function NetworkToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="relative h-5 w-9 shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        />
        <span className="absolute inset-0 rounded-full bg-muted-foreground/30 peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-background shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

const PACKAGE_MANAGERS = ["apt", "cargo", "gem", "go", "npm", "pip"] as const;

interface EnvForm {
  name: string;
  description: string;
  kind: "cloud" | "self_hosted";
  networkingType: "unrestricted" | "limited";
  allowedHosts: string;
  allowMcpServers: boolean;
  allowPackageManagers: boolean;
  packages: {
    manager: (typeof PACKAGE_MANAGERS)[number] | "";
    value: string;
  }[];
  metadata: { key: string; value: string }[];
}

export function newEnvForm(): EnvForm {
  return {
    name: "",
    description: "",
    kind: "cloud",
    networkingType: "unrestricted",
    allowedHosts: "",
    allowMcpServers: false,
    allowPackageManagers: true,
    packages: [{ manager: "", value: "" }],
    metadata: [{ key: "", value: "" }],
  };
}

export function formFromEnvironment(environment: Environment): EnvForm {
  const config = environment.config;
  const cloud = config.type === "cloud" ? config : null;
  const limited =
    cloud && cloud.networking.type === "limited" ? cloud.networking : null;
  return {
    name: environment.name,
    description: environment.description,
    kind: config.type,
    networkingType: cloud?.networking.type ?? "unrestricted",
    allowedHosts: limited?.allowed_hosts.join("\n") ?? "",
    allowMcpServers: limited?.allow_mcp_servers ?? false,
    allowPackageManagers: limited?.allow_package_managers ?? true,
    packages:
      cloud &&
      PACKAGE_MANAGERS.some((manager) => cloud.packages[manager].length)
        ? PACKAGE_MANAGERS.flatMap((manager) =>
            cloud.packages[manager].map((value) => ({ manager, value })),
          )
        : [{ manager: "", value: "" }],
    metadata: Object.keys(environment.metadata).length
      ? Object.entries(environment.metadata).map(([key, value]) => ({
          key,
          value,
        }))
      : [{ key: "", value: "" }],
  };
}

export function bodyFromForm(
  form: EnvForm,
  mode: "create" | "edit",
  previousMetadata: Record<string, string> = {},
): EnvironmentWriteBody {
  const rows = form.metadata.filter((row) => row.key || row.value);
  if (new Set(rows.map((row) => row.key)).size !== rows.length)
    throw new Error("Metadata keys must be unique.");
  const metadata = Object.fromEntries([
    // Creation can store an empty value; an update uses that same value to delete.
    // Preserve untouched empty entries and use the missing-row branch for removal.
    ...rows
      .filter(
        (row) =>
          !(
            mode === "edit" &&
            row.value === "" &&
            Object.hasOwn(previousMetadata, row.key) &&
            previousMetadata[row.key] === ""
          ),
      )
      .map((row) => [row.key, row.value]),
    ...(mode === "edit"
      ? Object.keys(previousMetadata)
          .filter((key) => !rows.some((row) => row.key === key))
          .map((key) => [key, ""])
      : []),
  ]);
  const packages = Object.fromEntries(
    PACKAGE_MANAGERS.map((manager) => [manager, []]),
  ) as unknown as Packages;
  if (form.kind === "cloud")
    for (const row of form.packages) {
      if (row.value === "") continue;
      if (!row.manager) throw new Error("Choose a manager for each package.");
      packages[row.manager].push(row.value);
    }
  const config =
    form.kind === "self_hosted"
      ? { type: "self_hosted" as const }
      : {
          type: "cloud" as const,
          networking:
            form.networkingType === "unrestricted"
              ? { type: "unrestricted" as const }
              : {
                  type: "limited" as const,
                  allowed_hosts: form.allowedHosts
                    .split("\n")
                    .map((h) => h.trim())
                    .filter(Boolean),
                  allow_mcp_servers: form.allowMcpServers,
                  allow_package_managers: form.allowPackageManagers,
                },
          packages,
        };
  return {
    name: form.name,
    description: form.description,
    ...(Object.keys(metadata).length ? { metadata } : {}),
    // Kind is immutable server-side; edits still send the same-kind config.
    config: mode === "edit" && form.kind === "self_hosted" ? undefined : config,
  };
}

export function EnvironmentEditor({
  mode,
  initial,
  environmentId,
  onDone,
}: {
  mode: "create" | "edit";
  initial: EnvForm;
  environmentId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const focusPackage = useRef<number | null>(null);
  const focusMetadata = useRef<number | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const create = useCreateEnvironment();
  const update = useUpdateEnvironment(environmentId ?? "");
  const mutation = mode === "create" ? create : update;

  const set = <K extends keyof EnvForm>(key: K, value: EnvForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    if (mutation.isPending || !form.name) return;
    setDraftError(null);
    let body: EnvironmentWriteBody;
    try {
      body = bodyFromForm(
        form,
        mode,
        Object.fromEntries(
          initial.metadata
            .filter((row) => row.key || row.value)
            .map((row) => [row.key, row.value]),
        ),
      );
    } catch (error) {
      setDraftError(
        error instanceof Error
          ? error.message
          : "Invalid environment configuration",
      );
      return;
    }
    mutation.mutate(body, {
      onSuccess: (environment) =>
        onDone
          ? onDone()
          : router.push(`/environments/${encodeURIComponent(environment.id)}`),
    });
  };
  const error = mutation.error instanceof Error ? mutation.error : null;
  const updatePackage = (
    index: number,
    patch: Partial<EnvForm["packages"][number]>,
  ) =>
    set(
      "packages",
      form.packages.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  const updateMetadata = (
    index: number,
    patch: Partial<EnvForm["metadata"][number]>,
  ) =>
    set(
      "metadata",
      form.metadata.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <EnvironmentSection title="General">
        <div className="space-y-1.5">
          <Label htmlFor="env-name">Name</Label>
          <Input
            id="env-name"
            autoFocus={Boolean(onDone)}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="env-description">Description</Label>
          <textarea
            id="env-description"
            rows={2}
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        {(mode === "create" || !onDone) && (
          <div className="space-y-1.5">
            <Label>Hosting type</Label>
            {mode === "edit" ? (
              <p className="text-sm text-muted-foreground">
                {form.kind === "self_hosted" ? "Self-hosted" : "Cloud"}{" "}
                (immutable)
              </p>
            ) : (
              <Select
                value={form.kind}
                onValueChange={(value) => set("kind", value as EnvForm["kind"])}
              >
                <SelectTrigger
                  aria-label="Environment type"
                  className="h-8 w-full"
                >
                  <SelectValue>
                    {form.kind === "cloud" ? "Cloud" : "Self-hosted"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloud">Cloud</SelectItem>
                  <SelectItem value="self_hosted">Self-hosted</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </EnvironmentSection>
      {form.kind === "cloud" && (
        <>
          <EnvironmentSection
            title="Networking"
            hint="Configure network access policies for this environment."
          >
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.networkingType}
                onValueChange={(value) =>
                  set("networkingType", value as EnvForm["networkingType"])
                }
              >
                <SelectTrigger aria-label="Networking" className="h-8 w-full">
                  <SelectValue>
                    {form.networkingType === "limited"
                      ? "Limited"
                      : "Unrestricted"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unrestricted">Unrestricted</SelectItem>
                  <SelectItem value="limited">Limited</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.networkingType === "limited" && (
              <>
                <NetworkToggle
                  label="Allow MCP server network access"
                  checked={form.allowMcpServers}
                  onChange={(value) => set("allowMcpServers", value)}
                />
                <NetworkToggle
                  label="Allow package manager network access"
                  checked={form.allowPackageManagers}
                  onChange={(value) => set("allowPackageManagers", value)}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="env-hosts">
                    Allowed hosts (one per line)
                  </Label>
                  <textarea
                    id="env-hosts"
                    rows={3}
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    value={form.allowedHosts}
                    onChange={(e) => set("allowedHosts", e.target.value)}
                  />
                </div>
              </>
            )}
          </EnvironmentSection>
          <EnvironmentSection
            title="Packages"
            hint="Add one package per row. Spaces and commas within a package are preserved."
            action={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Add package"
                onClick={() =>
                  set("packages", [
                    ...form.packages,
                    { manager: "", value: "" },
                  ])
                }
              >
                <Plus className="size-4" />
              </Button>
            }
          >
            {form.packages.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="w-28 shrink-0 space-y-1.5">
                  <Label htmlFor={"env-manager-" + index} className="text-xs">
                    Manager
                  </Label>
                  <select
                    id={"env-manager-" + index}
                    ref={(element) => {
                      if (element && focusPackage.current === index) {
                        focusPackage.current = null;
                        element.focus();
                      }
                    }}
                    aria-label={"Package manager " + (index + 1)}
                    className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                    value={row.manager}
                    onChange={(e) =>
                      updatePackage(index, {
                        manager: e.target
                          .value as EnvForm["packages"][number]["manager"],
                      })
                    }
                  >
                    <option value="">Manager</option>
                    {PACKAGE_MANAGERS.map((manager) => (
                      <option key={manager}>{manager}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={"env-package-" + index} className="text-xs">
                    Package
                  </Label>
                  <Input
                    id={"env-package-" + index}
                    aria-label={"Package " + (index + 1)}
                    placeholder="package==1.0.0"
                    value={row.value}
                    onChange={(e) =>
                      updatePackage(index, { value: e.target.value })
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={"Remove package " + (index + 1)}
                  disabled={
                    form.packages.length === 1 && !row.manager && !row.value
                  }
                  onClick={() => {
                    focusPackage.current = Math.max(0, index - 1);
                    set(
                      "packages",
                      form.packages.length === 1
                        ? [{ manager: "", value: "" }]
                        : form.packages.filter((_, i) => i !== index),
                    );
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </EnvironmentSection>
        </>
      )}
      <EnvironmentSection
        title="Metadata"
        hint={
          mode === "edit"
            ? "Tag and organize this environment. Empty values remove existing keys."
            : "Tag and organize this environment with key-value pairs."
        }
        action={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Add metadata entry"
            onClick={() =>
              set("metadata", [...form.metadata, { key: "", value: "" }])
            }
          >
            <Plus className="size-4" />
          </Button>
        }
      >
        {form.metadata.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={"Metadata key " + (index + 1)}
              ref={(element) => {
                if (element && focusMetadata.current === index) {
                  focusMetadata.current = null;
                  element.focus();
                }
              }}
              placeholder="Key"
              value={row.key}
              onChange={(e) => updateMetadata(index, { key: e.target.value })}
            />
            <Input
              aria-label={"Metadata value " + (index + 1)}
              placeholder="Value"
              value={row.value}
              onChange={(e) => updateMetadata(index, { value: e.target.value })}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={"Remove metadata row " + (index + 1)}
              disabled={form.metadata.length === 1 && !row.key && !row.value}
              onClick={() => (
                (focusMetadata.current = Math.max(0, index - 1)),
                set(
                  "metadata",
                  form.metadata.length === 1
                    ? [{ key: "", value: "" }]
                    : form.metadata.filter((_, i) => i !== index),
                )
              )}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </EnvironmentSection>
      {(draftError || error) && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {draftError ?? error?.message}
          {error instanceof PlatformError && error.requestId && (
            <RequestId id={error.requestId} />
          )}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => (onDone ? onDone() : router.back())}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending || !form.name}>
          {mode === "create" ? "Create environment" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
