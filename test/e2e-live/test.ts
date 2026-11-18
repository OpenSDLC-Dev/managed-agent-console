import { test as base } from "@playwright/test";
import { version } from "@playwright/test/package.json";
import {
  guardFailureSerialization,
  redactIssuedKeys,
} from "../native/failure-guard";
import { resolveLiveEnv } from "./env";
export { expect } from "@playwright/test";

export function liveDiagnosticRedactor(values: string[]) {
  const variants = [
    ...new Set(
      values.flatMap((value) => [
        value,
        JSON.stringify(value).slice(1, -1),
        encodeURIComponent(value),
      ]),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return (text: string) => {
    // Request call logs include cookie and auth headers on transport failures.
    let safe = redactIssuedKeys(text).replace(
      /^(\s*(?:[-•]\s*)?(?:cookie|set-cookie|authorization|x-api-key|x-csrf-token)\s*:).*$/gim,
      "$1 [REDACTED]",
    );
    for (const value of variants) safe = safe.replaceAll(value, "[REDACTED]");
    return safe;
  };
}

export const test = base.extend<{ liveFailureGuard: void }>({
  liveFailureGuard: [
    async ({}, use, info) => {
      if (
        process.env.PLAYWRIGHT_NO_COPY_PROMPT !== "1" ||
        [
          info.project.use.trace,
          info.project.use.screenshot,
          info.project.use.video,
        ].some((mode) => mode !== "off")
      )
        throw new Error(
          "Live tests require automatic page captures to be disabled",
        );

      // Playwright 1.65.1 sends step data and matcher aria snapshots through
      // worker IPC. Sanitize before serialization and before error-context.md.
      const incompatibleMessage =
        "Live failure guard requires the verified Playwright 1.65.1 error hooks";
      if (version !== "1.65.1") throw new Error(incompatibleMessage);
      const { apiKey, loginName, loginPassword } = resolveLiveEnv();
      guardFailureSerialization(
        info,
        liveDiagnosticRedactor([apiKey, loginName, loginPassword]),
        true,
        incompatibleMessage,
      );
      await use();
    },
    // Playwright uses this setting for its own tracing fixture. Live specs
    // also need the guard before credentialed beforeAll/afterAll hooks run.
    { auto: "all-hooks-included" as unknown as true, box: true },
  ],
});
