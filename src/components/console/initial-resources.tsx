"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemoryStoreOptions } from "@/lib/platform/queries";
import type { ResourceInput } from "@/lib/platform/session-resources";

type InitialResource = Exclude<ResourceInput, { type: "file" }>;

export function InitialResources({
  resources,
  onChange,
  owner = "session",
}: {
  resources: InitialResource[];
  onChange: (resources: InitialResource[]) => void;
  owner?: "session" | "deployment";
}) {
  const memoryStores = useMemoryStoreOptions();
  const memoryStoreOptions = memoryStores.data?.memoryStores ?? [];
  const update = (index: number, value: InitialResource) =>
    onChange(resources.map((resource, i) => (i === index ? value : resource)));
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Repositories and memory stores</p>
      <p className="text-xs text-muted-foreground">
        Attach these when creating the {owner}. Repositories remain attached to
        every {owner === "session" ? "session" : "session it starts"}.
      </p>
      {resources.map((resource, index) => (
        <fieldset key={index} className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-sm">
            {resource.type === "github_repository"
              ? "GitHub repository"
              : "Memory store"}{" "}
            {index + 1}
          </legend>
          {resource.type === "github_repository" ? (
            <>
              <div className="space-y-1">
                <Label htmlFor={`repo-url-${index}`}>Repository URL</Label>
                <Input
                  id={`repo-url-${index}`}
                  value={resource.url}
                  onChange={(e) =>
                    update(index, { ...resource, url: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`repo-token-${index}`}>
                  Authorization token
                </Label>
                <Input
                  id={`repo-token-${index}`}
                  type="password"
                  autoComplete="off"
                  value={resource.authorization_token}
                  onChange={(e) =>
                    update(index, {
                      ...resource,
                      authorization_token: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`repo-mount-${index}`}>
                  Repository mount path (optional)
                </Label>
                <Input
                  id={`repo-mount-${index}`}
                  value={resource.mount_path ?? ""}
                  onChange={(e) =>
                    update(index, {
                      ...resource,
                      mount_path: e.target.value || undefined,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`repo-checkout-${index}`}>Checkout</Label>
                <select
                  id={`repo-checkout-${index}`}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={resource.checkout?.type ?? "default"}
                  onChange={(e) =>
                    update(index, {
                      ...resource,
                      checkout:
                        e.target.value === "branch"
                          ? { type: "branch", name: "" }
                          : e.target.value === "commit"
                            ? { type: "commit", sha: "" }
                            : undefined,
                    })
                  }
                >
                  <option value="default">Default branch</option>
                  <option value="branch">Named branch</option>
                  <option value="commit">Commit SHA</option>
                </select>
              </div>
              {resource.checkout && (
                <div className="space-y-1">
                  <Label htmlFor={`repo-ref-${index}`}>
                    {resource.checkout.type === "branch"
                      ? "Branch name"
                      : "Commit SHA"}
                  </Label>
                  <Input
                    id={`repo-ref-${index}`}
                    value={
                      resource.checkout.type === "branch"
                        ? resource.checkout.name
                        : resource.checkout.sha
                    }
                    onChange={(e) =>
                      update(index, {
                        ...resource,
                        checkout:
                          resource.checkout?.type === "branch"
                            ? { type: "branch", name: e.target.value }
                            : { type: "commit", sha: e.target.value },
                      })
                    }
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor={`memory-id-${index}`}>Memory store ID</Label>
                <Input
                  id={`memory-id-${index}`}
                  list="active-memory-stores"
                  value={resource.memory_store_id}
                  onChange={(e) =>
                    update(index, {
                      ...resource,
                      memory_store_id: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {memoryStores.isPending
                    ? "Loading active memory stores…"
                    : memoryStores.isError
                      ? "Memory stores could not be loaded. Paste an ID to continue."
                      : memoryStores.data?.truncated
                        ? "Showing the first 1,000 active memory stores. Choose a suggestion or paste an ID."
                        : memoryStoreOptions.length === 0
                          ? "No active memory stores found. Create one or paste an ID."
                          : "Choose a suggestion by name or paste a memory store ID."}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`memory-access-${index}`}>Access</Label>
                <select
                  id={`memory-access-${index}`}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={resource.access ?? "read_write"}
                  onChange={(e) =>
                    update(index, {
                      ...resource,
                      access: e.target.value as "read_only" | "read_write",
                    })
                  }
                >
                  <option value="read_write">Read and write</option>
                  <option value="read_only">Read only</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`memory-instructions-${index}`}>
                  Memory instructions (optional)
                </Label>
                <Input
                  id={`memory-instructions-${index}`}
                  value={resource.instructions ?? ""}
                  onChange={(e) =>
                    update(index, {
                      ...resource,
                      instructions: e.target.value || undefined,
                    })
                  }
                />
              </div>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(resources.filter((_, i) => i !== index))}
          >
            Remove attachment {index + 1}
          </Button>
        </fieldset>
      ))}
      <datalist id="active-memory-stores">
        {memoryStoreOptions.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </datalist>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...resources,
              { type: "github_repository", url: "", authorization_token: "" },
            ])
          }
        >
          Add repository
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...resources,
              { type: "memory_store", memory_store_id: "" },
            ])
          }
        >
          Add memory store
        </Button>
      </div>
    </div>
  );
}
