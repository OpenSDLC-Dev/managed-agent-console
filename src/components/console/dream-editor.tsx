"use client";

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
import { RequestId } from "@/components/console/bits";
import { PlatformError } from "@/lib/platform/http";
import {
  useCreateDream,
  useMemoryStoreOptions,
  type DreamWriteBody,
} from "@/lib/platform/queries";

type Speed = "default" | "standard" | "fast";
type OutputBehavior = "create_new" | "update_existing";

/** Commas and whitespace are the two separators the field describes. */
export const dreamSessionIds = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);

export function DreamEditor() {
  const router = useRouter();
  const create = useCreateDream();
  const stores = useMemoryStoreOptions();
  const [memoryStoreId, setMemoryStoreId] = useState("");
  const [sessions, setSessions] = useState("");
  const [modelId, setModelId] = useState("");
  const [speed, setSpeed] = useState<Speed>("default");
  const [instructions, setInstructions] = useState("");
  const [behavior, setBehavior] = useState<OutputBehavior>("create_new");

  const sessionIds = dreamSessionIds(sessions);
  const instructionLength = [...instructions].length;
  const canSubmit =
    !!memoryStoreId &&
    sessionIds.length >= 1 &&
    sessionIds.length <= 100 &&
    !!modelId &&
    instructionLength <= 4096 &&
    !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    const body: DreamWriteBody = {
      inputs: [
        { type: "memory_store", memory_store_id: memoryStoreId },
        { type: "sessions", session_ids: sessionIds },
      ],
      model: speed === "default" ? modelId : { id: modelId, speed },
      ...(instructions ? { instructions } : {}),
      output_behavior:
        behavior === "create_new"
          ? { type: "create_new" }
          : { type: "update_existing", memory_store_id: memoryStoreId },
    };
    create.mutate(body, {
      onSuccess: (dream) => router.push(`/dreams/${dream.id}`),
    });
  };

  const error = create.error instanceof Error ? create.error.message : null;
  const requestId =
    create.error instanceof PlatformError ? create.error.requestId : null;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="dream-memory-store">Memory store</Label>
        <Input
          id="dream-memory-store"
          list="dream-memory-stores"
          value={memoryStoreId}
          onChange={(event) => setMemoryStoreId(event.target.value)}
          placeholder="memstore_…"
        />
        <datalist id="dream-memory-stores">
          {(stores.data?.memoryStores ?? []).map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          Choose an active store or paste its ID.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dream-sessions">Session IDs</Label>
        <textarea
          id="dream-sessions"
          className="min-h-28 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          value={sessions}
          onChange={(event) => setSessions(event.target.value)}
          placeholder="sesn_…"
        />
        <p
          className="text-xs text-muted-foreground"
          data-session-count={sessionIds.length}
        >
          {sessionIds.length} of 100 sessions · separate IDs with commas or new
          lines
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div className="space-y-1.5">
          <Label htmlFor="dream-model">Model</Label>
          <Input
            id="dream-model"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            placeholder="claude-sonnet-4-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dream-speed">Speed</Label>
          <Select
            value={speed}
            onValueChange={(value) => setSpeed(value as Speed)}
          >
            <SelectTrigger id="dream-speed" aria-label="Speed">
              <SelectValue>
                {speed[0].toUpperCase() + speed.slice(1)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="fast">Fast</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dream-instructions">Instructions (optional)</Label>
        <textarea
          id="dream-instructions"
          className="min-h-32 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="What should the consolidation retain or discard?"
        />
        <p
          className="text-xs text-muted-foreground"
          data-instruction-length={instructionLength}
        >
          {instructionLength.toLocaleString()} of 4,096 characters
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dream-output">Output</Label>
        <Select
          value={behavior}
          onValueChange={(value) => setBehavior(value as OutputBehavior)}
        >
          <SelectTrigger id="dream-output" aria-label="Output">
            <SelectValue>
              {behavior === "create_new"
                ? "Create a new memory store"
                : "Update the input store"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="create_new">
              Create a new memory store
            </SelectItem>
            <SelectItem value="update_existing">
              Update the input store
            </SelectItem>
          </SelectContent>
        </Select>
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
        <Button disabled={!canSubmit} onClick={submit}>
          Create dream
        </Button>
      </div>
    </div>
  );
}
