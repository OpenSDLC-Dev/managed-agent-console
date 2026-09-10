"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RequestId } from "@/components/console/bits";
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
import { metadataPatch } from "@/lib/platform/metadata";
import {
  useUpdateCredential,
  type VaultCredentialWriteBody,
} from "@/lib/platform/queries";
import type { CredentialAuth, VaultCredential } from "@/lib/platform/types";

type Form = {
  displayName: string;
  metadata: string;
  replacementSecret: string;
  expiresAt: string;
  networking: "unrestricted" | "limited";
  allowedHosts: string;
  injectBody: boolean;
  injectHeader: boolean;
  refreshToken: string;
  scope: string;
  tokenEndpointAuth: "none" | "client_secret_basic" | "client_secret_post";
  clientSecret: string;
};

export function credentialForm(credential: VaultCredential): Form {
  const auth = credential.auth;
  return {
    displayName: credential.display_name ?? "",
    metadata: JSON.stringify(credential.metadata, null, 2),
    replacementSecret: "",
    expiresAt: auth.type === "mcp_oauth" ? (auth.expires_at ?? "") : "",
    networking:
      auth.type === "environment_variable"
        ? auth.networking.type
        : "unrestricted",
    allowedHosts:
      auth.type === "environment_variable" && auth.networking.type === "limited"
        ? auth.networking.allowed_hosts.join("\n")
        : "",
    injectBody:
      auth.type === "environment_variable"
        ? auth.injection_location.body
        : true,
    injectHeader:
      auth.type === "environment_variable"
        ? auth.injection_location.header
        : true,
    refreshToken: "",
    scope: auth.type === "mcp_oauth" ? (auth.refresh?.scope ?? "") : "",
    tokenEndpointAuth:
      auth.type === "mcp_oauth"
        ? (auth.refresh?.token_endpoint_auth.type ?? "none")
        : "none",
    clientSecret: "",
  };
}

function authUpdate(auth: CredentialAuth, form: Form): unknown {
  if (auth.type === "static_bearer")
    return {
      type: auth.type,
      ...(form.replacementSecret ? { token: form.replacementSecret } : {}),
    };
  if (auth.type === "environment_variable") {
    const allowedHosts = form.allowedHosts
      .split("\n")
      .map((host) => host.trim())
      .filter(Boolean);
    return {
      type: auth.type,
      ...(form.replacementSecret
        ? { secret_value: form.replacementSecret }
        : {}),
      networking:
        form.networking === "limited"
          ? { type: "limited", allowed_hosts: allowedHosts }
          : { type: "unrestricted" },
      injection_location: {
        body: form.injectBody,
        header: form.injectHeader,
      },
    };
  }

  const refresh = auth.refresh;
  const tokenAuthChanged =
    refresh && form.tokenEndpointAuth !== refresh.token_endpoint_auth.type;
  const tokenEndpointAuth =
    refresh &&
    form.tokenEndpointAuth !== "none" &&
    (tokenAuthChanged || form.clientSecret)
      ? {
          type: form.tokenEndpointAuth,
          ...(form.clientSecret ? { client_secret: form.clientSecret } : {}),
        }
      : undefined;
  return {
    type: auth.type,
    ...(form.replacementSecret ? { access_token: form.replacementSecret } : {}),
    expires_at: form.expiresAt.trim() || null,
    ...(refresh
      ? {
          refresh: {
            ...(form.refreshToken ? { refresh_token: form.refreshToken } : {}),
            scope: form.scope.trim() || null,
            ...(tokenEndpointAuth
              ? { token_endpoint_auth: tokenEndpointAuth }
              : {}),
          },
        }
      : {}),
  };
}

export function credentialBody(
  credential: VaultCredential,
  form: Form,
): VaultCredentialWriteBody {
  return {
    display_name: form.displayName.trim() || null,
    metadata: metadataPatch(form.metadata, credential.metadata),
    auth: authUpdate(credential.auth, form),
  };
}

export function CredentialEditor({
  credential,
}: {
  credential: VaultCredential;
}) {
  const router = useRouter();
  const update = useUpdateCredential(credential.vault_id, credential.id);
  const [form, setForm] = useState(() => credentialForm(credential));
  const [parseError, setParseError] = useState<string | null>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    setParseError(null);
    if (
      credential.auth.type === "environment_variable" &&
      !form.injectBody &&
      !form.injectHeader
    ) {
      setParseError("Enable body or header injection.");
      return;
    }
    const refresh =
      credential.auth.type === "mcp_oauth" ? credential.auth.refresh : null;
    if (
      refresh &&
      form.tokenEndpointAuth !== refresh.token_endpoint_auth.type &&
      form.tokenEndpointAuth !== "none" &&
      !form.clientSecret
    ) {
      setParseError("A client secret is required when changing auth method.");
      return;
    }
    try {
      update.mutate(credentialBody(credential, form), {
        onSuccess: () => {
          update.reset();
          router.push(
            `/vaults/${credential.vault_id}/credentials/${credential.id}`,
          );
        },
      });
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Invalid metadata JSON",
      );
    }
  };
  const auth = credential.auth;
  const error =
    parseError ?? (update.error instanceof Error ? update.error.message : null);
  const requestId =
    update.error instanceof PlatformError ? update.error.requestId : null;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="credential-name">Display name (optional)</Label>
        <Input
          id="credential-name"
          value={form.displayName}
          onChange={(event) => set("displayName", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="credential-secret">
          {auth.type === "static_bearer"
            ? "Replacement bearer token"
            : auth.type === "mcp_oauth"
              ? "Replacement access token"
              : "Replacement secret value"}
        </Label>
        <Input
          id="credential-secret"
          type="password"
          autoComplete="new-password"
          placeholder="Leave empty to keep the current secret"
          value={form.replacementSecret}
          onChange={(event) => set("replacementSecret", event.target.value)}
        />
      </div>

      {auth.type === "environment_variable" && (
        <>
          <div className="space-y-1.5">
            <Label>Networking</Label>
            <Select
              value={form.networking}
              onValueChange={(value) =>
                set("networking", value as Form["networking"])
              }
            >
              <SelectTrigger aria-label="Networking" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unrestricted">Unrestricted</SelectItem>
                <SelectItem value="limited">Limited to hosts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.networking === "limited" && (
            <div className="space-y-1.5">
              <Label htmlFor="credential-hosts">
                Allowed hosts, one per line
              </Label>
              <textarea
                id="credential-hosts"
                className="min-h-24 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring"
                value={form.allowedHosts}
                onChange={(event) => set("allowedHosts", event.target.value)}
              />
            </div>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Injection location</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.injectHeader}
                onChange={(event) => set("injectHeader", event.target.checked)}
              />
              Header
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.injectBody}
                onChange={(event) => set("injectBody", event.target.checked)}
              />
              Body
            </label>
          </fieldset>
        </>
      )}

      {auth.type === "mcp_oauth" && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="credential-expiry">
              Expiry (RFC 3339, optional)
            </Label>
            <Input
              id="credential-expiry"
              placeholder="2026-09-10T12:00:00Z"
              value={form.expiresAt}
              onChange={(event) => set("expiresAt", event.target.value)}
            />
          </div>
          {auth.refresh && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="credential-refresh-token">
                  Replacement refresh token
                </Label>
                <Input
                  id="credential-refresh-token"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Leave empty to keep the current token"
                  value={form.refreshToken}
                  onChange={(event) => set("refreshToken", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="credential-scope">Scope (optional)</Label>
                <Input
                  id="credential-scope"
                  value={form.scope}
                  onChange={(event) => set("scope", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Token endpoint authentication</Label>
                <Select
                  value={form.tokenEndpointAuth}
                  onValueChange={(value) =>
                    set("tokenEndpointAuth", value as Form["tokenEndpointAuth"])
                  }
                >
                  <SelectTrigger
                    aria-label="Token endpoint authentication"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {auth.refresh.token_endpoint_auth.type === "none" && (
                      <SelectItem value="none">none</SelectItem>
                    )}
                    <SelectItem value="client_secret_basic">
                      client_secret_basic
                    </SelectItem>
                    <SelectItem value="client_secret_post">
                      client_secret_post
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.tokenEndpointAuth !== "none" && (
                <div className="space-y-1.5">
                  <Label htmlFor="credential-client-secret">
                    Replacement client secret
                  </Label>
                  <Input
                    id="credential-client-secret"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Required only when changing auth method"
                    value={form.clientSecret}
                    onChange={(event) =>
                      set("clientSecret", event.target.value)
                    }
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="credential-metadata">Metadata (JSON object)</Label>
        <textarea
          id="credential-metadata"
          className="min-h-36 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          value={form.metadata}
          onChange={(event) => set("metadata", event.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
          {requestId && <RequestId id={requestId} />}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button disabled={update.isPending} onClick={save}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
