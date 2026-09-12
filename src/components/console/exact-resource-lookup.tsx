"use client";
import { useRef, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ExactResourceLookup({
  resource,
  path,
  onOpen,
  inputRef,
}: {
  resource: string;
  path: string;
  onOpen?: (id: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const localInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? localInput;
  const router = useRouter();
  return (
    <form
      className="flex min-w-0 max-w-full gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const id = input.current?.value.trim();
        if (id) {
          if (onOpen) onOpen(id);
          else router.push(path + "/" + encodeURIComponent(id));
        }
      }}
    >
      <Input
        ref={input}
        aria-label={"Find " + resource + " by ID"}
        placeholder={"Find " + resource + " by ID"}
        className="h-8 w-56 min-w-0"
      />
      <Button type="submit" variant="outline" size="sm">
        Open
      </Button>
    </form>
  );
}
