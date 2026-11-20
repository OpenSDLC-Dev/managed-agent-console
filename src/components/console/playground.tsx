"use client";

import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shell/page-header";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { ErrorState } from "./bits";
import { playgroundModels, runPlayground } from "@/lib/platform/playground";

const input =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";

export function Playground() {
  const session = useContext(ConsoleSessionContext)?.data;
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Playground" />
      {session?.playground_access === true && session.id ? (
        <PlaygroundForm principalId={session.id} />
      ) : (
        <p
          role="status"
          className="rounded-xl border p-5 text-sm text-muted-foreground"
        >
          {session?.playground_access === false
            ? "Ask an administrator to enable Playground access for your account."
            : "Playground is unavailable on this platform."}
        </p>
      )}
    </div>
  );
}

function PlaygroundForm({ principalId }: { principalId: string }) {
  const models = useQuery({
    queryKey: ["playground-models", principalId],
    queryFn: ({ signal }) => playgroundModels(signal),
    retry: false,
  });
  const [selection, setSelection] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<
    "idle" | "running" | "complete" | "stopped" | "failed"
  >("idle");
  const [error, setError] = useState<string>();
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const model =
    models.data?.find((m) => m.id === selection)?.id ??
    models.data?.[0]?.id ??
    "";
  const running = status === "running";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || !model) return;
    const fields = new FormData(event.currentTarget);
    const prompt = String(fields.get("prompt") ?? "");
    if (!prompt.trim()) {
      setError("Enter a prompt.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setText("");
    setError(undefined);
    setStatus("running");
    try {
      await runPlayground(
        {
          model,
          prompt,
          system: String(fields.get("system") ?? ""),
          maxTokens: Number(fields.get("tokens")),
        },
        principalId,
        controller.signal,
        (part) => setText((previous) => previous + part),
      );
      setStatus("complete");
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus("stopped");
      } else {
        setStatus("failed");
        setError(
          error instanceof Error ? error.message : "The model request failed.",
        );
      }
    } finally {
      active.current = null;
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        aria-labelledby="playground-request"
        method="post"
        onSubmit={submit}
        className="space-y-4 rounded-xl border bg-card p-5"
      >
        <h2 id="playground-request" className="text-sm font-semibold">
          Request
        </h2>
        {models.error ? <ErrorState error={models.error} /> : null}
        {models.data?.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            No chat models are configured.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <div className="space-y-1.5">
            <Label htmlFor="playground-model">Model</Label>
            <select
              id="playground-model"
              value={model}
              onChange={(e) => setSelection(e.target.value)}
              disabled={running || !model}
              className={input}
            >
              {model ? (
                models.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))
              ) : (
                <option value="">
                  {models.isPending ? "Loading models…" : "No models"}
                </option>
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="playground-tokens">Max tokens</Label>
            <Input
              id="playground-tokens"
              name="tokens"
              type="number"
              min={1}
              step={1}
              defaultValue={1024}
              disabled={running}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="playground-system">
            System instruction{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <textarea
            id="playground-system"
            name="system"
            rows={2}
            disabled={running}
            className={input}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="playground-prompt">Prompt</Label>
          <textarea
            id="playground-prompt"
            name="prompt"
            rows={5}
            disabled={running}
            required
            className={input}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={running || !model}>
            Run prompt
          </Button>
          {running ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => active.current?.abort()}
            >
              Stop
            </Button>
          ) : null}
        </div>
      </form>
      <section
        aria-labelledby="playground-response"
        className="min-w-0 rounded-xl border bg-card p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="playground-response" className="text-sm font-semibold">
            Response
          </h2>
          <span
            role="status"
            data-run-status={status}
            className="text-xs text-muted-foreground"
          >
            {
              {
                idle: "",
                running: "Generating…",
                complete: "Complete",
                stopped: "Stopped",
                failed: "Failed",
              }[status]
            }
          </span>
        </div>
        {error ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div
          aria-busy={running}
          className="wrap-break-word whitespace-pre-wrap text-sm leading-6"
        >
          {text}
        </div>
      </section>
    </div>
  );
}
