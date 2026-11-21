// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { server, resetStore, API_KEY } from "./server.mjs";

let origin: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No mock port");
  origin = `http://127.0.0.1:${address.port}`;
});
beforeEach(resetStore);
afterAll(async () => {
  resetStore();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function signIn() {
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
  return { cookie, session };
}

it("uses a native cookie and CSRF token without forwarding a management credential", async () => {
  expect(await (await fetch(`${origin}/api/auth/config`)).json()).toEqual({
    mode: "password",
    native_login: true,
  });
  const privatePath = `${origin}/api/organizations/default/proxy/v1/agents`;
  expect(
    (await fetch(privatePath, { headers: { "x-api-key": API_KEY } })).status,
  ).toBe(401);
  const { cookie, session } = await signIn();
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

it("revokes the public fixture key when its service account is archived and keeps the administrator signed in", async () => {
  const { cookie, session } = await signIn();
  const headers = {
    cookie,
    origin,
    "x-csrf-token": session.csrf_token,
    "content-type": "application/json",
  };
  const publicAgents = `${origin}/v1/agents`;
  const org = `${origin}/api/console/organizations/default`;
  const keysPath = `${org}/workspaces/default/api_keys`;
  const list = await fetch(keysPath, { headers: { cookie } });
  const keys: {
    id: string;
    principal: { service_account_id?: string } | null;
  }[] = await list.json();
  const keyId = "apikey_ci01";
  const account = keys.find((row) => row.id === keyId)?.principal
    ?.service_account_id;
  expect(account).toBeTruthy();
  const keyHeaders = { "x-api-key": API_KEY };
  expect((await fetch(publicAgents, { headers: keyHeaders })).status).toBe(200);
  for (const [status, expected] of [
    ["inactive", 401],
    ["active", 200],
  ] as const) {
    const change = await fetch(`${keysPath}/${keyId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status }),
    });
    expect(change.status).toBe(200);
    expect((await fetch(publicAgents, { headers: keyHeaders })).status).toBe(
      expected,
    );
  }
  expect(
    (
      await fetch(`${org}/service_accounts/${account}/archive`, {
        method: "POST",
        headers,
      })
    ).status,
  ).toBe(200);
  expect((await fetch(publicAgents, { headers: keyHeaders })).status).toBe(401);
  expect(
    (
      await fetch(`${origin}/api/organizations/default/proxy/v1/agents`, {
        headers: { cookie },
      })
    ).status,
  ).toBe(200);
});
