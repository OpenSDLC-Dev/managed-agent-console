import { describe, expect, it } from "vitest";
import { parseSseStream, type SseFrame } from "./sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(
  stream: ReadableStream<Uint8Array>,
): Promise<SseFrame[]> {
  const frames: SseFrame[] = [];
  for await (const frame of parseSseStream(stream)) frames.push(frame);
  return frames;
}

describe("parseSseStream", () => {
  it("parses named frames", async () => {
    const frames = await collect(
      streamOf(['event: agent.message\ndata: {"type":"agent.message"}\n\n']),
    );
    expect(frames).toEqual([
      { event: "agent.message", data: '{"type":"agent.message"}' },
    ]);
  });

  it("reassembles frames split across arbitrary chunk boundaries", async () => {
    const raw = 'event: event_delta\ndata: {"type":"event_delta","x":1}\n\n';
    for (const cut of [5, 20, raw.length - 2]) {
      const frames = await collect(
        streamOf([raw.slice(0, cut), raw.slice(cut)]),
      );
      expect(frames).toHaveLength(1);
      expect(frames[0].event).toBe("event_delta");
    }
  });

  it("handles multiple frames per chunk, CRLF, and comments", async () => {
    const frames = await collect(
      streamOf([
        'event: ping\r\ndata: {"type":"ping"}\r\n\r\n: keepalive\n\nevent: e\ndata: 1\n\n',
      ]),
    );
    expect(frames.map((f) => f.event)).toEqual(["ping", "e"]);
  });

  it("joins multi-line data fields", async () => {
    const frames = await collect(streamOf(["event: e\ndata: a\ndata: b\n\n"]));
    expect(frames[0].data).toBe("a\nb");
  });
});
