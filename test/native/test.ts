import { test as base } from "@playwright/test";
import { version } from "@playwright/test/package.json";
import { protectFailureDiagnostics } from "./failure-guard";
export { expect } from "@playwright/test";

// Every native spec uses this test. It runs before browser fixtures and
// beforeEach, preserving ordinary failure diagnostics. It is not a log or
// attachment sanitizer: never explicitly print or attach live credentials.
export const test = base.extend<{ nativeFailureGuard: void }>({
  nativeFailureGuard: [
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
          "Native tests require automatic page captures to be disabled",
        );
      protectFailureDiagnostics(info, version);
      await use();
    },
    { auto: true, box: true },
  ],
});
