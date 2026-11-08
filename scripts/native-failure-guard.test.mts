// @vitest-environment node
import { expect, it } from "vitest";
import type { TestInfo } from "@playwright/test";
import { protectFailureDiagnostics } from "../test/native/failure-guard";

function fixture() {
  const serialized: unknown[] = [];
  const info = {
    errors: [],
    _addStep(_data: unknown, _parent: unknown) {
      void _data;
      void _parent;
      return { complete: (result: unknown) => serialized.push(result) };
    },
    _failWithError: (error: unknown) => serialized.push(error),
  };
  return { info, serialized };
}

it("native failure guard refuses an unverified version or missing serialization hook", () => {
  const { info, serialized } = fixture();
  expect(() =>
    protectFailureDiagnostics(info as unknown as TestInfo, "1.65.0"),
  ).toThrow("verified Playwright 1.64.1");
  for (const name of ["_addStep", "_failWithError"]) {
    expect(() =>
      protectFailureDiagnostics(
        { ...info, [name]: undefined } as unknown as TestInfo,
        "1.64.1",
      ),
    ).toThrow("verified Playwright 1.64.1");
  }
  expect(serialized).toEqual([]);
});

it("native failure guard protects soft, aggregate and non-Error diagnostics before serialization", () => {
  const { info, serialized } = fixture();
  protectFailureDiagnostics(info as unknown as TestInfo, "1.64.1");
  const marker = ["sk", "map", "api01", "synthetic"].join("-");
  const failure = Object.assign(new Error(`ordinary detail ${marker}`), {
    matcherResult: {
      ariaSnapshot: `heading: ordinary detail\ntext: ${marker}`,
    },
  });
  const step = info._addStep({ title: "ordinary step" }, undefined);
  step.complete({ softError: failure });
  info._failWithError(
    new AggregateError([failure], `ordinary aggregate ${marker}`, {
      cause: failure,
    }),
  );
  info._failWithError({ raw_key: marker });
  const text = serialized.map((value) => JSON.stringify(value)).join("\n");
  expect(text.includes(marker)).toBe(false);
  expect(failure.message).toBe("ordinary detail [REDACTED issued API key]");
  expect(failure.matcherResult.ariaSnapshot).toContain(
    "heading: ordinary detail",
  );
  expect(serialized).toHaveLength(3);
});

it("native failure guard refuses an incompatible step before completion", () => {
  const { info } = fixture();
  info._addStep = function (_data, _parent) {
    void _data;
    void _parent;
    return { complete: undefined } as never;
  };
  protectFailureDiagnostics(info as unknown as TestInfo, "1.64.1");
  expect(() => info._addStep({ title: "ordinary step" }, undefined)).toThrow(
    "cannot protect this Playwright step",
  );
});
