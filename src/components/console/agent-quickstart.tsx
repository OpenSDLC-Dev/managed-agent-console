"use client";

import { useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  CalendarClock,
  FileText,
  GitFork,
  LoaderCircle,
  Target,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { useUnsavedChanges } from "@/components/shell/unsaved-changes";
import { useListFilters } from "@/lib/use-list-filters";
import {
  starters,
  starterConfig,
  type Starter,
} from "@/lib/agent-config/quickstart";
import { fromRaw, toRaw } from "@/lib/agent-config/raw";
import { runPlayground } from "@/lib/platform/playground";
import { usePlaygroundModels } from "@/lib/platform/playground-queries";
import { useCreateAgent, type AgentWriteBody } from "@/lib/platform/queries";
import { useModelChoices } from "./model-field";
import { AgentConfigView } from "./agent-config-view";
import { CreatedAgent } from "./agent-quickstart-created";

function ConnectorMark({ name }: { name: string }) {
  return (
    <Image
      src={`/brands/connectors/${name}.png`}
      alt=""
      width={14}
      height={14}
      unoptimized
      className="size-3.5 object-contain"
    />
  );
}

function StarterBadges({ starter }: { starter: Starter }) {
  const Icon =
    starter.badge === "Recurring"
      ? CalendarClock
      : starter.badge === "Dynamic workflow"
        ? GitFork
        : Target;
  return (
    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
      {starter.servers?.map((s) => (
        <span
          key={s}
          title={s}
          aria-label={s}
          className="grid size-[19px] place-items-center rounded border bg-muted"
        >
          <ConnectorMark name={s} />
        </span>
      ))}
      {starter.skill && (
        <span className="inline-flex items-center gap-1">
          <FileText className="size-3" />
          {starter.skill}
        </span>
      )}
      {starter.badge && (
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
          <Icon className="size-3" />
          {starter.badge}
        </span>
      )}
    </div>
  );
}
function TemplatePreview({
  starter,
  model,
  close,
  pending,
  use,
}: {
  starter: Starter;
  model: string;
  close: () => void;
  pending: boolean;
  use: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 p-4 sm:max-w-[1024px]">
        <header className="pr-7">
          <DialogTitle>{starter.title}</DialogTitle>
          <DialogDescription className="mt-2">
            {starter.description}
          </DialogDescription>
        </header>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {starter.servers && (
            <div>
              <h3 className="text-sm font-medium">MCP servers</h3>
              <div className="mt-1 flex flex-wrap gap-2">
                {starter.servers.map((x) => (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
                    key={x}
                  >
                    <ConnectorMark name={x} />
                    {x}
                  </span>
                ))}
              </div>
            </div>
          )}
          {starter.skill && (
            <div className="text-sm">
              Skills{" "}
              <span className="ml-2 rounded-md bg-muted px-2 py-1">
                {starter.skill}
              </span>
            </div>
          )}
          {starter.schedule && (
            <div className="text-sm">
              Suggested schedule{" "}
              <span className="ml-2 text-muted-foreground">
                {starter.schedule}
              </span>
            </div>
          )}
          {(starter.note || starter.badge === "Dynamic workflow") && (
            <p className="text-[13px] text-muted-foreground">
              {starter.note ??
                "This Platform runs this template as a single agent. You can configure a coordinator roster in the agent editor."}
            </p>
          )}
          <div className="flex max-h-[448px] min-h-0 flex-col rounded-lg bg-muted/70 px-3 pb-3 pt-1">
            <AgentConfigView config={starterConfig(model, starter)} />
          </div>
        </div>
        <footer className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" disabled={pending} onClick={use}>
            Use this template
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
const generatorInstructions =
  "You help a user draft a Managed Agents configuration. Return only a JSON object with three strings: name, description, system. Keep the configuration faithful to the request. Preserve existing instructions when refining unless the user asks to change them. Do not run tools or create resources.";
type Message = { role: "user" | "assistant"; text: string };
export function AgentQuickstart() {
  const nav = useListFilters();
  const selected = starters.find((x) => x.key === nav.params.get("template"));
  const building = nav.params.get("step") === "draft";
  const saved = nav.params.get("agent");
  const account = useContext(ConsoleSessionContext)?.data;
  const identity = account?.playground_access === true ? account.id : undefined;
  const availableModels = usePlaygroundModels(identity);
  const choices = useModelChoices();
  const discovered = availableModels.isError ? undefined : availableModels.data;
  const names = discovered?.map((m) => m.id) ?? choices.names ?? [];
  const model = names.includes("deepseek-flash")
    ? "deepseek-flash"
    : (names[0] ?? "");
  const generationModel = discovered?.find((m) => m.id === model);
  const [description, setDescription] = useState("");
  const [reply, setReply] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(true);
  const [refining, setRefining] = useState(false);
  const running = useRef<AbortController | null>(null);
  // A confirmed write can finish after the operator has left this draft.
  const submission = useRef<object | null>(null);
  const replyField = useRef<HTMLTextAreaElement>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const create = useCreateAgent();
  const leave = useUnsavedChanges(!saved && building && draft !== null);
  useEffect(
    () => () => {
      submission.current = null;
    },
    [building, selected?.key],
  );
  useEffect(() => () => running.current?.abort(), []);
  useEffect(() => {
    if (!building) {
      running.current?.abort();
    }
  }, [building]);
  const yaml = draft ?? toRaw(starterConfig(model, selected), "yaml");
  const parsed = fromRaw(yaml, "yaml");
  const config = (parsed.config ?? {}) as AgentWriteBody;
  const waitingForModel =
    identity && !availableModels.isError
      ? availableModels.isPending
      : choices.pending;
  function start(starter?: Starter) {
    if (create.isPending || busy || waitingForModel) return;
    create.reset();
    setFailure("");
    setPanel(true);
    setReply("");
    setRefining(false);
    const prompt = starter ? starter.title : description.trim();
    const base = starterConfig(model, starter);
    if (!starter) {
      base.system = prompt;
      base.description = prompt;
      base.name = prompt.split(/\r?\n/)[0].slice(0, 72);
    }
    setDraft(toRaw(base, "yaml"));
    setMessages([{ role: "user", text: prompt }]);
    nav.update({ step: "draft", template: starter?.key ?? null, agent: null });
    if (!starter && identity && generationModel) void generate(prompt, base);
  }
  async function generate(prompt: string, base: AgentWriteBody) {
    if (!identity || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setFailure("");
    create.reset();
    try {
      const text: string[] = [];
      await runPlayground(
        {
          model,
          max_tokens:
            generationModel?.max_tokens && generationModel.max_tokens > 0
              ? Math.min(1500, generationModel.max_tokens)
              : 1500,
          stream: false,
          system: generatorInstructions,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                request: prompt,
                current: {
                  name: base.name,
                  description: base.description,
                  system: base.system,
                },
              }),
            },
          ],
        },
        identity,
        controller.signal,
        (t) => text.push(t),
      );
      const obj = JSON.parse(
        text
          .join("")
          .trim()
          .replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi, ""),
      );
      if (
        !obj ||
        ["name", "description", "system"].some(
          (k) => typeof obj[k] !== "string",
        )
      )
        throw Error("The model did not return a usable agent configuration.");
      if (!controller.signal.aborted) {
        setDraft(
          toRaw(
            {
              ...base,
              name: obj.name,
              description: obj.description,
              system: obj.system,
            },
            "yaml",
          ),
        );
        setRefining(false);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setFailure(
          error instanceof Error
            ? error.message
            : "Unable to generate the configuration.",
        );
    } finally {
      if (running.current === controller) {
        running.current = null;
        setBusy(false);
      }
    }
  }
  const closePreview = () => {
    const trigger = previewTrigger.current;
    if (trigger && trigger.dataset.template === selected?.key) {
      window.addEventListener(
        "popstate",
        () => requestAnimationFrame(() => trigger.focus()),
        { once: true },
      );
      window.history.back();
    } else {
      nav.update({ template: null }, "replace");
    }
  };
  if (saved) return <CreatedAgent key={saved} id={saved} />;
  if (!building)
    return (
      <div className="-mx-4 -my-6 flex flex-col items-center gap-10 px-5 py-16 sm:-mx-8 sm:px-10">
        <div className="flex w-full max-w-2xl flex-col gap-7">
          <header className="text-center">
            <h1 className="font-serif text-[22px] leading-7 font-medium">
              What do you want to build?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Describe your agent, or pick a template to start from.
            </p>
          </header>
          <form
            className="flex min-h-[86px] items-end gap-3 rounded-xl border bg-card p-3 shadow-sm focus-within:border-muted-foreground"
            onSubmit={(e) => {
              e.preventDefault();
              if (description.trim()) start();
            }}
          >
            <textarea
              aria-label="Describe your agent"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (description.trim()) start();
                }
              }}
              placeholder="A support agent that answers questions from our docs and escalates to Slack when it’s stuck…"
              rows={2}
              className="min-w-0 flex-1 resize-none self-stretch bg-transparent px-1 py-0.5 text-sm placeholder:text-muted-foreground focus:outline-none"
            />
            <Button
              size="icon-sm"
              type="submit"
              className="rounded-full"
              aria-label="Create agent"
              disabled={!description.trim() || busy || waitingForModel}
            >
              <ArrowUp />
            </Button>
          </form>
        </div>
        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {starters.map((s) => (
            <button
              key={s.key}
              data-template={s.key}
              onClick={(e) => {
                previewTrigger.current = e.currentTarget;
                nav.update({ template: s.key });
              }}
              aria-label={s.title}
              className="flex min-h-[128px] flex-col gap-2 rounded-xl border bg-card p-3.5 text-left hover:border-muted-foreground/50 hover:bg-muted/50"
            >
              <span className="text-sm font-medium">{s.title}</span>
              <span className="text-[13px] leading-[17px] text-muted-foreground">
                {s.description}
              </span>
              <StarterBadges starter={s} />
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Or{" "}
          <Link
            className="text-foreground underline underline-offset-2"
            href="/agents/new"
          >
            start from a blank agent
          </Link>
          .
        </p>
        {selected && (
          <TemplatePreview
            key={selected.key}
            starter={selected}
            model={model}
            close={closePreview}
            pending={Boolean(waitingForModel)}
            use={() => start(selected)}
          />
        )}
      </div>
    );
  const canGenerate = !!identity && !!generationModel;
  function refine() {
    const text = reply.trim();
    if (!text || busy || create.isPending || parsed.error || !canGenerate)
      return;
    setReply("");
    setMessages((m) => [...m, { role: "user", text }]);
    void generate(text, config);
  }
  async function confirm() {
    if (parsed.error || create.isPending || busy || submission.current) return;
    const current = {};
    submission.current = current;
    setFailure("");
    try {
      const agent = await create.mutateAsync(config);
      if (submission.current !== current) return;
      leave.setDirty(false);
      setDraft(null);
      setDescription("");
      setMessages([]);
      nav.update({ step: null, template: null, agent: agent.id }, "replace");
    } catch {
      /* The mutation error stays visible with the editable draft. */
    } finally {
      if (submission.current === current) submission.current = null;
    }
  }
  return (
    <div className="-mx-4 -my-6 grid min-h-[calc(100dvh-var(--console-header-height))] grid-cols-1 sm:-mx-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,42%)]">
      <section className="flex min-w-0 flex-col gap-5 p-5 sm:p-7">
        <button
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
          onClick={() =>
            leave.requestLeave(() => {
              submission.current = null;
              leave.setDirty(false);
              running.current?.abort();
              setDraft(null);
              nav.update({ step: null, template: null }, "replace");
            })
          }
        >
          <ArrowLeft className="size-4" />
          Templates
        </button>
        <h1 className="sr-only">Build your agent</h1>
        {messages.length ? (
          messages.map((m, i) => (
            <p
              key={i}
              className="ml-auto max-w-[90%] rounded-xl bg-muted px-4 py-3 text-sm whitespace-pre-wrap"
            >
              {m.text}
            </p>
          ))
        ) : (
          <p className="text-sm">
            {selected?.title ?? "Review your agent configuration."}
          </p>
        )}
        <div className="rounded-xl border p-4 text-sm">
          {busy ? (
            <p role="status" className="flex gap-2">
              <LoaderCircle className="size-4 animate-spin" />
              Building your configuration…
            </p>
          ) : (
            <>
              <h2 className="font-medium">
                {refining ? "Refine your agent" : "Create this agent?"}
              </h2>
              <p className="my-2 text-muted-foreground">
                {canGenerate
                  ? "Edit the configuration or describe a change in the conversation."
                  : "Edit the configuration, then confirm to create a versioned agent."}
              </p>
              {!panel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPanel(true)}
                >
                  Open agent config
                </Button>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRefining(true);
                    setPanel(true);
                    if (canGenerate) replyField.current?.focus();
                  }}
                >
                  Keep refining
                </Button>
                <Button
                  size="sm"
                  onClick={confirm}
                  disabled={create.isPending || !!parsed.error}
                >
                  {create.isPending ? "Creating…" : "Create agent"}
                </Button>
              </div>
            </>
          )}
        </div>
        {(failure || create.error) && (
          <p role="alert" className="text-sm text-destructive">
            {failure || create.error?.message}
          </p>
        )}
        {canGenerate && (
          <form
            className="mt-auto flex items-end gap-2 rounded-xl border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              refine();
            }}
          >
            <textarea
              ref={replyField}
              aria-label="Reply"
              placeholder="Reply…"
              className="min-h-14 flex-1 resize-none bg-transparent text-sm"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  refine();
                }
              }}
            />
            {busy ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => running.current?.abort()}
              >
                Stop
              </Button>
            ) : (
              <Button
                size="icon-sm"
                type="submit"
                aria-label="Send message"
                disabled={!reply.trim() || create.isPending || !!parsed.error}
              >
                <ArrowUp />
              </Button>
            )}
          </form>
        )}
      </section>
      {panel && (
        <aside className="flex min-h-[360px] min-w-0 flex-col gap-4 border-t p-5 lg:border-t-0 lg:border-l">
          <header className="flex items-center gap-2 text-sm">
            <Bot className="size-4" />
            <h2 className="font-medium">
              {String(config.name ?? "Untitled agent")}
            </h2>
            <span className="rounded bg-muted px-1.5 text-xs">Draft</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close panel"
              className="ml-auto"
              onClick={() => setPanel(false)}
            >
              <X />
            </Button>
          </header>
          <AgentConfigView
            config={config}
            yaml={yaml}
            onEdit={busy || create.isPending ? undefined : setDraft}
          />
          {parsed.error && (
            <p role="alert" className="text-sm text-destructive">
              {parsed.error}
            </p>
          )}
          {!model && (
            <p className="text-sm text-muted-foreground">
              Set a model ID in the configuration before creating the agent.
            </p>
          )}
        </aside>
      )}
    </div>
  );
}
