import { Paperclip, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  PlaygroundBlock,
  PlaygroundContent,
} from "@/lib/platform/playground";

type ToolUse = PlaygroundBlock & {
  type: "tool_use" | "server_tool_use";
  id: string;
  name: string;
};

export function isToolUse(block: PlaygroundBlock): block is ToolUse {
  return (
    (block.type === "tool_use" || block.type === "server_tool_use") &&
    typeof block.id === "string" &&
    block.id.length > 0 &&
    typeof block.name === "string" &&
    block.name.length > 0
  );
}

function isClientToolUse(block: PlaygroundBlock): block is ToolUse {
  return block.type === "tool_use" && isToolUse(block);
}

/** Messages client calls return one result per ID in the next user turn. */
export function newToolResults(blocks: PlaygroundBlock[]) {
  return blocks.filter(isClientToolUse).map((call) => ({
    type: "tool_result",
    tool_use_id: call.id,
    ...(typeof call.toolset_name === "string" && {
      toolset_name: call.toolset_name,
    }),
    content: "",
  }));
}

type TextToolResult = PlaygroundBlock & {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

type TextBlock = PlaygroundBlock & { type: "text"; text: string };
type Attachment = {
  filename: string;
  caption: TextBlock;
  image: PlaygroundBlock;
};
type ToolResultTurn = {
  results: TextToolResult[];
  attachments: Attachment[];
  note?: TextBlock;
};

function isTextResult(
  block: PlaygroundBlock | undefined,
): block is TextToolResult {
  return (
    block?.type === "tool_result" &&
    typeof block.tool_use_id === "string" &&
    typeof block.content === "string"
  );
}

function isText(block: PlaygroundBlock): block is TextBlock {
  return block.type === "text" && typeof block.text === "string";
}

const imagePrefix = (id: string) => `Image for tool use ${id}: `;

/** Rich imported blocks stay editable intact in the full request. */
export function readToolResultTurn(
  content: PlaygroundContent,
): ToolResultTurn | undefined {
  if (!Array.isArray(content) || !isTextResult(content[0])) return;
  const results: TextToolResult[] = [];
  const attachments: Attachment[] = [];
  let index = 0;
  let block = content[index];
  while (isTextResult(block)) {
    results.push(block);
    block = content[++index];
  }
  while (index < content.length) {
    const caption = content[index++];
    if (!isText(caption)) return;
    if (index === content.length)
      return { results, attachments, note: caption };
    const image = content[index++];
    const result = results.find(({ tool_use_id }) =>
      caption.text.startsWith(imagePrefix(tool_use_id)),
    );
    if (!result || image.type !== "image") return;
    attachments.push({
      filename: caption.text.slice(imagePrefix(result.tool_use_id).length),
      caption,
      image,
    });
  }
  return { results, attachments };
}

function ImagePicker({
  name,
  descriptionId,
  onAttach,
}: {
  name: string;
  descriptionId: string;
  onAttach: (filename: string, image: PlaygroundBlock) => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [image, setImage] = useState<PlaygroundBlock>();
  const [error, setError] = useState(false);
  const picker = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const encoded = String(reader.result);
      setImage({
        type: "image",
        source: {
          type: "base64",
          media_type: file.type,
          data: encoded.slice(encoded.indexOf(",") + 1),
        },
      });
    };
    reader.onerror = () => setError(true);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  function changeOpen(next: boolean) {
    setOpen(next);
    setFile(undefined);
    setImage(undefined);
    setError(false);
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        ref={trigger}
        type="button"
        aria-label={`Attach image for ${name}`}
        aria-describedby={descriptionId}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <Paperclip /> Attach image
      </DialogTrigger>
      <DialogContent
        finalFocus={trigger}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter")
            event.stopPropagation();
        }}
      >
        <DialogTitle>Attach image</DialogTitle>
        <label htmlFor={picker}>Image file</label>
        <input
          id={picker}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={({ currentTarget }) => {
            setImage(undefined);
            setError(false);
            setFile(currentTarget.files?.[0]);
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Could not read this image. Choose another file.
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!file || !image}
            onClick={() => {
              if (!file || !image) return;
              onAttach(file.name, image);
              changeOpen(false);
            }}
          >
            Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ToolResultFields({
  id,
  turn,
  preceding,
  acceptsImages,
  onChange,
  onEdit,
}: {
  id: string;
  turn: ToolResultTurn;
  preceding: PlaygroundContent;
  acceptsImages: boolean;
  onChange: (content: PlaygroundBlock[]) => void;
  onEdit: (trigger: string) => void;
}) {
  const calls = Array.isArray(preceding)
    ? preceding.filter(isClientToolUse)
    : [];
  const { results, attachments, note } = turn;
  function change(update: Partial<ToolResultTurn>) {
    const next = { ...turn, ...update };
    onChange([
      ...next.results,
      ...next.attachments.flatMap(({ caption, image }) => [caption, image]),
      ...(next.note ? [next.note] : []),
    ]);
  }
  function update(at: number, result: TextToolResult) {
    change({
      results: results.map((entry, index) => (index === at ? result : entry)),
    });
  }
  return (
    <div className="space-y-2">
      {results.map((result, index) => {
        const call = calls.find((entry) => entry.id === result.tool_use_id);
        const name = call?.name ?? result.tool_use_id;
        const field = index === 0 ? id : `${id}-result-${index}`;
        return (
          <div
            key={result.tool_use_id + ":" + index}
            data-tool-result-id={result.tool_use_id}
            className="space-y-2 rounded-lg bg-muted/60 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={field} className="text-sm font-medium">
                Tool result <code className="font-mono text-xs">{name}</code>
              </label>
              <span
                id={`${field}-id`}
                className="break-all font-mono text-xs text-muted-foreground"
              >
                {result.tool_use_id}
              </span>
            </div>
            <textarea
              id={field}
              aria-label={`Tool result ${name}`}
              aria-describedby={`${field}-id`}
              className="block w-full resize-y rounded-md border bg-background px-2.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              rows={2}
              placeholder={'Enter response e.g. {"output": "value"}'}
              value={result.content}
              onChange={(event) =>
                update(index, { ...result, content: event.target.value })
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label={`Mark ${name} result as an error`}
                  aria-describedby={`${field}-id`}
                  checked={result.is_error === true}
                  onChange={(event) => {
                    const next = { ...result };
                    if (event.target.checked) next.is_error = true;
                    else delete next.is_error;
                    update(index, next);
                  }}
                />
                Error
              </label>
              {acceptsImages && (
                <ImagePicker
                  name={name}
                  descriptionId={`${field}-id`}
                  onAttach={(filename, image) =>
                    change({
                      attachments: [
                        ...attachments,
                        {
                          filename,
                          image,
                          caption: {
                            type: "text",
                            text: imagePrefix(result.tool_use_id) + filename,
                          },
                        },
                      ],
                    })
                  }
                />
              )}
            </div>
          </div>
        );
      })}
      {attachments.map(({ caption, filename }, index) => (
        <div
          key={index}
          className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-xs"
        >
          <Paperclip aria-hidden className="size-3.5 shrink-0" />
          <span className="break-all">{caption.text}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label={`Remove ${filename}`}
            onClick={() =>
              change({
                attachments: attachments.filter((_, at) => at !== index),
              })
            }
          >
            <X />
          </Button>
        </div>
      ))}
      <textarea
        aria-label="Additional user message"
        rows={1}
        placeholder="Add a message (optional)"
        className="block w-full resize-y rounded-md border bg-background px-2.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        value={note?.text ?? ""}
        onChange={({ currentTarget }) =>
          change({
            note:
              currentTarget.value || (note && Object.keys(note).length > 2)
                ? { ...note, type: "text", text: currentTarget.value }
                : undefined,
          })
        }
      />
      <Button
        id={`${id}-edit-blocks`}
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 text-xs"
        aria-label="Edit tool result content blocks"
        onClick={(event) => onEdit(event.currentTarget.id)}
      >
        Edit content blocks
      </Button>
    </div>
  );
}
