import { afterEach, expect, it, vi } from "vitest";
import {
  nativeGet,
  nativeWrite,
  passwordProblem,
  readAccount,
  setupSession,
} from "./native";
import { PlatformError } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.consoleAuth;
});
it("probe: passwords use UTF-8 bytes, not JavaScript length, and reject NUL", () => {
  expect(passwordProblem("密码密码")).toBeUndefined(); // four characters, twelve bytes
  expect(passwordProblem("a".repeat(12))).toBeUndefined();
  expect(passwordProblem("a".repeat(1024))).toBeUndefined();
  for (const value of [
    "a".repeat(11),
    "密".repeat(342),
    "a".repeat(1025),
    "a".repeat(12) + "\0",
  ])
    expect(passwordProblem(value)).toContain("UTF-8 bytes");
});
it("native lists encode repeated filters without converting pagination envelopes", async () => {
  const page = { data: [], has_more: false, first_id: null, last_id: null };
  const fetcher = vi.fn(async () => Response.json(page));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await nativeGet("/api/console/organizations/default/members", {
      "roles[]": ["user", "admin"],
      email: "a+b@example.test",
    }),
  ).toEqual(page);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/console/organizations/default/members?roles%5B%5D=user&roles%5B%5D=admin&email=a%2Bb%40example.test",
    { cache: "no-store" },
  );
});
it("probe: unsafe native writes fail before sending a body when session metadata lacks CSRF", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  const fetcher = vi.fn(async () => Response.json({ signed_in: true }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    nativeWrite("/api/console/organizations/default/members", {
      password: "transient-synthetic-password",
    }),
  ).rejects.toThrow("no CSRF token");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith("/api/auth/session", {
    cache: "no-store",
  });
});
it("optional setup session ignores only an expected missing session, not a platform outage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(null, {
          status: 401,
          headers: { "x-platform-signed-out": "1" },
        }),
    ),
  );
  expect(await setupSession()).toBeNull();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  await expect(setupSession()).rejects.toBeInstanceOf(PlatformError);
});
it("legacy absent identity is optional, but native session 404 is a configuration failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  expect(await readAccount()).toBeNull();
  document.documentElement.dataset.consoleAuth = "platform";
  await expect(readAccount()).rejects.toBeInstanceOf(PlatformError);
});
