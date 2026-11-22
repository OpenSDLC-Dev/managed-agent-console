import { ArrowLeft, Check, Copy, ExternalLink, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyText } from "@/lib/copy-text";
import { playgroundMessageHeaders } from "@/lib/platform/playground";
import type { CodeLanguage } from "./playground-snippet";
import { SchemaTextarea } from "./schema-textarea";

export function PlaygroundCode({
  language,
  snippet,
  error,
  running,
  streaming,
  onChange,
  onLanguageChange,
  onStreamingChange,
  onDiscard,
  onBack,
}: {
  language: CodeLanguage;
  snippet: string;
  error?: string;
  running: boolean;
  streaming: boolean;
  onChange: (source: string) => void;
  onLanguageChange: (value: CodeLanguage) => void;
  onStreamingChange: (value: boolean) => void;
  onDiscard: () => void;
  onBack?: () => void;
}) {
  const [copied, setCopied] = useState<string>();
  return (
    <div className="flex flex-col gap-3">
      {onBack ? (
        <>
          <Button
            id="playground-full-back"
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={onBack}
          >
            <ArrowLeft /> Back
          </Button>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Headers</h3>
            <dl className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs">
              {Object.entries(playgroundMessageHeaders).map(([name, value]) => (
                <div
                  key={name}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 py-0.5"
                >
                  <dt className="font-mono break-all">{name}</dt>
                  <dd className="font-mono break-all text-muted-foreground">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <h3 className="text-sm font-semibold">Body</h3>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="playground-code-language">
            Code language
          </label>
          <select
            id="playground-code-language"
            className="h-8 rounded-lg bg-muted/70 px-2 text-sm font-medium"
            value={language}
            onChange={(event) =>
              onLanguageChange(event.target.value === "JSON" ? "JSON" : "cURL")
            }
          >
            <option>cURL</option>
            <option>JSON</option>
          </select>
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              aria-label="Code snippet settings"
              title="Code snippet settings"
              disabled={running}
              className={buttonVariants({
                variant: "secondary",
                size: "icon-sm",
              })}
            >
              <Settings2 />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuCheckboxItem
                checked={streaming}
                onCheckedChange={onStreamingChange}
              >
                Streaming
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <a
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            href="https://platform.claude.com/docs/en/api/messages/create"
            target="_blank"
            rel="noreferrer"
          >
            Messages create API <ExternalLink aria-hidden className="size-3" />
          </a>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Copy code"
            title="Copy code"
            onClick={async () => {
              if (await copyText(snippet)) {
                setCopied(snippet);
                toast.success("Code copied.");
              } else toast.error("Could not copy code.");
            }}
          >
            {copied === snippet ? <Check /> : <Copy />}
          </Button>
        </div>
      )}
      <label className="sr-only" htmlFor="playground-code">
        {onBack ? "Request body" : language + " request code"}
      </label>
      <span className="sr-only" id="playground-code-keys">
        Tab to indent. Press Escape, then Tab to move focus.
      </span>
      <SchemaTextarea
        id="playground-code"
        aria-describedby={
          error
            ? "playground-code-keys playground-code-error"
            : "playground-code-keys"
        }
        aria-invalid={Boolean(error)}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        wrap="off"
        rows={Math.min(30, Math.max(10, snippet.split("\n").length))}
        className="min-h-44 w-full resize-y rounded-lg border border-transparent bg-muted/40 p-3 font-mono text-xs leading-5 focus-visible:outline-2 focus-visible:outline-ring"
        value={snippet}
        onValueChange={onChange}
        disabled={running}
      />
      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p
            id="playground-code-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onDiscard}>
            Discard invalid edits
          </Button>
        </div>
      )}
    </div>
  );
}
