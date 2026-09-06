import { describe, expect, it } from "vitest";
import { SessionResourceSchema } from "./schemas";
import { memoryResources } from "../../../test/mock-platform/fixtures.mjs";

describe("implemented session resource variants", () => {
  it("accepts a memory snapshot without an invented resource id or timestamps", () => {
    const memory = SessionResourceSchema.parse(memoryResources[0]);
    expect(memory.type).toBe("memory_store");
    expect(memory).not.toHaveProperty("id");
  });
  it.each([
    null,
    { type: "branch", name: "main" },
    { type: "commit", sha: "a".repeat(40) },
  ])("reads repository checkout %j without exposing tokens", (checkout) => {
    const repository = SessionResourceSchema.parse({
      id: "sesrsc_1",
      type: "github_repository",
      url: "https://github.com/example/project",
      mount_path: "/workspace/project",
      checkout,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    });
    expect(repository.type).toBe("github_repository");
    expect(repository).not.toHaveProperty("authorization_token");
  });
});
