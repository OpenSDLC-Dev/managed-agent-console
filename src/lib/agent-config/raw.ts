import YAML from "yaml";

/**
 * Raw-editor codec. JSON is the wire truth and the only save format; YAML is
 * editor sugar over the same object (plan 01: no anchors/tags, keys stay
 * strings — YAML.parse output feeds straight back into JSON).
 */

export type RawFormat = "json" | "yaml";

export function toRaw(config: unknown, format: RawFormat): string {
  return format === "json"
    ? JSON.stringify(config, null, 2)
    : YAML.stringify(config, { aliasDuplicateObjects: false });
}

export function fromRaw(
  text: string,
  format: RawFormat,
): { config?: Record<string, unknown>; error?: string } {
  try {
    const parsed = format === "json" ? JSON.parse(text) : YAML.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { error: "the config must be an object" };
    }
    return { config: parsed as Record<string, unknown> };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "parse error" };
  }
}
