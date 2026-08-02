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

type AuthKind = "environment_variable" | "static_bearer" | "mcp_oauth";

/**
 * Add-credential dialog. Secret fields are write-only on the platform —
 * they leave this form once and are never readable again, which the copy
 * says out loud.
 */
export function AddCredentialButton({ vaultId }: { vaultId: string }) {
  const add = useAddCredential(vaultId);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AuthKind>("environment_variable");
  const [displayName, setDisplayName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [allowedHosts, setAllowedHosts] = useState("");

  const reset = () => {
    setDisplayName("");
    setServerUrl("");
    setToken("");
    setSecretName("");
    setSecretValue("");
    setAllowedHosts("");
  };

  const submit = () => {
    const hosts = allowedHosts
      .split("\n")
      .map((h) => h.trim())
      .filter(Boolean);
    const auth =
      kind === "environment_variable"
        ? {
            type: kind,
            secret_name: secretName.trim(),
            secret_value: secretValue,
            // networking is required on the wire; unrestricted when no hosts.
            networking:
              hosts.length > 0
                ? { type: "limited", allowed_hosts: hosts }
                : { type: "unrestricted" },
          }
        : kind === "static_bearer"
          ? { type: kind, mcp_server_url: serverUrl.trim(), token }
          : {
              type: kind,
              mcp_server_url: serverUrl.trim(),
              access_token: token,
            };
    add.mutate(
      {
        ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
        auth,
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      },
    );
  };

  const valid =
    kind === "environment_variable"
      ? secretName.trim() && secretValue
      : serverUrl.trim() && token;

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
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            reset();
            add.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add credential</DialogTitle>
            <DialogDescription>
              The secret is sealed on save — it can be replaced later but never
              read back.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
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
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="environment_variable">
                      environment_variable
                    </SelectItem>
                    <SelectItem value="static_bearer">static_bearer</SelectItem>
                    <SelectItem value="mcp_oauth">mcp_oauth</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cred-name">Name (optional)</Label>
                <Input
                  id="cred-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>

            {kind === "environment_variable" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
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
                <div className="space-y-1.5">
                  <Label htmlFor="cred-hosts">
                    Allowed hosts (one per line, empty = unrestricted)
                  </Label>
                  <textarea
                    id="cred-hosts"
                    value={allowedHosts}
                    onChange={(e) => setAllowedHosts(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border bg-transparent p-2.5 font-mono text-[13px] outline-none focus-visible:border-ring"
                  />
                </div>
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
              </>
            )}
            {add.error instanceof Error && (
              <p className="text-sm text-destructive">{add.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!valid || add.isPending} onClick={submit}>
              Add credential
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
