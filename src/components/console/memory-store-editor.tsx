"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequestId } from "@/components/console/bits";
import { PlatformError } from "@/lib/platform/http";
import {
  useCreateMemoryStore,
  useUpdateMemoryStore,
  type MemoryStoreWriteBody,
} from "@/lib/platform/queries";
import type { MemoryStore } from "@/lib/platform/types";

export interface MemoryStoreForm {
  name: string;
  description: string;
  metadata: string;
}

export const newMemoryStoreForm = (): MemoryStoreForm => ({
  name: "",
  description: "",
  metadata: "{}",
});

export const memoryStoreForm = (store: MemoryStore): MemoryStoreForm => ({
  name: store.name,
  description: store.description,
  metadata: JSON.stringify(store.metadata, null, 2),
});

export function memoryStoreBody(
  form: MemoryStoreForm,
  previousMetadata?: Record<string, string>,
): MemoryStoreWriteBody {
  const parsed: unknown = JSON.parse(form.metadata);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("Metadata must be a JSON object.");
  if (Object.values(parsed).some((value) => typeof value !== "string"))
    throw new Error("Metadata values must be strings.");
  const metadata = parsed as Record<string, string>;
  const patch: Record<string, string | null> = { ...metadata };
  for (const key of Object.keys(previousMetadata ?? {})) {
    if (!(key in metadata)) patch[key] = null;
  }
  return {
    name: form.name,
    description: form.description,
    metadata: patch,
  };
}

export function MemoryStoreEditor({
  mode,
  initial,
  storeId,
  onCancel,
}: {
  mode: "create" | "edit";
  initial: MemoryStoreForm;
  storeId?: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const create = useCreateMemoryStore();
  const update = useUpdateMemoryStore(storeId ?? "");
  const mutation = mode === "create" ? create : update;
  const [form, setForm] = useState(initial);
  const [parseError, setParseError] = useState<string | null>(null);

  const save = () => {
    if (mutation.isPending || !form.name) return;
    setParseError(null);
    let body: MemoryStoreWriteBody;
    try {
      body = memoryStoreBody(
        form,
        mode === "edit"
          ? (JSON.parse(initial.metadata) as Record<string, string>)
          : undefined,
      );
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Invalid metadata JSON",
      );
      return;
    }
    mutation.mutate(body, {
      onSuccess: (store) =>
        router.push(`/memory-stores/${encodeURIComponent(store.id)}`),
    });
  };
  const error =
    parseError ??
    (mutation.error instanceof Error ? mutation.error.message : null);
  const requestId =
    mutation.error instanceof PlatformError ? mutation.error.requestId : null;

  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="memory-store-name">Name</Label>
        <Input
          id="memory-store-name"
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="memory-store-description">Description</Label>
        <textarea
          rows={3}
          className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
          id="memory-store-description"
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Name and description are included in the agent system prompt when this
        store is attached.
      </p>
      <details open={onCancel ? undefined : true}>
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Metadata (optional)
        </summary>
        <div className="space-y-1.5">
          <Label htmlFor="memory-store-metadata">Metadata (JSON object)</Label>
          <textarea
            id="memory-store-metadata"
            className="min-h-36 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            value={form.metadata}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                metadata: event.target.value,
              }))
            }
          />
        </div>
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
          {requestId && <RequestId id={requestId} />}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => (onCancel ? onCancel() : router.back())}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!form.name || mutation.isPending}>
          {mode === "create" ? "Create memory store" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
