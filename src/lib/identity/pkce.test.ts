// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { codeChallenge, randomToken, timingSafeEqual } from "./pkce";

vi.mock("server-only", () => ({}));

describe("codeChallenge", () => {
  // RFC 7636 Appendix B, verbatim. A round-trip through our own implementation
  // would agree with itself while both halves were wrong; this is the only
  // assertion here that is evidence rather than consistency.
  it("matches the RFC 7636 test vector", async () => {
    expect(
      await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("is base64url with no padding", async () => {
    const challenge = await codeChallenge(randomToken());
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("randomToken", () => {
  it("is base64url and long enough for RFC 7636's 43-character floor", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(seen.size).toBe(200);
  });
});

describe("timingSafeEqual", () => {
  it("accepts equal strings and rejects everything else", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
