"use client";

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Play, Plus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { PlaygroundViewSwitch } from "./playground-view-switch";
import {
  runPlayground,
  type PlaygroundRequest,
  type PlaygroundReply,
} from "@/lib/platform/playground";
import { usePlaygroundModels } from "@/lib/platform/playground-queries";
import { ErrorState } from "./bits";
import { PlaygroundCode } from "./playground-code";
import {
  formatSnippet,
  hasMessageContent,
  thinkingLimitCorrection,
  historyLabel,
  wireMessage,
  readSnippet,
  type CodeLanguage,
} from "./playground-snippet";
import {
  newDraft,
  PlaygroundEditor,
  type PlaygroundDraft,
} from "./playground-editor";
import {
  PlaygroundTemplates,
  type PlaygroundTemplate,
} from "./playground-templates";
import { PlaygroundPanes } from "./playground-panes";
import {
  PlaygroundResponse,
  previewToolInput,
  type RunStatus,
  type ToolInputPreview,
} from "./playground-response";

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

export function Playground({ requestedAlias }: { requestedAlias?: string }) {
  const session = useContext(ConsoleSessionContext)?.data;
  return (
    <div
      data-playground
      className="-mx-4 -my-6 flex min-h-[calc(100dvh-var(--console-header-height))] flex-col bg-card sm:-mx-8 lg:h-[calc(100dvh-var(--console-header-height))]"
    >
      {session?.playground_access === true && session.id ? (
        <PlaygroundForm
          key={session.id}
          principalId={session.id}
          requestedAlias={requestedAlias}
        />
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

type PastRun = {
  draft: PlaygroundDraft;
  text: string;
  reply: PlaygroundReply;
  completedAt: Date;
};

function PlaygroundForm({
  principalId,
  requestedAlias,
}: {
  principalId: string;
  requestedAlias?: string;
}) {
  const models = usePlaygroundModels(principalId);
  const [draft, setDraft] = useState(newDraft);
  const [expandedTool, setExpandedTool] = useState<number | null>(null);
  const [template, setTemplate] = useState<{
    title: string;
    draft: PlaygroundDraft;
  }>();
  const [previousAlias, setPreviousAlias] = useState(requestedAlias);
  const [mode, setMode] = useState<"Form" | "Code" | "Full request">("Form");
  const [language, setLanguage] = useState<CodeLanguage>("cURL");
  const [code, setCode] = useState<{ text: string; error?: string }>();
  const [showCodeError, setShowCodeError] = useState(false);
  const [text, setText] = useState("");
  const [toolInputs, setToolInputs] = useState<ToolInputPreview[]>([]);
  const [reply, setReply] = useState<PlaygroundReply>();
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string>();
  const [history, setHistory] = useState<PastRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const historyPanel = useRef<HTMLElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const response = useRef<HTMLElement>(null);
  const active = useRef<AbortController | null>(null);
  const nextFocusId = useRef<string | null>(null);
  const fullRequestOpener = useRef("playground-request-options");
  useLayoutEffect(() => {
    // Restore focus when the new field mounts, before later clicks or typing.
    const id = nextFocusId.current;
    if (!id) return;
    nextFocusId.current = null;
    const target =
      document.getElementById(id) ??
      (id === fullRequestOpener.current
        ? document.getElementById("playground-request-options")
        : null);
    target?.focus();
  });
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!historyOpen) return;
    const panel = historyPanel.current;
    (
      panel?.querySelector<HTMLButtonElement>("[data-history-entry]") ??
      panel?.querySelector("button")
    )?.focus();
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setHistoryOpen(false);
        historyToggle.current?.focus();
      }
    }
    function dismissOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !panel?.contains(event.target) &&
        !historyToggle.current?.contains(event.target)
      )
        setHistoryOpen(false);
    }
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [historyOpen]);

  // A query-only navigation can reuse this form. Keep its prompt and history.
  if (previousAlias !== requestedAlias) {
    setPreviousAlias(requestedAlias);
    if (draft.selection) setDraft({ ...draft, selection: "" });
    if (code && !code.error) setCode(undefined);
  }
  const chatModels = models.isError ? undefined : models.data;
  const initialModel = requestedAlias
    ? chatModels?.find((entry) => entry.id === requestedAlias)
    : chatModels?.[0];
  const model = draft.selection || initialModel?.id || "";
  const available = chatModels?.some((entry) => entry.id === model) === true;
  const running = status === "running";
  const modifier =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? "⌘"
      : "Ctrl";
  const request: PlaygroundRequest = {
    ...draft.parameters,
    model,
    max_tokens: Number(draft.tokens),
    ...(draft.system || draft.includeEmptySystem
      ? { system: draft.system }
      : {}),
    messages: draft.messages.filter(hasMessageContent).map(wireMessage),
    ...(draft.stream !== undefined ? { stream: draft.stream } : {}),
  };
  const selectedTemplate =
    template?.draft === draft ? template.title : undefined;
  const budgetCorrection = thinkingLimitCorrection(draft);
  const codeLanguage = mode === "Full request" ? "JSON" : language;
  function editCode(text: string) {
    setShowCodeError(false);
    try {
      const next = readSnippet(text, codeLanguage, draft);
      setDraft(next);
      setCode({ text });
    } catch (cause) {
      setCode({
        text,
        error: cause instanceof Error ? cause.message : "Invalid request code.",
      });
    }
  }
  function codeReady(checkTools = false) {
    const invalid = checkTools
      ? draft.toolSchemas?.findIndex((schema) => schema?.invalid)
      : undefined;
    if (invalid !== undefined && invalid >= 0) {
      const field = `playground-tool-${invalid}-schema`;
      if (expandedTool === invalid) document.getElementById(field)?.focus();
      else {
        nextFocusId.current = field;
        setExpandedTool(invalid);
      }
      return false;
    }
    if (!code?.error) return true;
    setShowCodeError(true);
    document.getElementById("playground-code")?.focus();
    return false;
  }
  function reset(preset?: PlaygroundTemplate) {
    if (!codeReady()) return;
    const next = newDraft();
    next.selection = preset || available ? model : "";
    if (preset) {
      next.tokens = draft.tokens;
      next.stream = preset.stream ?? draft.stream;
      next.system = preset.system;
      next.messages[0].content = preset.prompt;
      next.parameters = {
        ...draft.parameters,
        tools: structuredClone(preset.tools),
      };
      delete next.parameters.tool_choice;
    }
    setExpandedTool(null);
    setTemplate(preset ? { title: preset.title, draft: next } : undefined);
    setDraft(next);
    setCode(undefined);
    setText("");
    setReply(undefined);
    setError(undefined);
    setStatus("idle");
    // Full request edits the previous Form draft. A selected Code view and
    // its snippet language continue with the new template.
    if (!preset || mode === "Full request") setMode("Form");
    setHistoryOpen(false);
  }
  function addToMessages() {
    const blocks = reply?.content;
    if (status !== "complete" || !blocks?.length || !codeReady()) return;
    const id = draft.messages[draft.messages.length - 1].id + 1;
    const messages = draft.messages.filter(hasMessageContent);
    const last = messages.at(-1);
    // Messages continues a final assistant prefill in the same turn.
    if (last?.role === "assistant") {
      const first = blocks[0];
      // A plain text delta continues its prefill. Annotated blocks retain
      // their boundaries, text offsets, signatures and tool inputs.
      let content = blocks;
      if (
        typeof last.content === "string" &&
        first.type === "text" &&
        typeof first.text === "string" &&
        Object.keys(first).length === 2
      )
        content = [
          { ...first, text: last.content + first.text },
          ...blocks.slice(1),
        ];
      else {
        const prefix =
          typeof last.content === "string"
            ? [{ type: "text", text: last.content }]
            : last.content;
        content = [...prefix, ...blocks];
      }
      messages[messages.length - 1] = { ...last, content };
    } else messages.push({ id, role: "assistant", content: blocks });
    nextFocusId.current = `playground-message-${id + 1}`;
    setDraft({
      ...draft,
      messages: [...messages, { id: id + 1, role: "user", content: "" }],
    });
    setMode("Form");
    setCode(undefined);
    setStatus("idle");
    setText("");
    setReply(undefined);
    setError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      active.current ||
      !codeReady(true) ||
      !available ||
      budgetCorrection !== undefined
    )
      return;
    const hasPrompt = request.messages.some(({ content }) =>
      typeof content === "string" ? content.trim() : content.length,
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
    setHistoryOpen(false);
    setText("");
    setToolInputs([]);
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
        (delta) => {
          if (!controller.signal.aborted)
            setToolInputs((previous) => previewToolInput(previous, delta));
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
            completedAt: new Date(),
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
      if (active.current === controller) {
        active.current = null;
        setToolInputs([]);
      }
    }
  }
  return (
    <>
      <Heading>
        <div className="flex items-center gap-1">
          <Button
            ref={historyToggle}
            variant="ghost"
            size="sm"
            disabled={running}
            aria-controls="playground-history"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(!historyOpen)}
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
      <PlaygroundPanes
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
              value={mode === "Code" ? "Code" : "Form"}
              onChange={(next) => {
                if (!codeReady(true)) return;
                if (mode === "Full request") setCode(undefined);
                setMode(next);
              }}
            />
          </div>
          <div className="min-h-0 flex-1 space-y-3 px-5 py-4 lg:overflow-y-auto lg:[scrollbar-gutter:stable]">
            {models.error && <ErrorState error={models.error} />}
            {chatModels?.length === 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                No chat models are configured.
              </p>
            )}
            {requestedAlias && !model && Boolean(chatModels?.length) && (
              <p role="status" className="text-sm text-muted-foreground">
                The linked model is unavailable. Select another model to
                continue.
              </p>
            )}
            {mode !== "Form" &&
              model &&
              !available &&
              Boolean(chatModels?.length) && (
                <p role="status" className="text-sm text-muted-foreground">
                  This model is unavailable. Select an available model in Form
                  or edit the model alias in Code.
                </p>
              )}
            {mode === "Form" ? (
              <PlaygroundEditor
                draft={draft}
                expandedTool={expandedTool}
                onExpandTool={setExpandedTool}
                model={model}
                models={chatModels ?? []}
                running={running}
                loading={models.isPending}
                onEditFullRequest={(triggerId) => {
                  if (!codeReady(true)) return;
                  fullRequestOpener.current = triggerId;
                  nextFocusId.current = "playground-full-back";
                  setCode(undefined);
                  setMode("Full request");
                }}
                onChange={(next) => {
                  setDraft(next);
                  setCode(undefined);
                }}
              />
            ) : (
              <PlaygroundCode
                language={codeLanguage}
                snippet={code?.text ?? formatSnippet(request, codeLanguage)}
                onBack={
                  mode === "Full request"
                    ? () => {
                        if (!codeReady()) return;
                        nextFocusId.current = fullRequestOpener.current;
                        setCode(undefined);
                        setMode("Form");
                      }
                    : undefined
                }
                error={showCodeError ? code?.error : undefined}
                running={running}
                streaming={request.stream === true}
                onChange={editCode}
                onStreamingChange={(stream) => {
                  if (!codeReady()) return;
                  setDraft({ ...draft, stream });
                  setCode(undefined);
                }}
                onLanguageChange={(next) => {
                  if (!codeReady()) return;
                  setLanguage(next);
                  setCode(undefined);
                }}
                onDiscard={() => {
                  setCode(undefined);
                  setShowCodeError(false);
                  document.getElementById("playground-code")?.focus();
                }}
              />
            )}
            {budgetCorrection !== undefined && (
              <p
                id="playground-budget-error"
                role="alert"
                className="text-sm text-destructive"
              >
                Set Max tokens to at least {budgetCorrection.toLocaleString()}{" "}
                in Model settings for this thinking budget, or edit the request
                in Code.
              </p>
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
                  setToolInputs([]);
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
                aria-describedby={
                  budgetCorrection === undefined
                    ? undefined
                    : "playground-budget-error"
                }
                disabled={!available || budgetCorrection !== undefined}
              >
                <Play />
                Run{" "}
                <kbd
                  aria-hidden
                  className="ml-1 rounded bg-background/20 px-1 font-mono text-xs"
                >
                  {modifier} Enter
                </kbd>
              </Button>
            )}
          </div>
        </form>
        <section
          ref={response}
          aria-label="Response"
          className="@container flex min-w-0 scroll-mt-(--console-header-height) flex-col lg:overflow-y-auto lg:[scrollbar-gutter:stable]"
        >
          {status === "idle" ? (
            <>
              <span role="status" data-run-status="idle" className="sr-only" />
              {!selectedTemplate &&
              (request.messages.length || draft.system) ? (
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
                <PlaygroundTemplates
                  selected={selectedTemplate}
                  onSelect={reset}
                />
              )}
            </>
          ) : (
            <PlaygroundResponse
              status={status}
              text={text}
              toolInputs={toolInputs}
              error={error}
              reply={reply}
              onAdd={addToMessages}
              modifier={modifier}
            />
          )}
        </section>
        {historyOpen && (
          <section
            ref={historyPanel}
            id="playground-history"
            aria-labelledby="playground-history-title"
            className="absolute top-1 right-3 bottom-3 z-20 flex w-[27rem] max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-auto rounded-xl border bg-popover p-5 text-sm text-popover-foreground shadow-lg lg:right-5"
          >
            <div className="flex items-center justify-between">
              <h2
                id="playground-history-title"
                className="text-base font-semibold"
              >
                History
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close history"
                onClick={() => {
                  setHistoryOpen(false);
                  historyToggle.current?.focus();
                }}
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
                  data-history-entry
                  aria-current={reply === entry.reply ? true : undefined}
                  className="flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted aria-[current=true]:bg-muted"
                  onClick={() => {
                    if (!codeReady()) {
                      setHistoryOpen(false);
                      return;
                    }
                    setExpandedTool(null);
                    setDraft(entry.draft);
                    setCode(undefined);
                    setText(entry.text);
                    setReply(entry.reply);
                    setStatus("complete");
                    setError(undefined);
                    setMode("Form");
                  }}
                >
                  <span className="truncate">{historyLabel(entry.draft)}</span>
                  <time
                    dateTime={entry.completedAt.toISOString()}
                    data-completed-at={entry.completedAt.getTime()}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {entry.completedAt.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </button>
              ))
            ) : (
              <p className="text-sm">No requests yet.</p>
            )}
          </section>
        )}
      </PlaygroundPanes>
    </>
  );
}
