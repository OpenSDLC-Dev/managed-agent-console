// Model-free Messages recordings shared by Chrome replay and browser regressions.
export function fixtureModelList() {
  const data = toolModels.map(({ id, display_name, vision }) => ({
    id,
    display_name,
    type: "model",
    created_at: "2026-11-22T00:00:00Z",
    max_tokens: 0,
    capabilities: { image_input: { supported: vision } },
  }));
  return {
    data,
    has_more: false,
    first_id: data[0].id,
    last_id: data.at(-1).id,
  };
}

/** @param {string} model @param {Array<{type:string}>} [blocks] */
export function fixtureReply(model, blocks) {
  return {
    id: blocks ? "msg_fixture_tools" : "msg_fixture_continuation",
    type: "message",
    role: "assistant",
    model,
    content: blocks ?? [
      { type: "text", text: "Fixture continuation complete" },
    ],
    stop_reason: blocks?.some((block) => block.type === "tool_use")
      ? "tool_use"
      : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 11, output_tokens: 7 },
  };
}

/** The browser replay handles only its own declarations and never calls a provider. */
export function replayToolReply(body) {
  const continuation = body.messages?.some(
    (message) => message.role === "assistant",
  );
  if (continuation) return fixtureReply(body.model);
  const blocks = (body.tools ?? []).flatMap(({ name, type }) => {
    if (body.model === "deepseek-flash" && name === type) {
      const call = hostedResults.find((block) => block.name === name);
      if (call)
        return hostedResults.filter(
          (block) => block === call || block.tool_use_id === call.id,
        );
    }
    const existing = clientCalls.find((block) => block.name === name);
    if (existing) return [existing];
    const examples = {
      web_search: { query: "example domain" },
      web_fetch: { url: "https://example.com/" },
      bash: { command: "pwd" },
      make_file: { filename: "poem.txt", lines_of_text: ["Fixture line"] },
      get_weather: { location: "Tokyo" },
      get_time: { timezone: "Asia/Tokyo" },
    };
    return Object.hasOwn(examples, name)
      ? [
          {
            type: "tool_use",
            id: "tool_fixture_" + name,
            name,
            input: examples[name],
          },
        ]
      : [];
  });
  return fixtureReply(
    body.model,
    blocks.length ? blocks : [{ type: "text", text: "Fixture reply" }],
  );
}

export function replayToolStream(message) {
  const frame = (type, fields = {}) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
  const frames = [
    frame("message_start", {
      message: {
        ...message,
        content: [],
        stop_reason: null,
        usage: { input_tokens: 11, output_tokens: 0 },
      },
    }),
  ];
  for (const [index, block] of message.content.entries()) {
    // Messages delivers hosted blocks whole, and generates client tool input in deltas.
    const client = block.type === "tool_use";
    frames.push(
      frame("content_block_start", {
        index,
        content_block: client ? { ...block, input: {} } : block,
      }),
    );
    if (client)
      frames.push(
        frame("content_block_delta", {
          index,
          delta: {
            type: "input_json_delta",
            partial_json: JSON.stringify(block.input),
          },
        }),
      );
    frames.push(frame("content_block_stop", { index }));
  }
  return [
    ...frames,
    frame("message_delta", {
      delta: { stop_reason: message.stop_reason, stop_sequence: null },
      usage: { output_tokens: 7 },
    }),
    frame("message_stop"),
  ].join("");
}

export const toolModels = [
  { id: "deepseek-flash", display_name: "DeepSeek Flash", vision: true },
  { id: "glm-5.3", display_name: "GLM-5.3", vision: false },
  { id: "glm-5.3-flash", display_name: "GLM-5.3 Flash", vision: true },
  { id: "kimi-k3", display_name: "Kimi K3", vision: true },
  { id: "MiniMax-M3", display_name: "MiniMax M3", vision: true },
  {
    id: "custom-research",
    display_name: "Internal research route",
    vision: true,
  },
];

export const clientCalls = [
  {
    type: "tool_use",
    id: "tool_screen_1",
    name: "computer",
    input: { action: "screenshot" },
  },
  {
    type: "tool_use",
    id: "tool_browser_2",
    name: "browser",
    input: { action: "read_page" },
  },
];

// DeepSeek's Messages examples pair each hosted call with a result block.
// Link-reading responses carry an opaque signature for replay.
// https://api-docs.deepseek.com/guides/web_tools/
export const hostedResults = [
  {
    type: "server_tool_use",
    id: "srv_search_1",
    name: "deepseek_web_search",
    input: { action: "search", queries: ["fixture"] },
    kind: "search",
    caller: { type: "direct" },
  },
  {
    type: "web_search_tool_result",
    tool_use_id: "srv_search_1",
    kind: "search",
    content: [
      {
        type: "web_search_result",
        title: "Fixture source",
        url: "https://example.com/",
        encrypted_content: "opaque-fixture",
        snippet: "Fixture passage",
        page_age: null,
      },
    ],
  },
  {
    type: "server_tool_use",
    id: "srv_read_2",
    name: "deepseek_read_url",
    input: { action: "read_link", url: "https://example.com/" },
    kind: "read_link",
    caller: { type: "direct" },
  },
  {
    type: "web_fetch_tool_result",
    tool_use_id: "srv_read_2",
    kind: "read_link",
    signature: "fixture-page-signature",
    content: {
      type: "web_fetch_result",
      url: "https://example.com/",
      content: {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: "" },
        title: "Fixture source",
      },
    },
  },
];
