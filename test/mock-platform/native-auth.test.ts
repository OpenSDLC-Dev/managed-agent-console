// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { server, resetStore, API_KEY } from "./server.mjs";

let origin: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No mock port");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  resetStore();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("uses a native cookie and CSRF token without forwarding a management credential", async () => {
  expect(await (await fetch(`${origin}/api/auth/config`)).json()).toEqual({
    mode: "password",
    native_login: true,
  });
  const privatePath = `${origin}/api/organizations/default/proxy/v1/agents`;
  expect(
    (await fetch(privatePath, { headers: { "x-api-key": API_KEY } })).status,
  ).toBe(401);
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ login_name: "operator", password: "test-password" }),
  });
  expect(login.status).toBe(200);
  const setCookie = login.headers.get("set-cookie")!;
  expect(setCookie).toContain("HttpOnly");
  const cookie = setCookie.split(";")[0];
  const session = await (
    await fetch(`${origin}/api/auth/session`, { headers: { cookie } })
  ).json();
  expect(session).toMatchObject({
    signed_in: true,
    role: "admin",
    login_name: "operator",
  });
  expect((await fetch(privatePath, { headers: { cookie } })).status).toBe(200);
  const encodedSlash = await fetch(`${privatePath}/agent_id%2Fversions`, {
    headers: { cookie },
  });
  expect(encodedSlash.status).toBe(401);
  expect(encodedSlash.headers.get("x-platform-signed-out")).toBeNull();
  expect(
    (await fetch(`${origin}/v1/agents`, { headers: { cookie } })).status,
  ).toBe(401);
  const write = {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: "{}",
  };
  expect((await fetch(`${origin}/api/auth/logout`, write)).status).toBe(403);
  expect(
    (
      await fetch(`${origin}/api/auth/logout`, {
        ...write,
        headers: { ...write.headers, "x-csrf-token": session.csrf_token },
      })
    ).status,
  ).toBe(200);
  const revoked = await fetch(privatePath, { headers: { cookie } });
  expect(revoked.status).toBe(401);
  expect(revoked.headers.get("x-platform-signed-out")).toBe("1");
});
