import { consoleAuthMode } from "@/lib/identity/mode";
import { LoginForm } from "./login-form";

/**
 * The login page is a server component only so it can read which gate this
 * deployment runs — plan 08 D3. That fact comes from configuration and cannot
 * come from anywhere else: the platform makes SSO-on indistinguishable from
 * SSO-off to an unauthenticated caller, and this page's caller is by definition
 * unauthenticated (see docs/wire-divergences.md).
 */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let sso = false;
  let password = true;
  try {
    const mode = consoleAuthMode();
    sso = mode.kind === "sso";
    // With both configured, the password gate is deployment protection in
    // front of this page and SSO is the thing that authorizes anything — so
    // both controls are offered, rather than one silently doing nothing.
    password = mode.kind !== "sso" || mode.passwordGate;
  } catch {
    // A broken identity configuration already makes `/api/health` answer 503,
    // so a deployment in this state is NotReady rather than serving. Falling
    // back to the password form keeps the page renderable for whoever is
    // looking at it locally instead of turning a config error into a 500.
    sso = false;
    password = true;
  }

  const reason = (await searchParams)["sso_error"];
  return (
    <LoginForm
      sso={sso}
      password={password}
      ssoError={typeof reason === "string" ? reason : undefined}
    />
  );
}
