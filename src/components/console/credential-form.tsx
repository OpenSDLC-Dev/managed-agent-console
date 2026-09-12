"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAddCredential } from "@/lib/platform/queries";
import { metadataObject } from "@/lib/platform/metadata";

type AuthKind = "environment_variable" | "static_bearer" | "mcp_oauth";
const AUTH_LABELS: Record<AuthKind, string> = {
  environment_variable: "Environment variable",
  static_bearer: "Bearer token",
  mcp_oauth: "MCP OAuth",
};

/**
 * Add-credential dialog. Secret fields are write-only on the platform —
 * they leave this form once and are never readable again, which the copy
 * says out loud.
 */
export function AddCredentialButton({ vaultId }: { vaultId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" /> Add credential
      </Button>
      <CredentialDialog vaultId={vaultId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function CredentialDialog({
  vaultId,
  open,
  onOpenChange,
  firstVaultName,
}: {
  vaultId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firstVaultName?: string;
}) {
  const add = useAddCredential(vaultId);
  const [kind, setKind] = useState<AuthKind>(
    firstVaultName ? "mcp_oauth" : "environment_variable",
  );
  const [displayName, setDisplayName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [allowedHosts, setAllowedHosts] = useState("");
  const [networking, setNetworking] = useState<"limited" | "unrestricted">(
    "limited",
  );
  const [injectHeader, setInjectHeader] = useState(true);
  const [injectBody, setInjectBody] = useState(true);
  const [metadata, setMetadata] = useState("{}");
  const [expiresAt, setExpiresAt] = useState("");
  const [refreshEnabled, setRefreshEnabled] = useState(false);
  const [clientId, setClientId] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [tokenEndpoint, setTokenEndpoint] = useState("");
  const [tokenEndpointAuth, setTokenEndpointAuth] = useState<
    "none" | "client_secret_basic" | "client_secret_post"
  >("none");
  const [clientSecret, setClientSecret] = useState("");
  const [resource, setResource] = useState("");
  const [scope, setScope] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = () => {
    setKind(firstVaultName ? "mcp_oauth" : "environment_variable");
    setDisplayName("");
    setServerUrl("");
    setToken("");
    setSecretName("");
    setSecretValue("");
    setAllowedHosts("");
    setNetworking("limited");
    setInjectHeader(true);
    setInjectBody(true);
    setMetadata("{}");
    setExpiresAt("");
    setRefreshEnabled(false);
    setClientId("");
    setRefreshToken("");
    setTokenEndpoint("");
    setTokenEndpointAuth("none");
    setClientSecret("");
    setResource("");
    setScope("");
    setParseError(null);
  };

  const submit = () => {
    const hosts = allowedHosts
      .split("\n")
      .map((h) => h.trim())
      .filter(Boolean);
    let parsedMetadata: Record<string, string>;
    try {
      parsedMetadata = metadataObject(metadata);
      setParseError(null);
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Invalid metadata JSON",
      );
      return;
    }
    const auth =
      kind === "environment_variable"
        ? {
            type: kind,
            secret_name: secretName.trim(),
            secret_value: secretValue,
            // vaultcredauth.go accepts both arms; limited requires at least one host.
            networking:
              networking === "limited"
                ? { type: "limited", allowed_hosts: hosts }
                : { type: "unrestricted" },
            injection_location: {
              header: injectHeader,
              body: injectBody,
            },
          }
        : kind === "static_bearer"
          ? { type: kind, mcp_server_url: serverUrl.trim(), token }
          : {
              type: kind,
              mcp_server_url: serverUrl.trim(),
              access_token: token,
              ...(expiresAt.trim() ? { expires_at: expiresAt.trim() } : {}),
              ...(refreshEnabled
                ? {
                    refresh: {
                      client_id: clientId.trim(),
                      refresh_token: refreshToken,
                      token_endpoint: tokenEndpoint.trim(),
                      token_endpoint_auth: {
                        type: tokenEndpointAuth,
                        ...(tokenEndpointAuth !== "none"
                          ? { client_secret: clientSecret }
                          : {}),
                      },
                      ...(resource.trim() ? { resource: resource.trim() } : {}),
                      ...(scope.trim() ? { scope: scope.trim() } : {}),
                    },
                  }
                : {}),
            };
    add.mutate(
      {
        ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
        auth,
        metadata: parsedMetadata,
      },
      {
        onSuccess: () => {
          reset();
          add.reset();
          onOpenChange(false);
        },
      },
    );
  };

  const valid =
    kind === "environment_variable"
      ? secretName.trim() &&
        secretValue &&
        (injectHeader || injectBody) &&
        (networking === "unrestricted" || allowedHosts.trim())
      : serverUrl.trim() &&
        token &&
        (kind !== "mcp_oauth" ||
          !refreshEnabled ||
          (clientId.trim() &&
            refreshToken &&
            tokenEndpoint.trim() &&
            (tokenEndpointAuth === "none" || clientSecret)));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (add.isPending) return;
        onOpenChange(next);
        if (!next) {
          reset();
          add.reset();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {firstVaultName ? "Add a credential" : "Add credential"}
          </DialogTitle>
          <DialogDescription>
            {firstVaultName
              ? firstVaultName +
                " is ready. Add its first credential so agents can use it."
              : "Add a credential for agents to use in their sessions."}{" "}
            Secrets are sealed when saved and cannot be read back.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cred-name">Name (optional)</Label>
              <Input
                id="cred-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as AuthKind)}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 w-full rounded-lg"
                  aria-label="Credential type"
                >
                  <SelectValue>{AUTH_LABELS[kind]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="environment_variable">
                    Environment variable
                  </SelectItem>
                  <SelectItem value="static_bearer">Bearer token</SelectItem>
                  <SelectItem value="mcp_oauth">MCP OAuth</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {kind === "environment_variable" ? (
            <>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cred-secret-name">Secret name</Label>
                  <Input
                    id="cred-secret-name"
                    className="font-mono"
                    placeholder="GITHUB_TOKEN"
                    value={secretName}
                    onChange={(e) => setSecretName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cred-secret-value">Secret value</Label>
                  <Input
                    id="cred-secret-value"
                    type="password"
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                  />
                </div>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Network access</legend>
                <div className="flex gap-4">
                  {(["limited", "unrestricted"] as const).map((value) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="credential-networking"
                        value={value}
                        checked={networking === value}
                        onChange={() => setNetworking(value)}
                      />
                      {value === "limited" ? "Limited" : "Unrestricted"}
                    </label>
                  ))}
                </div>
                {networking === "limited" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cred-hosts">
                      Allowed hosts (one per line)
                    </Label>
                    <textarea
                      id="cred-hosts"
                      value={allowedHosts}
                      onChange={(e) => setAllowedHosts(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border bg-transparent p-2.5 font-mono text-[13px] outline-none focus-visible:border-ring"
                    />
                    <p className="text-xs text-muted-foreground">
                      Only these hosts can receive the credential. Enter at
                      least one host.
                    </p>
                  </div>
                )}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Injection location
                </legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={injectHeader}
                    onChange={(event) => setInjectHeader(event.target.checked)}
                  />
                  Header
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={injectBody}
                    onChange={(event) => setInjectBody(event.target.checked)}
                  />
                  Body
                </label>
              </fieldset>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cred-url">MCP server URL</Label>
                <Input
                  id="cred-url"
                  className="font-mono"
                  placeholder="https://…"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cred-token">
                  {kind === "mcp_oauth" ? "Access token" : "Bearer token"}
                </Label>
                <Input
                  id="cred-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              {kind === "mcp_oauth" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Enter tokens obtained from your MCP server. Browser OAuth
                    authorization is not available on this deployment.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="cred-expiry">
                      Expiry (RFC 3339, optional)
                    </Label>
                    <Input
                      id="cred-expiry"
                      placeholder="2026-09-10T12:00:00Z"
                      value={expiresAt}
                      onChange={(event) => setExpiresAt(event.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={refreshEnabled}
                      onChange={(event) =>
                        setRefreshEnabled(event.target.checked)
                      }
                    />
                    Configure automatic refresh
                  </label>
                  {refreshEnabled && (
                    <div className="space-y-4 rounded-lg border p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="cred-client-id">Client ID</Label>
                          <Input
                            id="cred-client-id"
                            value={clientId}
                            onChange={(event) =>
                              setClientId(event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="cred-refresh-token">
                            Refresh token
                          </Label>
                          <Input
                            id="cred-refresh-token"
                            type="password"
                            value={refreshToken}
                            onChange={(event) =>
                              setRefreshToken(event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cred-token-endpoint">
                          Token endpoint
                        </Label>
                        <Input
                          id="cred-token-endpoint"
                          value={tokenEndpoint}
                          onChange={(event) =>
                            setTokenEndpoint(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Token endpoint authentication</Label>
                        <Select
                          value={tokenEndpointAuth}
                          onValueChange={(value) =>
                            setTokenEndpointAuth(
                              value as typeof tokenEndpointAuth,
                            )
                          }
                        >
                          <SelectTrigger
                            aria-label="Token endpoint authentication"
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">none</SelectItem>
                            <SelectItem value="client_secret_basic">
                              client_secret_basic
                            </SelectItem>
                            <SelectItem value="client_secret_post">
                              client_secret_post
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {tokenEndpointAuth !== "none" && (
                        <div className="space-y-1.5">
                          <Label htmlFor="cred-client-secret">
                            Client secret
                          </Label>
                          <Input
                            id="cred-client-secret"
                            type="password"
                            value={clientSecret}
                            onChange={(event) =>
                              setClientSecret(event.target.value)
                            }
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="cred-resource">
                            Resource (optional)
                          </Label>
                          <Input
                            id="cred-resource"
                            value={resource}
                            onChange={(event) =>
                              setResource(event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="cred-scope">Scope (optional)</Label>
                          <Input
                            id="cred-scope"
                            value={scope}
                            onChange={(event) => setScope(event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <details className="space-y-1.5 text-sm">
            <summary>Metadata (optional)</summary>
            <Label htmlFor="cred-metadata">Metadata (JSON object)</Label>
            <textarea
              id="cred-metadata"
              rows={3}
              className="w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring"
              value={metadata}
              onChange={(event) => setMetadata(event.target.value)}
            />
          </details>
          {(parseError || add.error instanceof Error) && (
            <p role="alert" className="text-sm text-destructive">
              {parseError ?? (add.error as Error).message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={add.isPending}
            onClick={() => {
              reset();
              add.reset();
              onOpenChange(false);
            }}
          >
            {firstVaultName ? "Skip for now" : "Cancel"}
          </Button>
          <Button disabled={!valid || add.isPending} onClick={submit}>
            Add credential
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
