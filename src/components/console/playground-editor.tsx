import { Popover } from "@base-ui/react/popover";
import { ChevronDown, Ellipsis, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PlaygroundMessage,
  PlaygroundContent,
  PlaygroundModel,
  PlaygroundRequest,
} from "@/lib/platform/playground";

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
  // Code can set additional Messages parameters that the Form does not edit.
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
}: {
  id: string;
  label?: string;
  content: PlaygroundContent;
  placeholder: string;
  onChange: (value: PlaygroundContent) => void;
  onEditBlocks: () => void;
}) {
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
        type="button"
        variant="link"
        size="sm"
        className="mt-1 h-auto px-0 text-xs"
        aria-label={`Edit content blocks for ${label ?? "System"}`}
        onClick={onEditBlocks}
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
  onEditFullRequest,
}: {
  draft: PlaygroundDraft;
  onChange: (next: PlaygroundDraft) => void;
  models: PlaygroundModel[];
  model: string;
  loading: boolean;
  running: boolean;
  onEditFullRequest: () => void;
}) {
  const { system, messages } = draft;
  const emptyModelLabel = models.length ? "Select a model" : "No models";
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
        <Select
          value={model || null}
          onValueChange={(value) => {
            if (value) patch({ selection: value });
          }}
          disabled={!models.length || running}
        >
          <SelectTrigger
            size="sm"
            aria-label="Model"
            data-model={model}
            className="w-[13.5rem] max-w-[65%] border-transparent bg-muted/70 text-sm font-medium"
          >
            <SelectValue>
              {models.find((m) => m.id === model)?.display_name ??
                (loading
                  ? "Loading models…"
                  : model
                    ? `${model} (unavailable)`
                    : emptyModelLabel)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover.Root>
          <Popover.Trigger
            type="button"
            aria-label="Model settings"
            title="Model settings"
            disabled={running}
            className={buttonVariants({
              variant: "secondary",
              size: "icon-sm",
            })}
          >
            <SlidersHorizontal />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner
              side="bottom"
              align="start"
              sideOffset={6}
              className="z-40"
            >
              <Popover.Popup className="w-64 rounded-xl border bg-popover p-4 text-popover-foreground shadow-md">
                <Popover.Title className="mb-3 text-sm font-semibold">
                  Model settings
                </Popover.Title>
                <Label htmlFor="playground-tokens">Max tokens</Label>
                <Input
                  id="playground-tokens"
                  type="number"
                  min={1}
                  step={1}
                  className="mt-2"
                  value={draft.tokens}
                  onChange={(e) => patch({ tokens: e.target.value })}
                />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              disabled={running}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Add <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {system === null && (
                <DropdownMenuItem onClick={() => patch({ system: "" })}>
                  System prompt
                </DropdownMenuItem>
              )}
              {messageOptions}
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
              <DropdownMenuItem onClick={onEditFullRequest}>
                Edit full request
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
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
