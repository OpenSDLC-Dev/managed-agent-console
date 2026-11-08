import { inspect } from "node:util";
import type { TestInfo } from "@playwright/test";

// Playwright 1.64.1 serializes matcherResult.ariaSnapshot in BOTH step.complete
// and _failWithError, before reporter IPC and error-context.md. NO_COPY_PROMPT
// controls only the separate page snapshot. No public matcher redaction hook
// exists at this pin. Keep this narrow seam pinned and fail before browser use
// if its shape changes; failure-artifacts.test.mjs exercises the real writer.
type Failure = { error?: unknown; softError?: unknown };
type Step = { complete: (result: Failure) => void };
type NativeTestInfo = TestInfo & {
  _addStep: (data: { title: string; subtitle?: string }, parent?: Step) => Step;
  _failWithError: (error: unknown) => void;
};
const redact = (text: string) =>
  text.replace(/sk-map-api01-[A-Za-z0-9_-]+/g, "[REDACTED issued API key]");

export function protectFailureDiagnostics(info: TestInfo, version: string) {
  const internal = info as NativeTestInfo;
  if (
    version !== "1.64.1" ||
    typeof internal._addStep !== "function" ||
    internal._addStep.length !== 2 ||
    typeof internal._failWithError !== "function" ||
    internal._failWithError.length !== 1 ||
    !Array.isArray(info.errors)
  )
    throw new Error(
      "Native failure guard requires the verified Playwright 1.64.1 error hooks",
    );

  const seen = new WeakSet<Error>();
  function error(value: unknown): unknown {
    if (!(value instanceof Error))
      return redact(typeof value === "string" ? value : inspect(value));
    if (seen.has(value)) return value;
    seen.add(value);
    value.message = redact(value.message);
    if (value.stack) value.stack = redact(value.stack);
    if (value.cause) value.cause = error(value.cause);
    if (value instanceof AggregateError) value.errors = value.errors.map(error);
    const matcher = (
      value as Error & { matcherResult?: { ariaSnapshot?: string } }
    ).matcherResult;
    if (typeof matcher?.ariaSnapshot === "string")
      matcher.ariaSnapshot = redact(matcher.ariaSnapshot);
    return value;
  }
  const addStep = internal._addStep.bind(internal);
  internal._addStep = (data, parent) => {
    const step = addStep(
      {
        ...data,
        title: redact(data.title),
        subtitle: data.subtitle && redact(data.subtitle),
      },
      parent,
    );
    if (typeof step.complete !== "function" || step.complete.length !== 1)
      throw new Error(
        "Native failure guard cannot protect this Playwright step",
      );
    const complete = step.complete.bind(step);
    step.complete = (result) =>
      complete({
        ...result,
        ...(result.error ? { error: error(result.error) } : {}),
        ...(result.softError ? { softError: error(result.softError) } : {}),
      });
    return step;
  };
  const fail = internal._failWithError.bind(internal);
  internal._failWithError = (value) => fail(error(value));
  // TestInfo is per test. Do not restore on fixture teardown: later teardown
  // failures must also be sanitized before the artifact fixture runs.
}
