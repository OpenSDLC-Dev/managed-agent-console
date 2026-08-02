"use client";

import { RequestId } from "@/components/console/bits";
import { useState } from "react";
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

const PACKAGE_MANAGERS = ["apt", "cargo", "gem", "go", "npm", "pip"] as const;

interface EnvForm {
  name: string;
  description: string;
  kind: "cloud" | "self_hosted";
  networkingType: "unrestricted" | "limited";
  allowedHosts: string;
  allowMcpServers: boolean;
  allowPackageManagers: boolean;
  packages: Record<(typeof PACKAGE_MANAGERS)[number], string>;
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
    packages: { apt: "", cargo: "", gem: "", go: "", npm: "", pip: "" },
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
    packages: Object.fromEntries(
      PACKAGE_MANAGERS.map((pm) => [pm, cloud?.packages[pm].join(", ") ?? ""]),
    ) as EnvForm["packages"],
  };
}

function bodyFromForm(
  form: EnvForm,
  mode: "create" | "edit",
): EnvironmentWriteBody {
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
          packages: Object.fromEntries(
            PACKAGE_MANAGERS.map((pm) => [
              pm,
              form.packages[pm]
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean),
            ]),
          ) as unknown as Packages,
        };
  return {
    name: form.name,
    description: form.description,
    // Kind is immutable server-side; edits still send the same-kind config.
    config: mode === "edit" && form.kind === "self_hosted" ? undefined : config,
  };
}

export function EnvironmentEditor({
  mode,
  initial,
  environmentId,
}: {
  mode: "create" | "edit";
  initial: EnvForm;
  environmentId?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const create = useCreateEnvironment();
  const update = useUpdateEnvironment(environmentId ?? "");
  const mutation = mode === "create" ? create : update;

  const set = <K extends keyof EnvForm>(key: K, value: EnvForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () =>
    mutation.mutate(bodyFromForm(form, mode), {
      onSuccess: (environment) =>
        router.push(`/environments/${environment.id}`),
    });

  const error = mutation.error instanceof Error ? mutation.error : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="env-name">Name</Label>
          <Input
            id="env-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          {mode === "edit" ? (
            <p className="pt-1.5 text-sm text-muted-foreground">
              {form.kind} (immutable)
            </p>
          ) : (
            <Select
              value={form.kind}
              onValueChange={(v) => set("kind", v as EnvForm["kind"])}
            >
              <SelectTrigger
                size="sm"
                className="h-8 w-full rounded-lg"
                aria-label="Environment type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cloud">cloud</SelectItem>
                <SelectItem value="self_hosted">self_hosted</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="env-description">Description</Label>
        <Input
          id="env-description"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      {form.kind === "cloud" && (
        <>
          <div className="space-y-1.5">
            <Label>Networking</Label>
            <Select
              value={form.networkingType}
              onValueChange={(v) =>
                set("networkingType", v as EnvForm["networkingType"])
              }
            >
              <SelectTrigger
                size="sm"
                className="h-8 w-48 rounded-lg"
                aria-label="Networking"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unrestricted">unrestricted</SelectItem>
                <SelectItem value="limited">limited</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.networkingType === "limited" && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1.5">
                <Label htmlFor="env-hosts">Allowed hosts (one per line)</Label>
                <textarea
                  id="env-hosts"
                  value={form.allowedHosts}
                  onChange={(e) => set("allowedHosts", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border bg-transparent p-2.5 font-mono text-[13px] outline-none focus-visible:border-ring"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.allowMcpServers}
                  onChange={(e) => set("allowMcpServers", e.target.checked)}
                />
                Allow MCP servers
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.allowPackageManagers}
                  onChange={(e) =>
                    set("allowPackageManagers", e.target.checked)
                  }
                />
                Allow package managers
              </label>
            </div>
          )}
          <div>
            <Label className="pb-2">
              Pre-installed packages (comma-separated)
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {PACKAGE_MANAGERS.map((pm) => (
                <div key={pm} className="space-y-1">
                  <Label
                    htmlFor={`env-pkg-${pm}`}
                    className="font-mono text-[12px] text-muted-foreground"
                  >
                    {pm}
                  </Label>
                  <Input
                    id={`env-pkg-${pm}`}
                    className="h-8 font-mono text-[13px]"
                    value={form.packages[pm]}
                    onChange={(e) =>
                      set("packages", {
                        ...form.packages,
                        [pm]: e.target.value,
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={mutation.isPending || !form.name}>
          {mode === "create" ? "Create environment" : "Save changes"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        {error && (
          <span className="text-sm text-destructive">
            {error.message}
            {error instanceof PlatformError && error.requestId && (
              <span className="pl-2">
                <RequestId id={error.requestId} />
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
