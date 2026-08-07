import { describe, expect, it } from "vitest";
import { tokenAttr, tokenCount } from "./utils";

/**
 * The unit-tier owner of `tokenCount`'s rendered string, mirroring what
 * `timing.test.ts` is for `durationLabel` (CLAUDE.md's `data-*` convention:
 * one designated test per formatter, everyone else reads the attribute).
 * Without this the format's only owner would be an e2e test, and `pnpm test`
 * would stay green through a broken counter.
 */
describe("tokenCount", () => {
  it("groups thousands and dashes what did not arrive", () => {
    expect(tokenCount(0)).toBe("0");
    expect(tokenCount(5412)).toBe((5412).toLocaleString());
    expect(tokenCount(undefined)).toBe("—");
  });
});

describe("tokenAttr", () => {
  it("is present exactly when tokenCount renders a number", () => {
    // The pairing is the point: an attribute that survived a value the text
    // refused would let a test assert a number no operator can see. Cover
    // both branches and the wire-reachable overflow (`1e400` parses to
    // Infinity — JSON has no NaN literal, but NaN is cheap to include).
    const cases: unknown[] = [
      0,
      5412,
      -1,
      undefined,
      null,
      "1234",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      JSON.parse('{"n":1e400}').n,
    ];
    for (const value of cases) {
      const dashed = tokenCount(value) === "—";
      expect(
        { value, attrAbsent: tokenAttr(value) === undefined },
        `tokenCount(${String(value)}) === "${tokenCount(value)}"`,
      ).toEqual({ value, attrAbsent: dashed });
    }
  });
});
