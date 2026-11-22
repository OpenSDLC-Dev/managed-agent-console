import { afterEach, expect, it, vi } from "vitest";
import {
  playgroundModels,
  runPlayground,
  type PlaygroundRequest,
} from "./playground";
import { readAccount } from "./native";

const resource = "/api/organizations/default/proxy/v1";
const prompt: PlaygroundRequest = {
  model: "demo",
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "user", content: "Continue" },
  ],
  system: "Be brief",
  max_tokens: 32,
  stream: true,
};

function fixture(frames: string, contentType = "text/event-stream") {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/session" && !init?.method) {
      return Response.json({
        signed_in: true,
        id: "user_demo",
        csrf_token: "test-csrf",
      });
    }
    return new Response(frames, { headers: { "content-type": contentType } });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

it("lists the gateway models through the private cookie route", async () => {
  const fetcher = fixture(
    '{"data":[{"id":"demo","display_name":"Demo"}],"has_more":false,"last_id":"demo"}',
    "application/json",
  );
  const signal = new AbortController().signal;
  await expect(playgroundModels(signal)).resolves.toEqual([
    { id: "demo", display_name: "Demo" },
  ]);
  expect(fetcher).toHaveBeenCalledWith(
    `${resource}/models?limit=1000`,
    expect.objectContaining({ signal }),
  );
});

it("loads models past the first gateway page", async () => {
  const first = { id: "alpha/model", display_name: "Alpha" };
  const last = { id: "omega/model", display_name: "Omega" };
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.includes("after_id=")
        ? { data: [last], has_more: false, last_id: last.id }
        : { data: [first], has_more: true, last_id: first.id },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(playgroundModels(new AbortController().signal)).resolves.toEqual(
    [first, last],
  );
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    `${resource}/models?limit=1000`,
    `${resource}/models?limit=1000&after_id=alpha%2Fmodel`,
  ]);
});

it("hides Playground presentation when the edge reports the gateway disabled", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          signed_in: true,
          id: "user_demo",
          role: "user",
          playground_access: true,
        },
        { headers: { "x-platform-playground-disabled": "1" } },
      ),
    ),
  );
  const session = await readAccount();
  expect(session).toMatchObject({ signed_in: true, role: "user" });
  expect(session).not.toHaveProperty("playground_access");
});

it("stops the fresh session request before submitting Messages", async () => {
  const fetcher = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        expect(url).toBe("/api/auth/session");
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const run = runPlayground(prompt, "user_demo", controller.signal, vi.fn());
  controller.abort();
  await expect(run).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/session"]);
});

it("posts Messages with fresh CSRF and renders only text blocks from the stream", async () => {
  const fetcher = fixture(
    'event: content_block_start\ndata: {"content_block":{"type":"text","text":"Hi"}}\n\n' +
      'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"private"}}\n\n' +
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":" there"}}\n\n' +
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  );
  const append = vi.fn();
  const signal = new AbortController().signal;
  const result = await runPlayground(prompt, "user_demo", signal, append);
  expect(result.rawLabel).toBe("Stream events");
  expect(result.raw).toContain('{"type":"message_stop"}');
  expect(append.mock.calls).toEqual([["Hi"], [" there"]]);
  const [url, init] = fetcher.mock.calls[1];
  expect(url).toBe(`${resource}/messages?beta=true`);
  expect(init).toMatchObject({ method: "POST", signal });
  expect(new Headers(init?.headers).get("x-csrf-token")).toBe("test-csrf");
  for (const header of ["authorization", "x-api-key"]) {
    expect(new Headers(init?.headers).has(header)).toBe(false);
  }
  expect(JSON.parse(String(init?.body))).toEqual({
    model: "demo",
    max_tokens: 32,
    system: "Be brief",
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Continue" },
    ],
    stream: true,
  });
});

it.each([
  ["event: ping\ndata: {}\n\n", "ended before the response finished"],
  [
    'event: error\ndata: {"error":{"message":"Fixture error"}}\n\n',
    "Fixture error",
  ],
])(
  "reports incomplete and failed inference streams",
  async (frames, message) => {
    fixture(frames);
    await expect(
      runPlayground(prompt, "user_demo", new AbortController().signal, vi.fn()),
    ).rejects.toThrow(message);
  },
);

it("posts stream false and reads the complete Messages JSON, including usage and non-text blocks in Raw", async () => {
  const message = {
    id: "msg_whole",
    type: "message",
    role: "assistant",
    model: "demo",
    content: [
      { type: "text", text: "Hello" },
      { type: "thinking", thinking: "Reasoning" },
      {
        type: "tool_use",
        id: "tool_one",
        name: "lookup",
        input: { days: [1, 2] },
      },
      { type: "text", text: " again" },
    ],
    stop_reason: "end_turn",
    usage: { input_tokens: 12, output_tokens: 3 },
  };
  const fetcher = fixture(
    JSON.stringify(message),
    "application/json; charset=utf-8",
  );
  const append = vi.fn();
  const request = { ...prompt, stream: false };
  const signal = new AbortController().signal;
  const result = await runPlayground(request, "user_demo", signal, append);
  expect(fetcher.mock.calls[1]).toEqual([
    resource + "/messages?beta=true",
    expect.objectContaining({
      method: "POST",
      signal,
      body: JSON.stringify(request),
    }),
  ]);
  expect(
    new Headers(fetcher.mock.calls[1][1]?.headers).get("x-csrf-token"),
  ).toBe("test-csrf");
  expect(append.mock.calls).toEqual([["Hello"], [" again"]]);
  expect(result).toMatchObject({
    rawLabel: "Response body",
    inputTokens: 12,
    outputTokens: 3,
  });
  expect(JSON.parse(result.raw)).toEqual(message);
  expect(result.content).toEqual(message.content);
});

it("assembles streamed tool arguments without flattening the surrounding content and keeps invalid fragments only in Raw", async () => {
  const signature = {
    type: "thinking",
    thinking: "Consider",
    signature: "bound",
  };
  const block = { type: "tool_use", id: "tool_a", name: "lookup", input: {} };
  const frames = (lastPart: string) =>
    [
      {
        type: "message_start",
        message: { type: "message", content: [], usage: { input_tokens: 3 } },
      },
      { type: "content_block_start", index: 0, content_block: signature },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: block },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"cities":' },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: lastPart },
      },
      { type: "content_block_stop", index: 1 },
      { type: "message_stop" },
    ]
      .map((f) => "event: " + f.type + "\ndata: " + JSON.stringify(f) + "\n\n")
      .join("");
  fixture(frames('["Lyon"]}'));
  const append = vi.fn();
  const full = await runPlayground(
    prompt,
    "user_demo",
    new AbortController().signal,
    append,
  );
  const blocks = [signature, { ...block, input: { cities: ["Lyon"] } }];
  expect(full.content).toEqual(blocks);
  expect(JSON.parse(full.raw).content).toEqual(blocks);
  expect(append).not.toHaveBeenCalled();
  fixture(frames("["));
  const partial = await runPlayground(
    prompt,
    "user_demo",
    new AbortController().signal,
    append,
  );
  expect(partial.rawLabel).toBe("Stream events");
  expect(partial.content).toBeUndefined();
  expect(partial.raw).toContain("input_json_delta");
});

it.each([
  [true, "application/json", "{}", "streaming response"],
  [false, "text/event-stream", "event: ping\ndata: {}\n\n", "JSON response"],
  [false, "application/json", "{}", "Messages response body"],
] as const)(
  "rejects an unexpected response for stream %s (%s)",
  async (stream, contentType, body, message) => {
    fixture(body, contentType);
    await expect(
      runPlayground(
        { ...prompt, stream },
        "user_demo",
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow(message);
  },
);

it("displays the completed gateway body and its reported usage, preserving unknown response fields", async () => {
  const message = {
    id: "msg_demo",
    type: "message",
    role: "assistant",
    model: "demo",
    content: [],
    stop_reason: null,
    usage: { input_tokens: 6, output_tokens: 0 },
    extension: "provided",
  };
  const frames = [
    { type: "message_start", message },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "Reasoning" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "fixture" },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "content_block_start",
      index: 1,
      content_block: { type: "text", text: "O" },
    },
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "text_delta", text: "K" },
    },
    { type: "content_block_stop", index: 1 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 2 },
    },
    { type: "message_stop" },
  ];
  fixture(
    frames
      .map((f) => `event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`)
      .join(""),
  );
  const append = vi.fn();
  const out = await runPlayground(
    prompt,
    "user_demo",
    new AbortController().signal,
    append,
  );
  expect(append.mock.calls).toEqual([["O"], ["K"]]);
  expect(out).toMatchObject({
    rawLabel: "Response body",
    inputTokens: 6,
    outputTokens: 2,
  });
  expect(JSON.parse(out.raw)).toEqual({
    ...message,
    content: [
      { type: "thinking", thinking: "Reasoning", signature: "fixture" },
      { type: "text", text: "OK" },
    ],
    stop_reason: "end_turn",
    usage: { input_tokens: 6, output_tokens: 2 },
  });
});
