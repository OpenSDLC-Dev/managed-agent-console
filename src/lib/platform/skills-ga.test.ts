// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SkillSchema, SkillVersionSchema } from "./schemas";

// internal/api/skills.go skillJSON and skillVersionJSON (platform plan 39).
describe("GA Skills wire contract", () => {
  it("accepts the implemented skill and version responses without retired fields", () => {
    const created_at = "2026-09-05T00:00:00Z";
    const version = {
      id: "skver_example",
      type: "skill_version",
      skill_id: "skill_example",
      name: "example",
      description: "An example skill",
      created_at,
    };
    expect(SkillVersionSchema.safeParse(version).success).toBe(true);
    expect(
      SkillSchema.safeParse({
        id: version.skill_id,
        type: "skill",
        display_name: "Example",
        source: { type: "custom" },
        latest_version_id: version.id,
        created_at,
        updated_at: created_at,
      }).success,
    ).toBe(true);
  });
});
