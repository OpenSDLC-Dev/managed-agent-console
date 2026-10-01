/**
 * The tenancy segments the platform reserves and answers for by name — the
 * literal `default` on both (`internal/api/consoleapi.go`,
 * `internal/api/consoleapikeys.go`). They exist because the reference's URLs
 * carry them; the platform refuses any other value.
 *
 * A plain module rather than part of `surfaces.ts`, which is `"use client"`:
 * the BFF's route handlers pin their allowlists to these same values, so that
 * a path naming another organization is never forwarded (see
 * `src/app/api/oauth/[...path]/route.ts`).
 */
export const CONSOLE_ORG = "default";
export const CONSOLE_WORKSPACE = "default";
