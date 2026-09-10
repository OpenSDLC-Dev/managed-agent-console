import { describe, expect, it } from "vitest";
import { metadataPatch } from "./metadata";

describe("metadataPatch", () => {
  it("upserts strings and tombstones removed keys", () => {
    expect(
      metadataPatch('{"owner":"ops"}', { owner: "old", remove: "yes" }),
    ).toEqual({ owner: "ops", remove: null });
  });

  it("rejects arrays and non-string values", () => {
    expect(() => metadataPatch("[]")).toThrow("JSON object");
    expect(() => metadataPatch('{"count":2}')).toThrow("must be strings");
  });

  it("tombstones own keys that overlap Object.prototype", () => {
    const previous = JSON.parse(
      '{"toString":"old","__proto__":"old"}',
    ) as Record<string, string>;
    const patch = metadataPatch("{}", previous);

    expect(
      Object.getOwnPropertyDescriptor(patch, "toString")?.value,
    ).toBeNull();
    expect(
      Object.getOwnPropertyDescriptor(patch, "__proto__")?.value,
    ).toBeNull();
  });
});
