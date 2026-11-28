import { memo, type ReactNode } from "react";
import { refractor } from "refractor/core";
import bash from "refractor/bash";
import json from "refractor/json";
import markup from "refractor/markup";
import python from "refractor/python";
import typescript from "refractor/typescript";
import yaml from "refractor/yaml";

for (const grammar of [bash, json, markup, python, typescript, yaml]) {
  refractor.register(grammar);
}

export type SyntaxLanguage =
  "bash" | "json" | "markup" | "python" | "typescript" | "javascript" | "yaml";

export function sourceLanguage(label: string): SyntaxLanguage | undefined {
  switch (label.toLowerCase()) {
    case "bash":
    case "sh":
    case "shell":
    case "curl":
      return "bash";
    case "json":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "typescript":
    case "ts":
      return "typescript";
    case "javascript":
    case "js":
    case "mjs":
      return "javascript";
    case "python":
    case "py":
      return "python";
    case "xml":
    case "html":
    case "markup":
      return "markup";
  }
}

export function fileLanguage(mime: string, filename: string) {
  const type = mime.split(";")[0].trim().toLowerCase();
  return (
    sourceLanguage(type.split("/").pop() ?? "") ??
    sourceLanguage(filename.split(".").pop() ?? "")
  );
}

// Keep large payloads selectable and copyable without building thousands of spans.
export const highlightLimit = 32_768;
type Node = ReturnType<typeof refractor.highlight>["children"][number];

function renderNode(node: Node, index: number): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type === "element") {
    const classes = node.properties.className;
    return (
      <span
        key={index}
        className={Array.isArray(classes) ? classes.join(" ") : undefined}
      >
        {node.children.map(renderNode)}
      </span>
    );
  }
}

export const SyntaxCode = memo(function SyntaxCode({
  language,
  children,
}: {
  language?: SyntaxLanguage;
  children: string | undefined;
}) {
  return (
    <code data-language={language}>
      {language && children && children.length <= highlightLimit
        ? refractor.highlight(children, language).children.map(renderNode)
        : children}
    </code>
  );
});
