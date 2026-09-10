export function metadataObject(source: string): Record<string, string> {
  const parsed: unknown = JSON.parse(source);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("Metadata must be a JSON object.");
  if (Object.values(parsed).some((value) => typeof value !== "string"))
    throw new Error("Metadata values must be strings.");

  return parsed as Record<string, string>;
}

export function metadataPatch(
  source: string,
  previous: Record<string, string> = {},
): Record<string, string | null> {
  const metadata = metadataObject(source);
  const entries: Array<[string, string | null]> = Object.entries(metadata);
  for (const key of Object.keys(previous)) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) {
      entries.push([key, null]);
    }
  }
  return Object.fromEntries(entries);
}
