"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ExactResourceLookup({
  resource,
  path,
}: {
  resource: string;
  path: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  return (
    <form
      className="flex min-w-0 max-w-full gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const id = input.current?.value.trim();
        if (id) router.push(path + "/" + encodeURIComponent(id));
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
