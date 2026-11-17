// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());
it("reports process-owned native readiness", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await GET(new NextRequest("http://console.test/api/health"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    configured: true,
    login_gate: false,
    identity: { mode: "platform" },
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it("probe: deep readiness refuses to spend an application credential", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await GET(
    new NextRequest("http://console.test/api/health?deep=1"),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    status: "degraded",
    platform: { checked: false, reachable: false },
  });
  expect(fetcher).not.toHaveBeenCalled();
});
