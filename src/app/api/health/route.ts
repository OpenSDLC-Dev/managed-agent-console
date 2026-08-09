import { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { consolePassword, platformApiKey, platformBaseUrl } from "@/lib/env";

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
 * closed to the rest of the cluster by a NetworkPolicy. The deploy gate runs the
 * deep check from inside the pod over loopback (`kubectl exec … -- node`) —
 * which is now the only way to run it, since from outside it is IAP's to refuse.
 * See deploy/k8s/README.md.
 *
 * The body names environment variables (already public, in `.env.example`) and
 * reports the platform's own status code. It carries no URL and no key, because
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
  let baseUrl = "";
  let apiKey = "";
  try {
    baseUrl = platformBaseUrl();
  } catch {
    missing.push("PLATFORM_BASE_URL");
  }
  try {
    apiKey = platformApiKey();
  } catch {
    missing.push("PLATFORM_API_KEY");
  }

  if (missing.length > 0) {
    return Response.json(
      { status: "error", configured: false, missing, login_gate: loginGate },
      { status: 503 },
    );
  }

  if (!deep) {
    return Response.json(
      { status: "ok", configured: true, login_gate: loginGate },
      { status: 200 },
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
      platform: { reachable, status: platformStatus },
    },
    { status: reachable ? 200 : 503 },
  );
}
