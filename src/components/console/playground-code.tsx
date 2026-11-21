import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/copy-text";
import type { PlaygroundRequest } from "@/lib/platform/playground";

export function PlaygroundCode({ request }: { request: PlaygroundRequest }) {
  const [language, setLanguage] = useState("cURL");
  const [copied, setCopied] = useState<string>();
  const json = JSON.stringify(request, null, 2);
  // A quoted here-document keeps prompt text literal. JSON escapes all embedded newlines.
  const snippet =
    language === "JSON"
      ? json
      : [
          'curl --no-buffer "$ANTHROPIC_BASE_URL/v1/messages" \\',
          '  -H "x-api-key: $ANTHROPIC_API_KEY" \\',
          '  -H "anthropic-version: 2023-06-01" \\',
          '  -H "content-type: application/json" \\',
          "  --data-binary @- <<'JSON'",
          json,
          "JSON",
        ].join("\n");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          Code language
          <select
            className="h-8 rounded-md bg-muted px-2"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option>cURL</option>
            <option>JSON</option>
          </select>
        </label>
        <Button
          type="button"
          size="icon"
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
      <pre
        aria-label="Request code"
        className="overflow-x-auto rounded-lg bg-muted/40 p-3 font-mono text-xs leading-5"
        tabIndex={0}
      >
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
