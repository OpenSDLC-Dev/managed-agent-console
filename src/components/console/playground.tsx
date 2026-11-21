"use client";

import {
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Plus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { PlaygroundViewSwitch } from "./playground-view-switch";
import {
  playgroundModels,
  runPlayground,
  type PlaygroundRequest,
  type PlaygroundReply,
} from "@/lib/platform/playground";
import { ErrorState } from "./bits";
import { PlaygroundCode } from "./playground-code";
import {
  newDraft,
  PlaygroundEditor,
  type PlaygroundDraft,
} from "./playground-editor";
import { PlaygroundTemplates } from "./playground-templates";
import { PlaygroundResponse, type RunStatus } from "./playground-response";

function Heading({ children }: { children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div>
        <h1 className="text-[22px] leading-7 font-medium">Playground</h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Build a Messages API request, see the model’s response, and copy the
          code.
        </p>
      </div>
      {children}
    </header>
  );
}

export function Playground() {
  const session = useContext(ConsoleSessionContext)?.data;
  return (
    <div
      data-playground
      className="-mx-4 -my-6 flex min-h-[calc(100dvh-var(--console-header-height))] flex-col bg-card sm:-mx-8 lg:h-[calc(100dvh-var(--console-header-height))]"
    >
      {session?.playground_access === true && session.id ? (
        <PlaygroundForm key={session.id} principalId={session.id} />
      ) : (
        <>
          <Heading />
          <p role="status" className="m-5 text-sm text-muted-foreground">
            {session?.playground_access === false
              ? "Ask an administrator to enable Playground access for your account."
              : "Playground is unavailable on this platform."}
          </p>
        </>
      )}
    </div>
  );
}

type PastRun = { draft: PlaygroundDraft; text: string; reply: PlaygroundReply };

function PlaygroundForm({ principalId }: { principalId: string }) {
  const models = useQuery({
    queryKey: ["playground-models", principalId],
    queryFn: ({ signal }) => playgroundModels(signal),
    retry: false,
  });
  const [draft, setDraft] = useState(newDraft);
  const [mode, setMode] = useState<"Form" | "Code">("Form");
  const [text, setText] = useState("");
  const [reply, setReply] = useState<PlaygroundReply>();
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string>();
  const [history, setHistory] = useState<PastRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const response = useRef<HTMLElement>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const model = draft.selection || models.data?.[0]?.id || "";
  const available = models.data?.some((entry) => entry.id === model) === true;
  const running = status === "running";
  const modifier =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? "⌘"
      : "Ctrl";
  const request: PlaygroundRequest = {
    model,
    max_tokens: Number(draft.tokens),
    ...(draft.system ? { system: draft.system } : {}),
    messages: draft.messages
      .filter((m) => m.content.length > 0)
      .map(({ role, content }) => ({ role, content })),
    stream: true,
  };
  function reset(prompt = "") {
    const next = newDraft();
    next.selection = available ? model : "";
    next.messages[0].content = prompt;
    setDraft(next);
    setText("");
    setReply(undefined);
    setError(undefined);
    setStatus("idle");
    setMode("Form");
    if (prompt)
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Prompt"]')
          ?.focus(),
      );
  }
  function addToMessages() {
    if (status !== "complete" || !text) return;
    const id = draft.messages[draft.messages.length - 1].id + 1;
    setDraft({
      ...draft,
      messages: [
        ...draft.messages.filter((message) => message.content.length > 0),
        { id, role: "assistant", content: text },
        { id: id + 1, role: "user", content: "" },
      ],
    });
    setMode("Form");
    setStatus("idle");
    setText("");
    setReply(undefined);
    setError(undefined);
    requestAnimationFrame(() =>
      document.getElementById(`playground-message-${id + 1}`)?.focus(),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || !available) return;
    const hasPrompt = request.messages.some((message) =>
      message.content.trim(),
    );
    if (
      !hasPrompt ||
      !Number.isInteger(request.max_tokens) ||
      request.max_tokens < 1
    ) {
      setError(
        hasPrompt
          ? "Enter a positive whole number for Max tokens in Model settings."
          : "Enter a prompt.",
      );
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setText("");
    setReply(undefined);
    setError(undefined);
    setStatus("running");
    if (window.matchMedia("(max-width: 1023px)").matches)
      response.current?.scrollIntoView({ block: "start" });
    try {
      let answer = "";
      const result = await runPlayground(
        request,
        principalId,
        controller.signal,
        (part) => {
          if (controller.signal.aborted) return;
          answer += part;
          setText(answer);
        },
      );
      if (controller.signal.aborted) return;
      setReply(result);
      setStatus("complete");
      setHistory((previous) =>
        [
          {
            draft: { ...draft, selection: model },
            text: answer,
            reply: result,
          },
          ...previous,
        ].slice(0, 20),
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        setStatus("failed");
        setError(
          cause instanceof Error ? cause.message : "The model request failed.",
        );
      }
    } finally {
      if (active.current === controller) active.current = null;
    }
  }
  return (
    <>
      <Heading>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={running}
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(true)}
          >
            History
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={running}
            onClick={() => reset()}
          >
            <Plus />
            New
          </Button>
        </div>
      </Heading>
      <div
        className="grid min-h-0 flex-1 lg:grid-cols-2"
        onKeyDown={(e) => {
          if (
            (e.metaKey || e.ctrlKey) &&
            e.key === "Enter" &&
            !e.defaultPrevented
          ) {
            e.preventDefault();
            if (e.shiftKey) addToMessages();
            else form.current?.requestSubmit();
          }
        }}
      >
        <form
          ref={form}
          aria-labelledby="playground-request"
          onSubmit={submit}
          method="post"
          className="flex min-h-0 min-w-0 flex-col border-b lg:border-r lg:border-b-0"
        >
          <div className="flex h-[50px] shrink-0 items-center justify-between gap-2 border-b px-5">
            <h2 id="playground-request" className="text-sm font-semibold">
              Build your request
            </h2>
            <PlaygroundViewSwitch
              label="Request view"
              options={["Form", "Code"] as const}
              value={mode}
              onChange={setMode}
            />
          </div>
          <div className="min-h-0 flex-1 space-y-3 px-5 py-4 lg:overflow-y-auto lg:[scrollbar-gutter:stable]">
            {models.error && <ErrorState error={models.error} />}
            {models.data?.length === 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                No chat models are configured.
              </p>
            )}
            {mode === "Form" ? (
              <PlaygroundEditor
                draft={draft}
                model={model}
                models={models.data ?? []}
                running={running}
                loading={models.isPending}
                onChange={setDraft}
              />
            ) : (
              <PlaygroundCode request={request} />
            )}
            {error && status !== "failed" && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex shrink-0 justify-end border-t px-5 py-2">
            {running ? (
              <Button
                key="stop"
                type="button"
                size="sm"
                onClick={(event) => {
                  event.preventDefault();
                  active.current?.abort();
                  active.current = null;
                  setStatus("stopped");
                }}
              >
                <Square />
                Stop
              </Button>
            ) : (
              <Button
                key="run"
                type="submit"
                size="sm"
                aria-label="Run prompt"
                aria-keyshortcuts="Meta+Enter Control+Enter"
                disabled={!available}
              >
                <Play />
                Run{" "}
                <kbd
                  aria-hidden
                  className="ml-1 rounded bg-background/20 px-1 font-mono text-xs"
                >
                  {modifier} ↵
                </kbd>
              </Button>
            )}
          </div>
        </form>
        <section
          ref={response}
          aria-label="Response"
          className="flex min-w-0 scroll-mt-(--console-header-height) flex-col lg:overflow-y-auto"
        >
          {status === "idle" ? (
            <>
              <span role="status" data-run-status="idle" className="sr-only" />
              {request.messages.length || draft.system ? (
                <div className="m-auto px-5 py-16 text-center">
                  <Play
                    aria-hidden
                    className="mx-auto mb-3 size-7 text-muted-foreground"
                  />
                  <h3 className="text-sm font-semibold">Press Run</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    The full API response will appear here.
                  </p>
                </div>
              ) : (
                <PlaygroundTemplates onSelect={reset} />
              )}
            </>
          ) : (
            <PlaygroundResponse
              status={status}
              text={text}
              error={error}
              reply={reply}
              onAdd={addToMessages}
              modifier={modifier}
            />
          )}
        </section>
      </div>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          className="top-[calc(var(--console-header-height)+5.5rem)] right-4 left-auto max-h-[calc(100dvh-var(--console-header-height)-7rem)] w-[27rem] translate-x-0 translate-y-0 overflow-auto p-5 sm:max-w-[calc(100vw-2rem)]"
        >
          <div className="flex items-center justify-between">
            <DialogTitle>History</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close history"
              onClick={() => setHistoryOpen(false)}
            >
              <X />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Completed requests from this visit.
          </p>
          {history.length ? (
            history.map((entry, i) => (
              <button
                type="button"
                key={i}
                className="truncate rounded-lg bg-muted/60 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setDraft(entry.draft);
                  setText(entry.text);
                  setReply(entry.reply);
                  setStatus("complete");
                  setError(undefined);
                  setHistoryOpen(false);
                  setMode("Form");
                }}
              >
                {entry.draft.messages.find((m) => m.content)?.content}
              </button>
            ))
          ) : (
            <p className="text-sm">No requests yet.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
