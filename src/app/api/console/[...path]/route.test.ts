// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDENTITY_COOKIE,
  getSession,
  putSession,
  resetIdentityStoreForTests,
} from "@/lib/identity/session";
import { SIGNED_OUT_HEADER } from "@/lib/identity/signed-out";
import { GET, POST } from "./route";

vi.mock("server-only", () => ({}));

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

const fetchMock = vi.fn<typeof fetch>();

const KEYS = "organizations/default/workspaces/default/api_keys";
const KEY = `${KEYS}/apikey_01`;

// An organization this console does not manage, spelled as the platform's
// foreign-organization branch reads one: a UUID (managed-agent-platform#820).
const FOREIGN_ORG = "8d3f6c2e-4b1a-4f6e-9c7d-2a5b8e1f0c3d";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PLATFORM_BASE_URL", "http://platform.local");
  vi.stubEnv("PLATFORM_API_KEY", "sk-mgmt-test");
  vi.stubEnv("IDENTITY_MODE", undefined);
  resetIdentityStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("management-key BFF passthrough", () => {
  it("forwards the listing and the item under the reference's own paths", async () => {
    fetchMock.mockResolvedValue(new Response("[]", { status: 200 }));
    expect(
      (
        await GET(
          new NextRequest(`http://localhost:3000/api/console/${KEYS}`),
          ctx(...KEYS.split("/")),
        )
      ).status,
    ).toBe(200);
    await POST(
      new NextRequest(`http://localhost:3000/api/console/${KEY}`, {
        method: "POST",
        body: JSON.stringify({ name: "renamed" }),
      }),
      ctx(...KEY.split("/")),
    );
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `http://platform.local/api/console/${KEYS}`,
      `http://platform.local/api/console/${KEY}`,
    ]);
  });

  it("marks a successful issuance no-store even when the platform did not", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ raw_key: "sk-map-api01-x" }), {
        status: 200,
      }),
    );
    const response = await POST(
      new NextRequest(`http://localhost:3000/api/console/${KEYS}`, {
        method: "POST",
        body: "{}",
      }),
      ctx(...KEYS.split("/")),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // The tenancy segments are pinned to the ones this console manages. The
  // platform answers a foreign organization UUID with a 401
  // (managed-agent-platform#820), which `forward` would read as the
  // operator's own token refused; the workspace is pinned with it, because
  // the console sends no other and has no business reaching one.
  it.each([
    [
      "a foreign organization UUID on the listing",
      "GET",
      ["organizations", FOREIGN_ORG, "workspaces", "default", "api_keys"],
    ],
    [
      "a foreign organization UUID on issuance",
      "POST",
      ["organizations", FOREIGN_ORG, "workspaces", "default", "api_keys"],
    ],
    [
      "a foreign organization UUID on update",
      "POST",
      [
        "organizations",
        FOREIGN_ORG,
        "workspaces",
        "default",
        "api_keys",
        "apikey_01",
      ],
    ],
    [
      "an organization other than default",
      "GET",
      ["organizations", "acme", "workspaces", "default", "api_keys"],
    ],
    [
      "a workspace other than default",
      "GET",
      ["organizations", "default", "workspaces", "wrkspc_01", "api_keys"],
    ],
    [
      "the update route without its workspace",
      "POST",
      ["organizations", "default", "api_keys", "apikey_01"],
    ],
    ["DELETE on the item", "DELETE", KEY.split("/")],
    ["a dot-dot key id", "POST", [...KEYS.split("/"), ".."]],
  ])(
    "refuses %s without contacting the platform",
    async (_label, method, path) => {
      const handler = method === "GET" ? GET : POST;
      const response = await handler(
        new NextRequest(`http://localhost:3000/api/console/${path.join("/")}`, {
          method,
        }),
        ctx(...path),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        type: "error",
        error: { type: "invalid_request_error" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

// See the sibling route's test of the same name: the identity cookie is
// `SameSite=Lax`, `forward` ends the session on any upstream 401, and a
// cross-site link naming a foreign organization must not reach the platform.
describe("identity mode", () => {
  it("probe: a foreign organization is refused without ending the operator's session", async () => {
    vi.stubEnv("IDENTITY_MODE", "oidc");
    vi.stubEnv("IDENTITY_OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", "console-client");
    putSession("sid", {
      idToken: "id-token",
      expiresAt: Date.now() + 60_000,
      subject: "user-1",
    });
    fetchMock.mockResolvedValue(
      new Response('{"type":"error"}', { status: 401 }),
    );
    const path = [
      "organizations",
      FOREIGN_ORG,
      "workspaces",
      "default",
      "api_keys",
    ];

    const refused = await GET(
      new NextRequest(`http://localhost:3000/api/console/${path.join("/")}`, {
        headers: { cookie: `${IDENTITY_COOKIE}=sid` },
      }),
      ctx(...path),
    );

    expect(refused.status).toBe(404);
    expect(refused.headers.get(SIGNED_OUT_HEADER)).toBeNull();
    expect(refused.headers.get("set-cookie")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSession("sid", Date.now())).toBeDefined();
  });
});
