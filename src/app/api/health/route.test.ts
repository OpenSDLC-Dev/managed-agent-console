// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, sessionTokenFor } from "@/lib/auth";
import { GET, dynamic } from "./route";

vi.mock("server-only", () => ({}));

// Distinctive values so the leak assertions below are substring searches over
// the real serialized body rather than a shape check that would pass on a
// body carrying the key under some other field name.
const BASE_URL = "http://platform.internal.svc.cluster.local:8080";
const API_KEY = "sk-mgmt-never-in-a-health-body";

const healthRequest = (query = "", cookie?: string) =>
  new NextRequest(
    `http://localhost:3000/api/health${query}`,
    cookie ? { headers: { cookie } } : undefined,
  );

const sessionCookieFor = async (password: string) =>
  `${SESSION_COOKIE}=${await sessionTokenFor(password)}`;

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PLATFORM_BASE_URL", BASE_URL);
  vi.stubEnv("PLATFORM_API_KEY", API_KEY);
  vi.stubEnv("CONSOLE_PASSWORD", undefined);
  vi.stubEnv("IDENTITY_MODE", undefined);
});

/** What every body reports when identity is off — the default in these tests. */
const NO_IDENTITY = { identity: { mode: "disabled" } };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  // A probe answered from the build-time render cache reports the health of a
  // process that no longer exists, which is exactly the failure this route was
  // added to catch.
  it("is rendered per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("names every missing variable when nothing is configured", async () => {
    vi.stubEnv("PLATFORM_BASE_URL", undefined);
    vi.stubEnv("PLATFORM_API_KEY", undefined);
    const response = await GET(healthRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      configured: false,
      missing: ["PLATFORM_BASE_URL", "PLATFORM_API_KEY"],
      invalid: [],
      login_gate: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // With identity off, every browser-initiated call spends this key —
  // `forward()` resolves it unconditionally and 500s without it — so a Ready
  // pod would answer nothing but errors. The key is optional for readiness only
  // where it is genuinely unused (found in review, PR #92).
  it("still requires PLATFORM_API_KEY while identity is off", async () => {
    vi.stubEnv("PLATFORM_API_KEY", undefined);
    const response = await GET(healthRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      configured: false,
      missing: ["PLATFORM_API_KEY"],
    });
  });

  it("fails the misconfigured check even when asked for the deep one", async () => {
    vi.stubEnv("PLATFORM_BASE_URL", undefined);
    const response = await GET(healthRequest("?deep=1"));
    expect(response.status).toBe(503);
    // Nothing to reach: a base URL that is not set cannot be fetched, and a
    // deep check that swallowed that would report "unreachable" for a
    // configuration error the body already names.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers the shallow check without touching the network", async () => {
    const response = await GET(healthRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      configured: true,
      login_gate: false,
      ...NO_IDENTITY,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the login gate as configured", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const response = await GET(healthRequest());
    expect(await response.json()).toMatchObject({ login_gate: true });
  });

  it("treats an empty CONSOLE_PASSWORD as no gate", async () => {
    // The pipeline that publishes the console asserts on this field, so an
    // empty string must read as the open console it is, not as a gate.
    vi.stubEnv("CONSOLE_PASSWORD", "");
    const response = await GET(healthRequest());
    expect(await response.json()).toMatchObject({ login_gate: false });
  });

  // On the deployment this route exists for, the console answers on a bare
  // public IP over plain HTTP. The shallow depth has to stay anonymous — a
  // kubelet holds no session — but the deep one spends the management key
  // against the control plane on the caller's say-so, so it answers sessions
  // only. The deploy gate calls it from inside the pod, where the container's
  // own CONSOLE_PASSWORD can log in.
  describe("on a gated console", () => {
    const PASSWORD = "hunter2";

    beforeEach(() => {
      vi.stubEnv("CONSOLE_PASSWORD", PASSWORD);
    });

    it("still answers the shallow check to an anonymous caller", async () => {
      const response = await GET(healthRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ok",
        configured: true,
        login_gate: true,
        ...NO_IDENTITY,
      });
    });

    it("refuses the deep check to a caller without a session", async () => {
      const response = await GET(healthRequest("?deep=1"));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        type: "error",
        error: {
          type: "authentication_error",
          message: "console login required",
        },
      });
      // The refusal is the point: an anonymous caller must not be able to make
      // this process talk to the platform at all, however often they ask.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses the deep check to a cookie minted under a previous password", async () => {
      const response = await GET(
        healthRequest("?deep=1", await sessionCookieFor("old-password")),
      );
      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("answers the deep check to a caller carrying a valid session", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      const response = await GET(
        healthRequest("?deep=1", await sessionCookieFor(PASSWORD)),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        login_gate: true,
        platform: { reachable: true, status: 200 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("refuses before reporting configuration, so an anonymous caller learns nothing extra", async () => {
      vi.stubEnv("PLATFORM_BASE_URL", undefined);
      const response = await GET(healthRequest("?deep=1"));
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain("PLATFORM_BASE_URL");
    });
  });

  it("passes the deep check when the platform accepts the key", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [], has_more: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const response = await GET(healthRequest("?deep=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      configured: true,
      login_gate: false,
      ...NO_IDENTITY,
      platform: { checked: true, reachable: true, status: 200 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${BASE_URL}/v1/agents?limit=1`);
    expect(new Headers(init?.headers).get("x-api-key")).toBe(API_KEY);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails the deep check when the platform rejects the key", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );
    const response = await GET(healthRequest("?deep=1"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      configured: true,
      login_gate: false,
      ...NO_IDENTITY,
      // Reached, and still unusable — the distinction a rollout needs, since a
      // 401 means the key is wrong rather than the platform absent.
      platform: { checked: true, reachable: false, status: 401 },
    });
  });

  it("fails the deep check when the platform cannot be reached at all", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const response = await GET(healthRequest("?deep=1"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      platform: { reachable: boolean; status?: number };
    };
    expect(body.platform.reachable).toBe(false);
    // No answer means no status to report: a number here would be invented.
    expect(body.platform.status).toBeUndefined();
  });

  it("fails the deep check when the platform hangs past the timeout", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("signal timed out", "TimeoutError"),
    );
    const response = await GET(healthRequest("?deep=1"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      platform: { reachable: false },
    });
  });

  it("takes any `deep` value, since a probe URL is written by hand", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await GET(healthRequest("?deep"));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Identity is the one thing about this console that feature detection cannot
  // discover — the platform makes SSO-on indistinguishable from SSO-off to an
  // unauthenticated caller — so the console's own configuration has to say it.
  describe("identity mode", () => {
    const ISSUER = "https://idp.internal.example/realms/console";
    const CLIENT_ID = "console-client-id-never-in-a-health-body";
    const CLIENT_SECRET = "console-client-secret-never-in-a-health-body";

    const configureOidc = () => {
      vi.stubEnv("IDENTITY_MODE", "oidc");
      vi.stubEnv("IDENTITY_OIDC_ISSUER", ISSUER);
      vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", CLIENT_ID);
      vi.stubEnv("IDENTITY_OIDC_CLIENT_SECRET", CLIENT_SECRET);
    };

    it("reports the mode a configured console is in", async () => {
      configureOidc();
      const response = await GET(healthRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ok",
        configured: true,
        login_gate: false,
        identity: { mode: "oidc" },
      });
    });

    // Fail closed. A console whose identity configuration is broken cannot
    // authorize anybody — there is no falling back to the management key — so
    // reporting Ready would put a revision into service that can serve nobody.
    it("is not ready when the identity configuration is broken", async () => {
      vi.stubEnv("IDENTITY_MODE", "oidc");
      const response = await GET(healthRequest());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        status: "error",
        configured: false,
        missing: ["IDENTITY_OIDC_ISSUER", "IDENTITY_OIDC_CLIENT_ID"],
        invalid: [],
        login_gate: false,
      });
    });

    // The whole point of making the key optional: an identity-mode deployment
    // that removed it from the pod would otherwise fail readiness forever, in a
    // way that reads as an infrastructure fault rather than a console working
    // exactly as designed. In this mode browser calls carry the operator's own
    // token, so the key really is unused by everything except the deep check.
    it("is ready without PLATFORM_API_KEY once identity is configured", async () => {
      configureOidc();
      vi.stubEnv("PLATFORM_API_KEY", undefined);
      const response = await GET(healthRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        status: "ok",
        configured: true,
        identity: { mode: "oidc" },
      });
    });

    it("cannot run the deep check without PLATFORM_API_KEY, and says which", async () => {
      configureOidc();
      vi.stubEnv("PLATFORM_API_KEY", undefined);
      const response = await GET(healthRequest("?deep=1"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        status: "degraded",
        configured: true,
        missing: ["PLATFORM_API_KEY"],
        login_gate: false,
        identity: { mode: "oidc" },
        // Not "the platform is unreachable" — nothing was asked. The two call
        // for opposite fixes, so a gate must tell them apart.
        platform: { checked: false, reachable: false },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("separates a malformed value from an absent one", async () => {
      vi.stubEnv("IDENTITY_MODE", "oidc");
      vi.stubEnv("IDENTITY_OIDC_ISSUER", "http://idp.example.com");
      vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", CLIENT_ID);
      const response = await GET(healthRequest());
      expect(await response.json()).toMatchObject({
        missing: [],
        invalid: ["IDENTITY_OIDC_ISSUER"],
      });
    });

    it("probe: names the identity variables but never their values", async () => {
      vi.stubEnv("IDENTITY_MODE", "oidc");
      vi.stubEnv("IDENTITY_OIDC_ISSUER", `${ISSUER}?tenant=leak`);
      vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", CLIENT_ID);
      vi.stubEnv("IDENTITY_OIDC_CLIENT_SECRET", CLIENT_SECRET);
      for (const query of ["", "?deep=1"]) {
        const text = await GET(healthRequest(query)).then((r) => r.text());
        expect(text).toContain("IDENTITY_OIDC_ISSUER");
        expect(text).not.toContain(ISSUER);
        expect(text).not.toContain(CLIENT_ID);
        expect(text).not.toContain(CLIENT_SECRET);
        expect(text).not.toContain("idp.internal");
      }
    });

    it("probe: a well-configured console still leaks neither issuer nor client id", async () => {
      configureOidc();
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      for (const query of ["", "?deep=1"]) {
        const text = await GET(healthRequest(query)).then((r) => r.text());
        expect(text).not.toContain(ISSUER);
        expect(text).not.toContain(CLIENT_ID);
        expect(text).not.toContain(CLIENT_SECRET);
      }
    });
  });

  // The route is unauthenticated by construction — the Kubernetes probe and the
  // deploy gate both call it with no session, and the deploy gate prints the
  // body into a public workflow log on failure. Everything it says must be safe
  // for an anonymous caller.
  it("probe: never serializes the key or the base URL, however the platform answers", async () => {
    const cases: Array<() => void> = [
      () =>
        fetchMock.mockResolvedValue(
          new Response(
            // A hostile or merely broken upstream echoing the credential back.
            JSON.stringify({ echoed_key: API_KEY, base: BASE_URL }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      () =>
        fetchMock.mockResolvedValue(
          new Response(`<html>${API_KEY} at ${BASE_URL}</html>`, {
            status: 502,
            headers: { "content-type": "text/html" },
          }),
        ),
      () => fetchMock.mockRejectedValue(new Error(`connect ${BASE_URL}`)),
      () =>
        fetchMock.mockRejectedValue(
          // A stack that carries the request headers, as some clients' do.
          new Error(`request failed with x-api-key: ${API_KEY}`),
        ),
    ];

    for (const arrange of cases) {
      fetchMock.mockReset();
      arrange();
      for (const query of ["", "?deep=1"]) {
        const text = await GET(healthRequest(query)).then((r) => r.text());
        expect(text).not.toContain(API_KEY);
        expect(text).not.toContain(BASE_URL);
        expect(text).not.toContain("platform.internal");
      }
    }
  });

  it("probe: drains the platform's body instead of leaving the connection held", async () => {
    // The gate runs on every rollout and the probe runs forever; a response
    // whose body is never consumed keeps a socket per call, and the symptom
    // (a control plane out of connections) appears nowhere near this route.
    const upstream = new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    fetchMock.mockResolvedValue(upstream);
    await GET(healthRequest("?deep=1"));
    expect(upstream.bodyUsed).toBe(true);
  });

  it("probe: still answers when that body cannot be drained", async () => {
    // Draining is housekeeping, not part of the verdict. A body that errors
    // mid-stream must not turn an accepted key into a failed rollout.
    const upstream = new Response("{}", { status: 200 });
    vi.spyOn(upstream, "arrayBuffer").mockRejectedValue(
      new Error("stream reset"),
    );
    fetchMock.mockResolvedValue(upstream);
    const response = await GET(healthRequest("?deep=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      platform: { reachable: true, status: 200 },
    });
  });
});
