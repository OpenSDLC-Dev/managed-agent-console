import { parseSseStream } from "@/lib/session-trace/sse";
import { assertOk, csrfHeaders, resourceURL } from "./http";

const TENANCY = {
  "x-organization-uuid": "default",
  "x-workspace-id": "default",
};

export const playgroundMessageHeaders = {
  ...TENANCY,
  "content-type": "application/json",
} as const;

export type PlaygroundModel = { id: string; display_name: string };

export async function playgroundModels(signal: AbortSignal) {
  const models: PlaygroundModel[] = [];
  let after: string | undefined;
  for (;;) {
    const query = new URLSearchParams({ limit: "1000" });
    if (after) query.set("after_id", after);
    const response = await fetch(resourceURL(`v1/models?${query}`), {
      headers: TENANCY,
      cache: "no-store",
      signal,
    });
    await assertOk(response);
    const page = (await response.json()) as {
      data: PlaygroundModel[];
      has_more: boolean;
      last_id: string | null;
    };
    models.push(...page.data);
    if (!page.has_more) return models;
    if (!page.last_id || page.last_id === after)
      throw new Error("Invalid model pagination cursor.");
    after = page.last_id;
  }
}

// Messages accepts text shorthand or ordered content blocks. The platform
// owns each block's fields, including provider-specific extensions.
export type PlaygroundBlock = { type: string } & Record<string, unknown>;
export type PlaygroundContent = string | PlaygroundBlock[];

export function isPlaygroundBlock(value: unknown): value is PlaygroundBlock {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

export function isPlaygroundContent(
  value: unknown,
): value is PlaygroundContent {
  return (
    typeof value === "string" ||
    (Array.isArray(value) && value.every(isPlaygroundBlock))
  );
}

export type PlaygroundMessage = {
  role: "user" | "assistant";
  content: PlaygroundContent;
} & Record<string, unknown>;

export type PlaygroundRequest = {
  model: string;
  max_tokens: number;
  system?: PlaygroundContent | null;
  messages: PlaygroundMessage[];
  stream?: boolean | null;
};

export type PlaygroundReply = {
  raw: string;
  rawLabel: "Response body" | "Stream events";
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  content?: PlaygroundBlock[];
};

type Usage = { input_tokens?: number; output_tokens?: number };
type Block = PlaygroundBlock & {
  text?: string;
  thinking?: string;
  signature?: string;
};
type MessageBody = { content: Block[]; usage?: Usage } & Record<
  string,
  unknown
>;
type Frame = {
  message?: MessageBody;
  index?: number;
  content_block?: Block;
  delta?: Block & Record<string, unknown>;
  usage?: Usage;
  error?: { message?: string };
};

// servePlayground forwards both Messages response modes to the same gateway.
export async function runPlayground(
  request: PlaygroundRequest,
  principalId: string,
  signal: AbortSignal,
  append: (text: string) => void,
): Promise<PlaygroundReply> {
  const started = performance.now();
  const response = await fetch(resourceURL("v1/messages?beta=true"), {
    method: "POST",
    headers: {
      ...playgroundMessageHeaders,
      ...(await csrfHeaders({ expectedPrincipalId: principalId, signal })),
    },
    body: JSON.stringify(request),
    cache: "no-store",
    signal,
  });
  await assertOk(response);
  if (!request.stream) {
    if (!response.headers.get("content-type")?.startsWith("application/json"))
      throw new Error("The gateway did not return a JSON response.");
    const body: MessageBody = await response.json();
    if (
      !body ||
      !Array.isArray(body.content) ||
      !body.content.every(isPlaygroundBlock)
    )
      throw new Error("The gateway did not return a Messages response body.");
    for (const block of body.content) {
      if (
        block?.type === "text" &&
        typeof block.text === "string" &&
        block.text
      )
        append(block.text);
    }
    return {
      raw: JSON.stringify(body, null, 2),
      rawLabel: "Response body",
      content: body.content,
      inputTokens: body.usage?.input_tokens,
      outputTokens: body.usage?.output_tokens,
      durationMs: performance.now() - started,
    };
  }
  if (
    !response.body ||
    !response.headers.get("content-type")?.startsWith("text/event-stream")
  ) {
    throw new Error("The gateway did not return a streaming response.");
  }

  // Keep the original events when a provider sends a delta we cannot fold.
  const events: string[] = [];
  let body: MessageBody | undefined;
  let canAssembleBody = true;
  let usage: Usage | undefined;
  const toolInputs = new Map<number, string[]>();
  for await (const { event, data } of parseSseStream(response.body)) {
    if (event === "ping") continue;
    events.push(`event: ${event}\ndata: ${data}`);
    if (event === "message_stop") {
      const complete =
        canAssembleBody &&
        toolInputs.size === 0 &&
        body?.content.every(isPlaygroundBlock) &&
        body;
      return {
        raw: complete ? JSON.stringify(complete, null, 2) : events.join("\n\n"),
        rawLabel: complete ? "Response body" : "Stream events",
        content: complete ? complete.content : undefined,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        durationMs: performance.now() - started,
      } satisfies PlaygroundReply;
    }
    if (event === "content_block_stop") {
      if (toolInputs.size) {
        const { index }: Frame = JSON.parse(data);
        const parts = index === undefined ? undefined : toolInputs.get(index);
        if (index !== undefined && parts && body) {
          toolInputs.delete(index);
          try {
            const json = parts.join("");
            if (json) body.content[index].input = JSON.parse(json);
          } catch {
            canAssembleBody = false;
          }
        }
      }
      continue;
    }
    if (
      ![
        "error",
        "message_start",
        "message_delta",
        "content_block_start",
        "content_block_delta",
      ].includes(event)
    ) {
      canAssembleBody = false;
      continue;
    }
    const frame: Frame = JSON.parse(data);
    if (event === "error")
      throw new Error(frame.error?.message ?? "The model request failed.");
    if (
      event === "message_start" &&
      frame.message &&
      Array.isArray(frame.message.content)
    ) {
      body = frame.message;
      usage = body.usage;
    } else if (event === "message_delta") {
      if (body && frame.delta) body = { ...body, ...frame.delta };
      if (frame.usage) {
        usage = { ...usage, ...frame.usage };
        if (body) body.usage = usage;
      }
    } else if (event === "content_block_start" && frame.content_block) {
      if (body && frame.index === body.content.length)
        body.content.push(frame.content_block);
      else canAssembleBody = false;
      if (frame.content_block.type === "text" && frame.content_block.text)
        append(frame.content_block.text);
    } else if (event === "content_block_delta") {
      const block =
        frame.index === undefined ? undefined : body?.content[frame.index];
      if (
        frame.delta?.type === "text_delta" &&
        typeof frame.delta.text === "string"
      ) {
        if (block?.type === "text")
          block.text = (block.text ?? "") + frame.delta.text;
        else canAssembleBody = false;
        if (frame.delta.text) append(frame.delta.text);
      } else if (
        block?.type === "text" &&
        frame.delta?.type === "citations_delta" &&
        frame.delta.citation
      ) {
        block.citations ??= [];
        if (Array.isArray(block.citations))
          block.citations.push(frame.delta.citation);
        else canAssembleBody = false;
      } else if (
        block &&
        frame.index !== undefined &&
        "input" in block &&
        frame.delta?.type === "input_json_delta" &&
        typeof frame.delta.partial_json === "string"
      ) {
        const parts = toolInputs.get(frame.index) ?? [];
        parts.push(frame.delta.partial_json);
        toolInputs.set(frame.index, parts);
      } else if (
        block?.type === "thinking" &&
        frame.delta?.type === "thinking_delta" &&
        typeof frame.delta.thinking === "string"
      ) {
        block.thinking = (block.thinking ?? "") + frame.delta.thinking;
      } else if (
        block?.type === "thinking" &&
        frame.delta?.type === "signature_delta" &&
        typeof frame.delta.signature === "string"
      ) {
        block.signature = (block.signature ?? "") + frame.delta.signature;
      } else canAssembleBody = false;
    } else canAssembleBody = false;
  }
  throw new Error("The model stream ended before the response finished.");
}
