"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { generateAgentDraft } from "@/lib/agent-config/generate";
import {
  manualStarterConfig,
  manualStarters,
} from "@/lib/agent-config/templates";
import type { Starter } from "@/lib/agent-config/quickstart";
import { usePlaygroundModels } from "@/lib/platform/playground-queries";
import type { AgentWriteBody } from "@/lib/platform/queries";
import { cn } from "@/lib/utils";

function draftModelId(model: unknown): string {
  if (typeof model === "string") return model;
  return model &&
    typeof model === "object" &&
    "id" in model &&
    typeof model.id === "string"
    ? model.id
    : "";
}

export function AgentStartingPoint({
  getConfig,
  apply,
  confirmReplace,
  setPromptDirty,
  busy,
  setBusy,
  saving,
}: {
  getConfig: (fields: "model" | "all") => AgentWriteBody | null;
  apply: (config: AgentWriteBody, source: "template" | "description") => void;
  confirmReplace: (
    action: () => void,
    source: "template" | "description",
  ) => void;
  setPromptDirty: (dirty: boolean) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  saving: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState("Describe your agent");
  const [title, setTitle] = useState("Blank agent");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const running = useRef<AbortController | null>(null);
  const session = useContext(ConsoleSessionContext)?.data;
  const identity = session?.playground_access ? session.id : undefined;
  const models = usePlaygroundModels(identity);
  const available = models.isError ? undefined : models.data;
  useEffect(() => () => running.current?.abort(), []);

  function finish(
    config: AgentWriteBody,
    label: string,
    source: "template" | "description",
  ) {
    apply(config, source);
    setTitle(label);
    setError("");
    setPromptDirty(false);
    setOpen(false);
    trigger.current?.focus();
  }
  function select(starter?: Starter) {
    const base = getConfig("model");
    if (!base) return;
    confirmReplace(() => {
      setPrompt("");
      finish(
        manualStarterConfig(draftModelId(base.model), starter),
        starter?.title ?? "Blank agent",
        "template",
      );
    }, "template");
  }
  async function generate() {
    if (!identity || !available?.length || !prompt.trim() || running.current)
      return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError("");
    try {
      const base = getConfig("all");
      if (!base) return;
      const requested = draftModelId(base.model);
      const generator = requested
        ? available.find((item) => item.id === requested)
        : available[0];
      if (!generator)
        throw new Error("The selected model is unavailable in Playground.");

      const fields = await generateAgentDraft(
        prompt.trim(),
        base,
        generator,
        identity,
        controller.signal,
      );
      if (!controller.signal.aborted)
        finish({ ...base, ...fields }, fields.name, "description");
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Unable to generate the configuration.",
        );
    } finally {
      running.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="mb-4">
      <button
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-sm text-left text-sm font-medium"
      >
        <ChevronRight
          aria-hidden
          className={cn("size-4", open && "rotate-90")}
        />
        Starting point{" "}
        <span className="ml-1 truncate font-normal text-muted-foreground">
          {title}
        </span>
      </button>
      {open && (
        <fieldset
          id={id}
          disabled={busy || saving}
          className="mt-3 min-w-0 space-y-3"
        >
          <div
            role="radiogroup"
            aria-label="Starting point"
            className="flex rounded-lg bg-secondary p-0.5"
          >
            {["Describe your agent", "Template"].map((item) => (
              <label
                key={item}
                className={cn(
                  "relative flex-1 cursor-pointer rounded-md py-0.5 text-center text-sm has-focus-visible:outline-2",
                  mode === item && "bg-background shadow-sm",
                )}
              >
                <input
                  type="radio"
                  name={id}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  checked={mode === item}
                  onChange={() => setMode(item)}
                />
                {item}
              </label>
            ))}
          </div>
          {mode === "Template" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[undefined, ...manualStarters].map((starter) => {
                const name = starter?.title ?? "Blank agent";
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    aria-pressed={name === title}
                    onClick={() => select(starter)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border bg-card p-4 text-left text-sm hover:bg-secondary/50",
                      name === title && "border-foreground",
                    )}
                  >
                    <span className="font-medium">{name}</span>
                    <span className="text-[13px] leading-5 text-muted-foreground">
                      {starter?.description ??
                        "Start from scratch with the core toolset and a general-purpose prompt."}
                    </span>
                    {starter?.badge === "Outcome-optimizing" && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Target className="size-3" />
                        {starter.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <textarea
                aria-label="Describe your agent"
                className="block h-14 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
                placeholder="Summarizes new GitHub PRs and posts a digest to Slack."
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setPromptDirty(Boolean(e.target.value));
                  setError("");
                }}
              />
              <div className="flex items-center justify-end gap-3">
                {error && (
                  <span
                    role="alert"
                    className="mr-auto text-sm text-destructive"
                  >
                    {error}
                  </span>
                )}
                {prompt.trim() &&
                  !available?.length &&
                  (!identity || !models.isPending) && (
                    <span className="mr-auto text-sm text-muted-foreground">
                      {identity
                        ? "No Playground model is available to generate this draft."
                        : "Generating a draft requires Playground access."}
                    </span>
                  )}
                <Button
                  type="button"
                  size="sm"
                  disabled={!prompt.trim() || !available?.length || busy}
                  onClick={() =>
                    confirmReplace(() => void generate(), "description")
                  }
                >
                  {busy ? "Generating…" : "Generate"}
                </Button>
              </div>
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
