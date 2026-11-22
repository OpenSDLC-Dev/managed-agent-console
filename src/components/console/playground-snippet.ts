import {
  isPlaygroundContent,
  type PlaygroundRequest,
} from "@/lib/platform/playground";
import type { PlaygroundDraft } from "./playground-editor";

export type CodeLanguage = "cURL" | "JSON";

export function hasMessageContent(
  message: PlaygroundDraft["messages"][number],
) {
  return message.content.length > 0 || message.includeEmpty === true;
}

export function wireMessage({
  role,
  content,
  parameters,
}: PlaygroundDraft["messages"][number]) {
  return { ...parameters, role, content };
}

export function historyLabel(draft: PlaygroundDraft) {
  const content = draft.messages.find(hasMessageContent)?.content;
  if (typeof content === "string" || !content) return content ?? "";
  const firstText = content.find(
    (block) => block.type === "text" && typeof block.text === "string",
  );
  return typeof firstText?.text === "string"
    ? firstText.text
    : content.map((block) => block.type).join(", ");
}

// A quoted here-document keeps every JSON string literal, including shell syntax.
const curlPrefix = [
  'curl --no-buffer "$ANTHROPIC_BASE_URL/v1/messages" \\',
  '  -H "x-api-key: $ANTHROPIC_API_KEY" \\',
  '  -H "anthropic-version: 2023-06-01" \\',
  '  -H "content-type: application/json" \\',
  "  --data-binary @- <<'JSON'",
  "",
].join("\n");
const curlSuffix = "\nJSON";

export function formatSnippet(
  request: PlaygroundRequest,
  language: CodeLanguage,
) {
  const json = JSON.stringify(request, null, 2);
  return language === "JSON" ? json : curlPrefix + json + curlSuffix;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSnippet(
  source: string,
  language: CodeLanguage,
  previous: PlaygroundDraft,
): PlaygroundDraft {
  let json = source.trim();
  if (language === "cURL") {
    // Never interpret shell, copy headers into the browser, or change its target.
    if (!json.startsWith(curlPrefix) || !json.endsWith(curlSuffix))
      throw new Error(
        "Keep the generated cURL command and edit its JSON body.",
      );
    json = json.slice(curlPrefix.length, -curlSuffix.length);
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Enter a valid JSON request body.");
  }
  if (!isObject(value)) throw new Error("Enter a Messages request object.");
  const { model, max_tokens, system, messages, stream, ...parameters } = value;
  if (typeof model !== "string" || !model)
    throw new Error("Enter a model alias.");
  if (
    typeof max_tokens !== "number" ||
    !Number.isInteger(max_tokens) ||
    max_tokens < 1
  )
    throw new Error("Enter a positive whole number for max_tokens.");
  if (stream != null && typeof stream !== "boolean")
    throw new Error("Set stream to true or false.");
  if (system != null && !isPlaygroundContent(system))
    throw new Error("Enter a string or an array of content blocks for system.");
  if (!Array.isArray(messages)) throw new Error("Enter an array of messages.");
  const turns = messages.map((message: unknown, id) => {
    if (
      !isObject(message) ||
      (message.role !== "user" && message.role !== "assistant") ||
      !isPlaygroundContent(message.content)
    )
      throw new Error(
        "Each message needs a user or assistant role and a string or array of content blocks.",
      );
    const { role, content, ...parameters } = message;
    return {
      id,
      role,
      content,
      includeEmpty: content.length === 0,
      parameters,
    } as const;
  });
  // Code omits untouched empty Form rows. Keep those rows when the code edit
  // only changes an unrelated field such as the model or max_tokens.
  const previousTurns = previous.messages.filter(hasMessageContent);
  const sameTurns =
    turns.length === previousTurns.length &&
    turns.every(
      (turn, i) =>
        JSON.stringify(wireMessage(turn)) ===
        JSON.stringify(wireMessage(previousTurns[i])),
    );
  return {
    selection: model,
    tokens: String(max_tokens),
    stream,
    system:
      system === undefined ? (previous.system === "" ? "" : null) : system,
    includeEmptySystem: system === "" || system === null,
    messages: sameTurns
      ? previous.messages
      : turns.length
        ? turns
        : [{ id: 0, role: "user", content: "" }],
    parameters,
  };
}
