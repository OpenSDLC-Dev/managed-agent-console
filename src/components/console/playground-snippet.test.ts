import { expect, it } from "vitest";
import { newDraft } from "./playground-editor";
import { formatSnippet, readSnippet } from "./playground-snippet";
import type { PlaygroundRequest } from "@/lib/platform/playground";

const request: PlaygroundRequest = {
  model: "demo",
  max_tokens: 32,
  stream: true,
  messages: [{ role: "user", content: "A note\nwith a quote '\" and $HOME." }],
};

it("round-trips multiline prompts literally and keeps explicit empty fields distinct from untouched Form inputs", () => {
  for (const language of ["cURL", "JSON"] as const) {
    const source = formatSnippet(request, language);
    const result = readSnippet(source, language, newDraft());
    expect(result.messages[0].content).toBe(request.messages[0].content);
  }
  const previous = newDraft();
  previous.messages = [
    { id: 5, role: "user", content: "" },
    { id: 6, role: "assistant", content: "" },
  ];
  expect(
    readSnippet(JSON.stringify({ ...request, messages: [] }), "JSON", previous)
      .messages,
  ).toBe(previous.messages);
  const result = readSnippet(
    JSON.stringify({
      ...request,
      system: "",
      messages: [{ role: "user", content: "" }],
    }),
    "JSON",
    previous,
  );
  expect(result.includeEmptySystem).toBe(true);
  expect(result.messages).toEqual([
    { id: 0, role: "user", content: "", includeEmpty: true, parameters: {} },
  ]);
});

it.each([
  ["null", "Messages request object"],
  [JSON.stringify({ ...request, model: [] }), "model alias"],
  [JSON.stringify({ ...request, max_tokens: 0 }), "positive whole number"],
  [JSON.stringify({ ...request, stream: "yes" }), "stream to true or false"],
  [
    JSON.stringify({ ...request, system: { type: "text", text: "Hello" } }),
    "array of content blocks for system",
  ],
  [JSON.stringify({ ...request, messages: "hello" }), "array of messages"],
  [
    JSON.stringify({
      ...request,
      messages: [{ role: "user", content: [null] }],
    }),
    "user or assistant role and a string or array of content blocks",
  ],
])("rejects invalid Messages request fields (%#)", (source, explanation) => {
  expect(() => readSnippet(source, "JSON", newDraft())).toThrow(explanation);
});
