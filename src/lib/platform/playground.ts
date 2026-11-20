import { parseSseStream } from "@/lib/session-trace/sse";
import { assertOk, csrfHeaders, resourceURL } from "./http";

const TENANCY = {
  "x-organization-uuid": "default",
  "x-workspace-id": "default",
};

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

type Prompt = {
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
};

// The private Messages route uses the gateway's Anthropic SSE contract.
export async function runPlayground(
  prompt: Prompt,
  principalId: string,
  signal: AbortSignal,
  append: (text: string) => void,
) {
  const response = await fetch(resourceURL("v1/messages?beta=true"), {
    method: "POST",
    headers: {
      ...TENANCY,
      "content-type": "application/json",
      ...(await csrfHeaders({ expectedPrincipalId: principalId, signal })),
    },
    body: JSON.stringify({
      model: prompt.model,
      max_tokens: prompt.maxTokens,
      ...(prompt.system ? { system: prompt.system } : {}),
      messages: [{ role: "user", content: prompt.prompt }],
      stream: true,
    }),
    cache: "no-store",
    signal,
  });
  await assertOk(response);
  if (
    !response.body ||
    !response.headers.get("content-type")?.startsWith("text/event-stream")
  ) {
    throw new Error("The gateway did not return a streaming response.");
  }

  for await (const { event, data } of parseSseStream(response.body)) {
    if (event === "message_stop") return;
    if (event === "error") {
      const frame = JSON.parse(data) as { error?: { message?: string } };
      throw new Error(frame.error?.message ?? "The model request failed.");
    }
    if (event === "content_block_start" || event === "content_block_delta") {
      type Block = { type: string; text?: string };
      const frame = JSON.parse(data) as {
        content_block?: Block;
        delta?: Block;
      };
      const block = frame.content_block ?? frame.delta;
      if (
        (block?.type === "text" || block?.type === "text_delta") &&
        block.text
      ) {
        append(block.text);
      }
    }
  }
  throw new Error("The model stream ended before the response finished.");
}
