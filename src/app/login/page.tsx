"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const noSubscription = () => () => {};

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Interactivity marker: before hydration a submit would fall back to the
  // browser's native handling; method="post" below keeps that fallback from
  // ever putting the password in the URL.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setBusy(true);
    setError(null);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      router.replace("/agents");
      return;
    }
    setError("Wrong password.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form
        method="post"
        onSubmit={submit}
        data-hydrated={hydrated || undefined}
        className="w-80 space-y-4"
      >
        <div>
          <h1 className="text-[22px] font-medium leading-7">Managed Agents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the console password to continue.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoFocus />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
