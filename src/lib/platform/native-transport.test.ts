import { afterEach, expect, it, vi } from "vitest";
import {
  platformGet,
  platformPost,
  platformPostForm,
  platformDelete,
  platformGetText,
  consoleKeysPost,
  consolePost,
  consolePostNoContent,
  gatewayGet,
  gatewayPost,
  gatewayDelete,
} from "./http";
import { isSignedOut } from "@/lib/identity/signed-out";

afterEach(() => {
  delete document.documentElement.dataset.consoleAuth;
  vi.unstubAllGlobals();
});
it("selects the native private resource proxy at runtime without a build-time public env", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [] }));
  vi.stubGlobal("fetch", fetcher);
  await platformGet("v1/agents", { limit: 1 });
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    "/api/organizations/default/proxy/v1/agents?limit=1",
  );
  delete document.documentElement.dataset.consoleAuth;
  await platformGet("v1/agents");
  expect(fetcher.mock.calls[1]?.[0]).toBe("/api/platform/v1/agents");
});
it("probe: adds header-only CSRF to every native unsafe family including multipart and bodiless revocation", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/auth/session"
      ? Response.json({ csrf_token: "csrf-test", signed_in: true })
      : url.includes("revoke")
        ? new Response(null, { status: 204 })
        : Response.json({}),
  );
  vi.stubGlobal("fetch", fetcher);
  const form = new FormData();
  form.set("file", new Blob(["bytes"]), "file.txt");
  await platformPost("v1/agents", {});
  await platformPostForm("v1/files", form);
  await platformDelete("v1/agents/agent_a");
  await consoleKeysPost("organizations/default/api_keys", {});
  await consolePost("organizations/default/api_keys", {});
  await consolePostNoContent("organizations/default/api_keys/key_a/revoke");
  await gatewayPost("aliases", {});
  await gatewayDelete("aliases/a?b");
  const writes = fetcher.mock.calls.filter(([u]) => u !== "/api/auth/session");
  expect(writes).toHaveLength(8);
  for (const [url, init] of writes as unknown as [string, RequestInit][]) {
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("csrf-test");
    expect(url).not.toContain("csrf");
    expect(new Headers(init.headers).has("authorization")).toBe(false);
    expect(new Headers(init.headers).has("x-api-key")).toBe(false);
  }
  const upload = writes.find(([url]) =>
    url.includes("v1/files"),
  ) as unknown as [string, RequestInit];
  expect(new Headers(upload[1].headers).has("content-type")).toBe(false);
  expect(upload[1].body).toBe(form);
  expect(writes.at(-1)?.[0]).toBe("/admin/v1/aliases/a%3Fb");
});
it("selects native text and gateway reads", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({}));
  vi.stubGlobal("fetch", fetcher);
  await platformGetText("v1/files/file_a/content");
  await gatewayGet("providers");
  expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
    "/api/organizations/default/proxy/v1/files/file_a/content",
    "/admin/v1/providers",
  ]);
});
it("probe: recognizes platform session markers, but not role-only 403", () => {
  expect(
    isSignedOut(
      new Response(null, {
        status: 403,
        headers: { "x-platform-signed-out": "1" },
      }),
    ),
  ).toBe(true);
  expect(isSignedOut(new Response(null, { status: 403 }))).toBe(false);
});
