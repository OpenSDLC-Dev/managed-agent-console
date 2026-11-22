import {
  ChevronDown,
  Ellipsis,
  StickyNote,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  PlaygroundModelSelect,
  PlaygroundSettings,
} from "./playground-settings";
import {
  addCustomTool,
  PlaygroundTools,
  prependTool,
  toolName,
} from "./playground-tools";
import { availablePlaygroundTools } from "./playground-tool-presets";
import type {
  PlaygroundMessage,
  PlaygroundContent,
  PlaygroundModel,
  PlaygroundRequest,
} from "@/lib/platform/playground";
import { readToolResultTurn, ToolResultFields } from "./playground-tool-calls";

export type PlaygroundDraft = {
  selection: string;
  tokens: string;
  stream: PlaygroundRequest["stream"];
  system: PlaygroundContent | null;
  messages: (Pick<PlaygroundMessage, "role" | "content"> & {
    id: number;
    includeEmpty?: boolean;
    parameters?: Record<string, unknown>;
  })[];
  includeEmptySystem?: boolean;
  // Code can intentionally use a provider-specific thinking budget.
  formThinkingBudget?: number;
  // Raw input keeps invalid or partly formatted JSON editable without sending it.
  toolSchemas?: ({ text: string; invalid: boolean } | undefined)[];
  // Preserve additional Messages parameters across Form and Code.
  parameters?: Record<string, unknown>;
};

export function newDraft(): PlaygroundDraft {
  return {
    selection: "",
    tokens: "1024",
    stream: true,
    system: "",
    messages: [{ id: 0, role: "user", content: "" }],
  };
}

const field =
  "block min-h-9 w-full resize-none rounded-lg border border-transparent bg-muted/70 px-3 py-2 text-sm leading-5 field-sizing-content placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring";

function ContentField({
  id,
  label,
  content,
  placeholder,
  onChange,
  onEditBlocks,
  preceding,
  acceptsImages = false,
}: {
  id: string;
  label?: string;
  content: PlaygroundContent;
  placeholder: string;
  onChange: (value: PlaygroundContent) => void;
  onEditBlocks: (triggerId: string) => void;
  preceding?: PlaygroundContent;
  acceptsImages?: boolean;
}) {
  const toolTurn = preceding !== undefined && readToolResultTurn(content);
  if (preceding !== undefined && toolTurn)
    return (
      <ToolResultFields
        id={id}
        turn={toolTurn}
        preceding={preceding}
        acceptsImages={acceptsImages}
        onChange={onChange}
        onEdit={onEditBlocks}
      />
    );
  if (typeof content === "string")
    return (
      <textarea
        id={id}
        aria-label={label}
        value={content}
        rows={1}
        placeholder={placeholder}
        className={field}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  const block = content.length === 1 ? content[0] : undefined;
  const editableText =
    block?.type === "text" && typeof block.text === "string"
      ? block.text
      : undefined;
  return (
    <>
      {block && editableText !== undefined ? (
        <textarea
          id={id}
          aria-label={label}
          value={editableText}
          rows={1}
          placeholder={placeholder}
          className={field}
          onChange={(event) =>
            onChange([{ ...block, text: event.target.value }])
          }
        />
      ) : (
        <textarea
          id={id}
          aria-label={label}
          readOnly
          rows={3}
          className="max-h-40 w-full rounded-lg bg-muted/70 px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-ring"
          value={JSON.stringify(content, null, 2)}
        />
      )}
      <Button
        id={`${id}-edit-blocks`}
        type="button"
        variant="link"
        size="sm"
        className="mt-1 h-auto px-0 text-xs"
        aria-label={`Edit content blocks for ${label ?? "System"}`}
        onClick={(event) => onEditBlocks(event.currentTarget.id)}
      >
        Edit content blocks
      </Button>
    </>
  );
}

export function PlaygroundEditor({
  draft,
  onChange,
  models,
  model,
  loading,
  running,
  expandedTool,
  onExpandTool,
  onEditFullRequest,
}: {
  draft: PlaygroundDraft;
  onChange: (next: PlaygroundDraft) => void;
  models: PlaygroundModel[];
  model: string;
  loading: boolean;
  running: boolean;
  expandedTool: number | null;
  onExpandTool: (index: number | null) => void;
  onEditFullRequest: (triggerId: string) => void;
}) {
  const { system, messages } = draft;
  const modelProps = { models, model, loading, running };
  const selectedModel = models.find((entry) => entry.id === model);
  const presets = availablePlaygroundTools(selectedModel);
  const tools = draft.parameters?.tools;
  const names = new Set(Array.isArray(tools) ? tools.map(toolName) : []);
  const patch = (change: Partial<PlaygroundDraft>) =>
    onChange({ ...draft, ...change });
  function addMessage(role: PlaygroundMessage["role"]) {
    const id = messages[messages.length - 1].id + 1;
    patch({ messages: [...messages, { id, role, content: "" }] });
  }
  const nextRole =
    messages[messages.length - 1].role === "user" ? "assistant" : "user";
  const messageOptions = (
    <>
      <DropdownMenuItem onClick={() => addMessage("user")}>
        Add user message
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => addMessage("assistant")}>
        Add assistant message
      </DropdownMenuItem>
    </>
  );
  return (
    <fieldset disabled={running} className="min-w-0 space-y-4">
      <legend className="sr-only">Request fields</legend>
      <div className="flex flex-wrap items-center gap-2">
        <PlaygroundModelSelect
          {...modelProps}
          onSelect={(selection) => patch({ selection })}
        />
        <PlaygroundSettings {...modelProps} draft={draft} onChange={onChange} />
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              disabled={running}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Add <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="w-[228px] rounded-xl p-2"
            >
              <DropdownMenuItem
                className="gap-2 px-2"
                disabled={system !== null}
                onClick={() => patch({ system: "" })}
              >
                <StickyNote /> System prompt{" "}
                {system !== null && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Added
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2">Tools</DropdownMenuLabel>
                <DropdownMenuItem
                  className="gap-2 px-2"
                  onClick={() => {
                    onExpandTool(0);
                    onChange(addCustomTool(draft));
                  }}
                >
                  <Wrench />
                  Custom tool
                </DropdownMenuItem>
                {presets.map(({ id, icon: Icon, label, definition }) => {
                  const added = names.has(definition.name);
                  return (
                    <DropdownMenuItem
                      key={id}
                      className="gap-2 px-2"
                      disabled={added}
                      data-tool-kind={id}
                      onClick={() => {
                        onExpandTool(0);
                        onChange(prependTool(draft, definition));
                      }}
                    >
                      <Icon /> {label}
                      {added && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          Added
                        </span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              id="playground-request-options"
              type="button"
              disabled={running}
              aria-label="More request options"
              title="More request options"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
              <DropdownMenuItem
                onClick={() => onEditFullRequest("playground-request-options")}
              >
                Edit full request
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <PlaygroundTools
        draft={draft}
        presets={presets}
        onChange={onChange}
        expanded={expandedTool}
        onExpand={onExpandTool}
        onEditFullRequest={onEditFullRequest}
      />
      {system !== null && (
        <section>
          <div className="mb-1.5 flex h-6 items-center justify-between">
            <Label htmlFor="playground-system">System</Label>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove system prompt"
              onClick={() => patch({ system: null, includeEmptySystem: false })}
            >
              <Trash2 />
            </Button>
          </div>
          <ContentField
            id="playground-system"
            content={system}
            placeholder="Instructions that apply to every turn (optional)"
            onEditBlocks={onEditFullRequest}
            onChange={(value) => patch({ system: value })}
          />
        </section>
      )}
      <section aria-labelledby="playground-messages">
        <h3 id="playground-messages" className="mb-2 text-sm font-medium">
          Messages
        </h3>
        <div className="space-y-3">
          {messages.map((message, i) => (
            <div key={message.id}>
              <div className="mb-1.5 flex h-6 items-center justify-between">
                <label
                  htmlFor={`playground-message-${message.id}`}
                  className="rounded bg-muted/70 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {message.role}
                </label>
                {messages.length > 1 && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Remove message ${i + 1}`}
                    onClick={() =>
                      patch({
                        messages: messages.filter((m) => m.id !== message.id),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <ContentField
                id={`playground-message-${message.id}`}
                label={i === 0 ? "Prompt" : `${message.role} message ${i + 1}`}
                content={message.content}
                acceptsImages={
                  selectedModel?.capabilities?.image_input?.supported === true
                }
                preceding={
                  message.role === "user" &&
                  messages[i - 1]?.role === "assistant"
                    ? messages[i - 1].content
                    : undefined
                }
                onEditBlocks={onEditFullRequest}
                placeholder={
                  message.role === "user"
                    ? "What the user says to the model"
                    : "What the assistant says"
                }
                onChange={(content) =>
                  patch({
                    messages: messages.map((m) =>
                      m.id === message.id ? { ...m, content } : m,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-3 inline-flex">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-r-none"
            onClick={() => addMessage(nextRole)}
          >
            Add {nextRole} message
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              disabled={running}
              aria-label="More message options"
              className={buttonVariants({
                variant: "secondary",
                size: "icon-sm",
                className: "rounded-l-none border-l border-border",
              })}
            >
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent>{messageOptions}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>
    </fieldset>
  );
}
