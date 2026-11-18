// @vitest-environment node
import { expect, it } from "vitest";
import type { TestInfo } from "@playwright/test";
import { guardFailureSerialization } from "../test/native/failure-guard";
import { liveDiagnosticRedactor } from "../test/e2e-live/test";

it("keeps live failures and step diagnostics readable with synthetic credentials removed", () => {
  const login = "synthetic-user";
  const password = 'synthetic "password"';
  const configuredKey = "synthetic-configured-key";
  const issuedKey = ["sk", "map", "env01", "synthetic"].join("-");
  const csrfToken = "synthetic-csrf-token";
  const messages: unknown[] = [];
  const info = {
    errors: [],
    _addStep(data: unknown, _parent: unknown) {
      void _parent;
      messages.push(data);
      return { complete: (result: unknown) => messages.push(result) };
    },
    _failWithError(error: unknown) {
      messages.push(error);
    },
  };
  guardFailureSerialization(
    info as unknown as TestInfo,
    liveDiagnosticRedactor([login, password, configuredKey]),
    true,
    "Incompatible runner",
  );

  const failure = Object.assign(
    new Error(
      `Fixture result: HTTP 502\n    x-csrf-token: ${csrfToken}\n${encodeURIComponent(password)}`,
    ),
    {
      matcherResult: {
        ariaSnapshot: `heading: Fixture login\ntext: ${issuedKey}`,
      },
    },
  );
  info
    ._addStep(
      { title: `Fill ${login}`, params: { value: password } },
      undefined,
    )
    .complete({ error: failure });
  info._failWithError(
    new Error(`Fixture send: ${JSON.stringify(password)} ${configuredKey}`),
  );

  const diagnostics = messages
    .map((message) =>
      JSON.stringify(message, (_key, value: unknown) =>
        value instanceof Error
          ? { ...value, message: value.message, stack: value.stack }
          : value,
      ),
    )
    .join("\n");
  for (const value of [
    login,
    password,
    configuredKey,
    issuedKey,
    csrfToken,
    encodeURIComponent(password),
    JSON.stringify(password).slice(1, -1),
  ])
    expect(diagnostics.includes(value)).toBe(false);
  expect(diagnostics).toContain("Fill [REDACTED]");
  expect(diagnostics).toContain("Fixture login");
  expect(diagnostics).toContain("HTTP 502");
});
