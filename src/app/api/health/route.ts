import { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { consolePassword, platformApiKey, platformBaseUrl } from "@/lib/env";
import {
  type IdentityConfig,
  IdentityConfigError,
  identityConfig,
} from "@/lib/identity/config";
import { consoleAuthModeFrom, sendsUserToken } from "@/lib/identity/mode";

/**
 * Readiness probe, and the gate a deployment is allowed to pass.
 *
 * Configuration errors are otherwise lazy: a container started without
 * PLATFORM_BASE_URL comes up, serves /login, and only fails once somebody uses
 * it — so a rollout goes green on a revision that cannot work. This route makes
 * that failure eager, and machine-readable.
 *
 * Two depths, because a probe and a deploy gate want different things — and,
 * being different callers, they are allowed different things:
 *
 * - `GET /api/health` checks configuration only and touches the network not at
 *   all. **Anonymous, necessarily:** a kubelet cannot hold a session, and a
 *   readiness probe that read the login gate's 401 as an unhealthy container
 *   would keep the pod out of service forever. Cheap enough for a short probe
 *   period, and it reports nothing an anonymous caller may not know.
 * - `GET /api/health?deep=1` also reaches the platform with the management key.
 *   That is the assertion a deploy should make. It is deliberately NOT the
 *   probe's default: a readiness probe that failed whenever the platform is
 *   unhealthy would take the console down with it, and a console that can still
 *   render its own error is worth more than one Kubernetes has removed from
 *   service. And it is **gated whenever this console is** — it is a lever, not a
 *   report: an anonymous caller who can repeat it makes this process spend the
 *   management key against the control plane on demand. With CONSOLE_PASSWORD
 *   unset there is no gate to hold a session against, so the deep check is open
 *   exactly as every other route is.
 *
 * That last clause is the production posture of the deployment in deploy/k8s/,
 * on purpose: authentication there is IAP at the load balancer, so nothing
 * reaches this process unauthenticated from the internet, and the pod's port is
 * closed to the rest of the cluster by a NetworkPolicy. Note what that does and
 * does not say — IAP refuses *anonymous* callers, not authorized ones, so a
 * signed-in member of the Workspace can still reach `?deep=1` from a browser.
 * That is not an escalation: the same person can drive every page of the
 * console, and every page spends the same key. What the deployment removes is
 * the anonymous internet and the rest of the cluster, not the operator.
 *
 * The deploy gate runs the deep check from inside the pod over loopback
 * (`kubectl exec … -- node`) because the CD job holds no Google identity IAP
 * would accept — not because nothing else can reach the route. See
 * deploy/k8s/README.md.
 *
 * The body names environment variables (already public, in `.env.example`),
 * reports the platform's own status code, and names which identity mode this
 * process is in. It carries no URL, no key, no issuer and no client id, because
 * the shallow depth answers anyone.
 */

// A probe must observe this process now, never a value cached at build time.
export const dynamic = "force-dynamic";

/** Bounds the deep check so a hung platform fails the gate instead of the job. */
const DEEP_TIMEOUT_MS = 5000;

export async function GET(request: NextRequest): Promise<Response> {
  const password = consolePassword();
  // Reported, not required: the gate is optional by design (an operator may
  // front the console with their own auth). The pipeline that publishes this
  // console on a public IP asserts on this field itself — see
  // deploy/k8s/README.md — and refuses the deployment when it is false.
  const loginGate = password !== undefined;
  const deep = request.nextUrl.searchParams.has("deep");

  // Before anything is computed, and before the configuration report: a gated
  // console answers the deep depth to sessions only. Same envelope the login
  // gate itself returns (src/proxy.ts), since it is the same refusal.
  if (deep && password !== undefined) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!(await isValidSession(token, password))) {
      return Response.json(
        {
          type: "error",
          error: {
            type: "authentication_error",
            message: "console login required",
          },
        },
        { status: 401 },
      );
    }
  }

  const missing: string[] = [];
  const invalid: string[] = [];
  let baseUrl = "";
  try {
    baseUrl = platformBaseUrl();
  } catch {
    missing.push("PLATFORM_BASE_URL");
  }

  // A broken identity configuration fails closed. There is no falling back to
  // the management key, so a console that cannot parse its own identity config
  // cannot authorize anybody, and a probe must say so rather than report Ready.
  let identity: IdentityConfig | undefined;
  try {
    identity = identityConfig();
  } catch (error) {
    if (!(error instanceof IdentityConfigError)) throw error;
    missing.push(...error.missing);
    invalid.push(...error.invalid);
  }

  let apiKey: string | undefined;
  try {
    apiKey = platformApiKey();
  } catch {
    apiKey = undefined;
  }

  // Whether PLATFORM_API_KEY is required for this revision to serve is exactly
  // the question of whether browser-initiated calls still carry it. In identity
  // mode they carry the operator's own token, and the key is only the deep
  // check's dedicated service credential — the one console→platform call that
  // can never act as a user, since CD runs it with no user in sight — so
  // requiring it would make such a rollout permanently NotReady over a
  // credential it does not use. With identity off it is what *every* page
  // spends: `forward()` resolves it unconditionally and 500s the request
  // without it (src/lib/platform-proxy.ts), so reporting Ready would admit a
  // pod that answers nothing but errors (found in review, PR #92).
  const actsAsUser =
    identity !== undefined &&
    sendsUserToken(consoleAuthModeFrom(identity, password));
  if (apiKey === undefined && !actsAsUser) missing.push("PLATFORM_API_KEY");

  if (missing.length > 0 || invalid.length > 0) {
    return Response.json(
      {
        status: "error",
        configured: false,
        missing,
        invalid,
        login_gate: loginGate,
      },
      { status: 503 },
    );
  }

  // Reported so an operator can tell which of plan 08 D3's four configurations
  // this process is in. The mode alone: no issuer, no client id, no URL — the
  // shallow depth answers anyone.
  const identityMode = identity?.mode ?? "disabled";

  if (!deep) {
    return Response.json(
      {
        status: "ok",
        configured: true,
        login_gate: loginGate,
        identity: { mode: identityMode },
      },
      { status: 200 },
    );
  }

  // Reachable only in identity mode — with identity off, a missing key already
  // answered 503 above. The deep depth is a deploy gate, and a gate that cannot
  // run its check must not go green. Distinguished from "checked and failed" by
  // `checked`, because "no service credential" and "the platform is down" call
  // for opposite fixes.
  if (apiKey === undefined) {
    return Response.json(
      {
        status: "degraded",
        configured: true,
        missing: ["PLATFORM_API_KEY"],
        login_gate: loginGate,
        identity: { mode: identityMode },
        platform: { checked: false, reachable: false },
      },
      { status: 503 },
    );
  }

  let platformStatus: number | undefined;
  let reachable = false;
  try {
    const response = await fetch(`${baseUrl}/v1/agents?limit=1`, {
      headers: { "x-api-key": apiKey, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(DEEP_TIMEOUT_MS),
    });
    platformStatus = response.status;
    // A rejected key answers 401 and a wrong base URL answers 404 — both are
    // reachable and both are misconfigurations, so the gate turns on `ok`, not
    // on having got an answer.
    reachable = response.ok;
    // The body is never read, but an undrained response holds the connection.
    await response.arrayBuffer().catch(() => {});
  } catch {
    // Timeout, DNS failure, connection refused — indistinguishable to a gate,
    // and all of them mean the same thing: this revision cannot serve.
    reachable = false;
  }

  return Response.json(
    {
      status: reachable ? "ok" : "error",
      configured: true,
      login_gate: loginGate,
      identity: { mode: identityMode },
      platform: { checked: true, reachable, status: platformStatus },
    },
    { status: reachable ? 200 : 503 },
  );
}
