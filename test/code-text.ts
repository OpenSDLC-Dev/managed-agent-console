/** Read the complete source even when syntax spans split it into text nodes. */
export function codeText(pattern: RegExp) {
  return (_content: string, node: Element | null) =>
    node?.tagName === "CODE" && pattern.test(node.textContent ?? "");
}
