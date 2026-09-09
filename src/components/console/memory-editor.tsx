"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequestId } from "@/components/console/bits";
import { PlatformError } from "@/lib/platform/http";
import { useCreateMemory, useUpdateMemory } from "@/lib/platform/queries";
import type { Memory } from "@/lib/platform/types";

export function MemoryEditor({
  storeId,
  memory,
}: {
  storeId: string;
  memory?: Memory;
}) {
  const router = useRouter();
  const create = useCreateMemory(storeId);
  const update = useUpdateMemory(storeId, memory?.id ?? "");
  const mutation = memory ? update : create;
  const [path, setPath] = useState(memory?.path ?? "/");
  const [content, setContent] = useState(memory?.content ?? "");

  const save = () => {
    const body = memory
      ? {
          path,
          content,
          precondition: {
            type: "content_sha256" as const,
            content_sha256: memory.content_sha256,
          },
        }
      : { path, content };
    mutation.mutate(body, {
      onSuccess: (saved) =>
        router.push(`/memory-stores/${storeId}/memories/${saved.id}`),
    });
  };
  const error = mutation.error instanceof Error ? mutation.error.message : null;
  const requestId =
    mutation.error instanceof PlatformError ? mutation.error.requestId : null;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="memory-path">Path</Label>
        <Input
          id="memory-path"
          className="font-mono"
          value={path}
          onChange={(event) => setPath(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="memory-content">Content</Label>
        <textarea
          id="memory-content"
          className="min-h-80 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          value={content}
          onChange={(event) => setContent(event.target.value)}
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
        <Button disabled={!path || mutation.isPending} onClick={save}>
          {memory ? "Save memory" : "Create memory"}
        </Button>
      </div>
    </div>
  );
}
