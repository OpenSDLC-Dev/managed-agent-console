/**
 * Minimal SSE reader over fetch. EventSource cannot express the platform's
 * named frames cleanly (every event type would need its own listener) and
 * gives no control over reconnection, so we parse the stream ourselves.
 *
 * Platform framing (internal/api/events.go streamSessionEvents): every frame
 * is `event: <name>\ndata: <json>\n\n`; the name mirrors the payload's type.
 * There is no history replay and no Last-Event-ID.
 */

export interface SseFrame {
  event: string;
  data: string;
}

/** Parse a byte stream into SSE frames; tolerates chunk splits anywhere. */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Frames are separated by a blank line; normalize CRLF first.
      buffer = buffer.replace(/\r\n/g, "\n");
      for (;;) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary === -1) break;
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseFrame(raw);
        if (frame) yield frame;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(raw: string): SseFrame | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue; // comment
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:"))
      dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}
