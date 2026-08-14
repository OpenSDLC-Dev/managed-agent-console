// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type IdentitySession,
  deleteSession,
  getSession,
  putPending,
  putSession,
  resetIdentityStoreForTests,
  takePending,
} from "./session";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetIdentityStoreForTests();
});

const pendingAt = (createdAt: number) => ({
  verifier: "v",
  nonce: "n",
  returnTo: "/agents",
  redirectUri: "https://console.example/api/auth/callback",
  createdAt,
});

const session = (expiresAt: number): IdentitySession => ({
  idToken: "id-token",
  expiresAt,
  subject: "user-1",
});

describe("pending authorizations", () => {
  it("round-trips a pending authorization", () => {
    putPending("state-1", pendingAt(1000));
    expect(takePending("state-1", 2000)).toMatchObject({ nonce: "n" });
  });

  // The callback URL survives in browser history, in a referrer, and in
  // whatever the provider logged. Read-once is what stops a second visit to it
  // minting a second session from one authorization.
  it("probe: yields a pending authorization exactly once", () => {
    putPending("state-1", pendingAt(1000));
    expect(takePending("state-1", 1000)).toBeDefined();
    expect(takePending("state-1", 1000)).toBeUndefined();
  });

  it("probe: refuses an expired authorization, and consumes it anyway", () => {
    putPending("state-1", pendingAt(0));
    const elevenMinutes = 11 * 60 * 1000;
    expect(takePending("state-1", elevenMinutes)).toBeUndefined();
    // Consumed rather than left behind: a record the caller was told not to
    // trust must not still be sitting there for the next attempt.
    expect(takePending("state-1", 0)).toBeUndefined();
  });

  it("returns nothing for a state it never issued", () => {
    expect(takePending("never-issued", 0)).toBeUndefined();
  });

  // `/api/auth/login` is anonymous by construction — nobody can be signed in
  // before it runs — so an unbounded map here is a memory exhaustion that costs
  // an attacker one GET per entry and needs no credential at all.
  it("probe: bounds the map an anonymous caller can grow", () => {
    for (let i = 0; i < 5000; i++) putPending(`state-${i}`, pendingAt(1000));
    // The oldest are evicted; the most recent survives, so a real sign-in
    // started during a flood still completes.
    expect(takePending("state-0", 1000)).toBeUndefined();
    expect(takePending("state-4999", 1000)).toBeDefined();
  });
});

describe("sessions", () => {
  it("round-trips a live session", () => {
    putSession("sid", session(10_000));
    expect(getSession("sid", 5000)).toMatchObject({ subject: "user-1" });
  });

  it("returns nothing for an unknown or absent handle", () => {
    expect(getSession("nope", 0)).toBeUndefined();
    expect(getSession(undefined, 0)).toBeUndefined();
  });

  // Expiry is enforced on read rather than left to a sweep, so a caller cannot
  // hold a stale session by never triggering one.
  it("probe: refuses an expired session and drops it", () => {
    putSession("sid", session(1000));
    expect(getSession("sid", 1000)).toBeUndefined();
    expect(getSession("sid", 0)).toBeUndefined();
  });

  it("forgets a session on logout", () => {
    putSession("sid", session(10_000));
    deleteSession("sid");
    expect(getSession("sid", 0)).toBeUndefined();
    // A logout with no cookie is a no-op, not a crash.
    expect(() => deleteSession(undefined)).not.toThrow();
  });

  it("bounds the session map", () => {
    // Live expiries on purpose: with epoch-relative ones the per-insert sweep
    // would empty the map every time and this would pass without the cap ever
    // being what evicted anything.
    const live = Date.now() + 60_000;
    for (let i = 0; i < 5000; i++) putSession(`sid-${i}`, session(live));
    expect(getSession("sid-0", Date.now())).toBeUndefined();
    expect(getSession("sid-4999", Date.now())).toBeDefined();
  });
});
