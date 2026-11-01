import { consoleAuthMode } from "@/lib/identity/mode";
import { DEFAULT_RETURN_TO, safeReturnTo } from "@/lib/identity/rp";
import { NativeAuth } from "@/components/console/native-auth";
import { LoginForm } from "./login-form";

/**
 * The login page reads the deployment's local console auth mode server-side
 * (plan 08 D3). Native mode delegates platform login and config presentation to
 * NativeAuth. Legacy mode uses local RP and password-gate settings.
 * See docs/wire-divergences.md.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let sso = false;
  let password = true;
  let native = false;
  try {
    const mode = consoleAuthMode();
    native = mode.kind === "platform";
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

  if (native) return <NativeAuth />;

  const params = await searchParams;
  const reason = params["sso_error"];
  // The BFF sends a signed-out operator here with where they were. Sanitized on
  // the way in as well as inside `/api/auth/login`, because this value also
  // reaches the browser as an attribute of the page it arrived on.
  const raw = params["return_to"];
  const returnTo = safeReturnTo(typeof raw === "string" ? raw : undefined);
  return (
    <LoginForm
      sso={sso}
      password={password}
      ssoError={typeof reason === "string" ? reason : undefined}
      {...(returnTo === DEFAULT_RETURN_TO ? {} : { returnTo })}
    />
  );
}
