import { describe, expect, it } from "vitest";
import { createdGte } from "./created-filter";

describe("createdGte", () => {
  const now = Date.parse("2026-08-04T12:00:00Z");

  it("is undefined for the all-time preset", () => {
    expect(createdGte("all", now)).toBeUndefined();
  });

  it("maps presets to created_at[gte] bounds", () => {
    expect(createdGte("24h", now)).toBe("2026-08-03T12:00:00.000Z");
    expect(createdGte("7d", now)).toBe("2026-07-28T12:00:00.000Z");
    expect(createdGte("30d", now)).toBe("2026-07-05T12:00:00.000Z");
  });
});
