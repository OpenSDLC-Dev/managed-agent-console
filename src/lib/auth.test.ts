import { describe, expect, it } from "vitest";
import { isValidSession, sessionTokenFor } from "./auth";

describe("console session tokens", () => {
  it("round-trips for the matching password", async () => {
    const token = await sessionTokenFor("hunter2");
    expect(await isValidSession(token, "hunter2")).toBe(true);
  });

  it("rejects tokens minted under a different password", async () => {
    const token = await sessionTokenFor("old-password");
    expect(await isValidSession(token, "new-password")).toBe(false);
  });

  it("rejects missing and malformed tokens", async () => {
    expect(await isValidSession(undefined, "pw")).toBe(false);
    expect(await isValidSession("not-a-token", "pw")).toBe(false);
  });
});
