"use client";
import { useState } from "react";
import { ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  configExample,
  configFormats,
  type ConfigFormat,
} from "@/lib/agent-config/quickstart";
import { copyText } from "@/lib/copy-text";
import type { AgentWriteBody } from "@/lib/platform/queries";

export function AgentConfigView({
  config,
  yaml,
  onEdit,
}: {
  config: AgentWriteBody;
  yaml?: string;
  onEdit?: (v: string) => void;
}) {
  const [format, setFormat] = useState<ConfigFormat>("YAML");
  const code =
    format === "YAML" && yaml !== undefined
      ? yaml
      : configExample(config, format);
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      aria-label="Agent config"
    >
      <header className="flex items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">Agent config</h3>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label={"Config format: " + format}
              />
            }
          >
            {format}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {configFormats.map((f) => (
              <DropdownMenuItem key={f} onClick={() => setFormat(f)}>
                {f}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Copy code"
          onClick={async () => {
            if (await copyText(code)) toast.success("Code copied");
            else toast.error("Could not copy code");
          }}
        >
          <Copy className="size-3.5" />
        </Button>
      </header>
      {onEdit && format === "YAML" ? (
        <textarea
          aria-label="Agent configuration"
          spellCheck={false}
          className="min-h-52 w-full flex-1 resize-y rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-5"
          value={code}
          onChange={(e) => onEdit(e.target.value)}
        />
      ) : (
        <pre
          tabIndex={0}
          className="min-h-32 flex-1 overflow-auto rounded-lg bg-muted/70 p-3 text-xs leading-5"
        >
          <code>{code}</code>
        </pre>
      )}
    </section>
  );
}
