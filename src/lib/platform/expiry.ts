/**
 * Whether a wire `expires_at` has passed, against a caller-supplied clock: an
 * environment key's (environmentKeyState) and a file's, whose content
 * store.FileLiveSQL holds gone once it has. The platform lists both kinds of
 * row expired or not, so the console has to say which is which. That is a
 * rendering derivation, not domain logic (principle 4), but it owns a clock,
 * so `now` is a parameter rather than a `Date.now()` buried in a branch.
 *
 * A null `expires_at` never expires, and an unparseable one is not evidence
 * of expiry: a row that says "never" must not read as expired.
 */
export function hasExpired(
  expiresAt: string | null | undefined,
  now: number,
): boolean {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  return !Number.isNaN(at) && at <= now;
}
