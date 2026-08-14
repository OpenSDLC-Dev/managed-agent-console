import { describe, expect, it } from "vitest";
import { isHttpsRequest, isValidSession, sessionTokenFor } from "./auth";

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

describe("isHttpsRequest", () => {
  const request = (protocol: string, forwarded?: string) => ({
    headers: {
      get: (name: string) =>
        name === "x-forwarded-proto" ? (forwarded ?? null) : null,
    },
    nextUrl: { protocol },
  });

  it("is true for a direct https request", () => {
    expect(isHttpsRequest(request("https:"))).toBe(true);
  });

  it("is false for a direct http request", () => {
    expect(isHttpsRequest(request("http:"))).toBe(false);
  });

  // Every deployment in deploy/ terminates TLS at a load balancer, so the pod
  // sees http: and this header is the only evidence the browser used TLS.
  it("is true behind a TLS-terminating load balancer", () => {
    expect(isHttpsRequest(request("http:", "https"))).toBe(true);
  });

  it("takes the client's own scheme from a proxy chain", () => {
    expect(isHttpsRequest(request("http:", "https, http"))).toBe(true);
    expect(isHttpsRequest(request("http:", "http, https"))).toBe(false);
  });

  it("tolerates case and padding", () => {
    expect(isHttpsRequest(request("http:", "  HTTPS "))).toBe(true);
  });

  // The header is client-supplied wherever no proxy overwrites it. In this
  // direction that is harmless: it can only add Secure, never remove it from a
  // cookie minted over a connection that really was TLS.
  it("cannot be used to strip Secure from a genuine https request", () => {
    expect(isHttpsRequest(request("https:", "http"))).toBe(true);
  });
});
