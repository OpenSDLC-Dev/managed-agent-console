// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { GET as health } from "@/app/api/health/route";
import { POST as password } from "@/app/api/login/route";
import { GET as session } from "@/app/api/auth/session/route";
import { GET as start } from "@/app/api/auth/login/route";
import { GET as callback } from "@/app/api/auth/callback/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { forward } from "@/lib/platform-proxy";
vi.mock("server-only", () => ({}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("probe: native console requires no legacy credentials and deep health never spends a leftover key", async () => {
  vi.stubEnv("CONSOLE_AUTH_MODE", "platform");
  vi.stubEnv("IDENTITY_MODE", "password");
  vi.stubEnv("PLATFORM_API_KEY", undefined);
  vi.stubEnv("PLATFORM_BASE_URL", undefined);
  vi.stubEnv("CONSOLE_PASSWORD", undefined);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const shallow = await health(new NextRequest("http://localhost/api/health"));
  expect(shallow.status).toBe(200);
  expect(await shallow.json()).toMatchObject({
    configured: true,
    identity: { mode: "platform" },
  });
  vi.stubEnv("PLATFORM_API_KEY", "leftover");
  vi.stubEnv("CONSOLE_PASSWORD", "leftover");
  const deep = await health(
    new NextRequest("http://localhost/api/health?deep=1"),
  );
  expect(deep.status).toBe(503);
  expect(await deep.json()).toMatchObject({ platform: { checked: false } });
  expect(fetcher).not.toHaveBeenCalled();
});
it("probe: native bypasses the shared-password middleware but all local credentials and BFFs fail closed", async () => {
  vi.stubEnv("CONSOLE_AUTH_MODE", "platform");
  vi.stubEnv("CONSOLE_PASSWORD", "leftover");
  vi.stubEnv("PLATFORM_API_KEY", "leftover");
  vi.stubEnv("IDENTITY_MODE", "oidc");
  const request = new NextRequest("http://localhost/members");
  expect((await proxy(request)).headers.get("x-middleware-next")).toBe("1");
  vi.stubEnv("PLATFORM_BASE_URL", "http://platform.invalid");
  const fetcher = vi.fn(async () => Response.json({ data: [] }));
  vi.stubGlobal("fetch", fetcher);
  for (const handler of [password, session, start, callback, logout]) {
    const response = await handler(
      new NextRequest("http://localhost/api/auth/login"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.has("set-cookie")).toBe(false);
  }
  const response = await forward(
    new NextRequest("http://localhost/api/platform/v1/agents"),
    ["v1", "agents"],
  );
  expect(response.status).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
});
