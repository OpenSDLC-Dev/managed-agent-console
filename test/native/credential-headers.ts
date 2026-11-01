/** Record header presence only, never credential values or callback queries. */
export function credentialHeaders(
  origin: string,
  url: string,
  headers: Record<string, string>,
): string[] {
  if (new URL(url).origin !== origin) return [];
  return Object.keys(headers).filter((name) =>
    ["x-api-key", "authorization"].includes(name.toLowerCase()),
  );
}
