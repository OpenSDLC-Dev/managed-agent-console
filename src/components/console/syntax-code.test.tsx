import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryMarkdown } from "./memory-markdown";
import {
  SyntaxCode,
  fileLanguage,
  highlightLimit,
  type SyntaxLanguage,
} from "./syntax-code";

afterEach(cleanup);

it.each<[SyntaxLanguage, string]>([
  ["json", '{"city":"東京","markup":"<img src=x>","ok":true,"n":42}\n'],
  ["yaml", "name: 'foo: bar'\nnotes: |\n  # prose\n"],
  [
    "bash",
    'curl --request POST "$PLATFORM_BASE_URL" \\\n  -d \'{"hello":"world"}\'',
  ],
  ["typescript", 'const text: string = "🌱";\n'],
  ["javascript", "const n = 42;\n"],
  ["python", 'from pathlib import Path\nprint("hello")\n'],
  ["markup", '<img src="https://example.test/never-requested">'],
])("colors %s without changing any source characters", (language, source) => {
  const { container } = render(
    <SyntaxCode language={language}>{source}</SyntaxCode>,
  );
  expect(container.textContent).toBe(source);
  expect(container.querySelectorAll(".token").length).toBeGreaterThan(1);
  expect(container.querySelector("img")).toBeNull();
});

it("leaves large payloads and unrecognized file types readable as text", () => {
  const source = '"'.repeat(highlightLimit + 1);
  const { container } = render(
    <SyntaxCode language="json">{source}</SyntaxCode>,
  );
  expect(container.textContent).toBe(source);
  expect(container.querySelector(".token")).toBeNull();
  expect(fileLanguage("application/json; charset=utf-8", "download")).toBe(
    "json",
  );
  expect(fileLanguage("text/plain", "agent.yml")).toBe("yaml");
  expect(fileLanguage("text/plain", "readme.txt")).toBeUndefined();
});

it("colors declared Markdown fences while keeping inline code and unknown fences literal", () => {
  const { container } = render(
    <MemoryMarkdown
      content={
        'Use `"key"`.\n\n```json\n{"x": 1}\n```\n\n```unknown\n<img src=x>\n```'
      }
    />,
  );
  expect(
    container.querySelector("code[data-language=json] .property")?.textContent,
  ).toBe('"x"');
  expect(container.querySelectorAll("code .token").length).toBeGreaterThan(1);
  expect(container.querySelector("code.language-unknown")?.textContent).toBe(
    "<img src=x>\n",
  );
  expect(container.querySelector("p code")?.children.length).toBe(0);
  expect(container.querySelector("img")).toBeNull();
});
