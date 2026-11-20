import { afterEach, expect, it, vi } from "vitest";
import { playgroundModels, runPlayground } from "./playground";
import { readAccount } from "./native";

const resource = "/api/organizations/default/proxy/v1";
const prompt = {
  model: "demo",
  prompt: "Hello",
  system: "Be brief",
  maxTokens: 32,
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
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
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
  await runPlayground(prompt, "user_demo", signal, append);
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
    messages: [{ role: "user", content: "Hello" }],
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
