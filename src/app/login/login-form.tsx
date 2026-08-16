"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const noSubscription = () => () => {};

/**
 * The console-authored explanations for a failed sign-in. The callback never
 * reflects the provider's own text — see `src/lib/identity/routes.ts` — so this
 * map is the whole vocabulary, and an unrecognized code gets the generic line
 * rather than being rendered.
 */
const GENERIC_SSO_ERROR = "Sign-in could not be completed.";

// A Map rather than an object literal, because the key comes from the query
// string: `SSO_ERRORS["constructor"]` on a plain object resolves to an
// inherited *function*, which `??` does not replace and React refuses to
// render — so `?sso_error=constructor` would have shown an empty alert instead
// of the generic line (found in review, PR #94). A Map has no prototype chain
// to walk into.
const SSO_ERRORS = new Map<string, string>([
  [
    "provider_unavailable",
    "The identity provider could not be reached. Check the console's identity configuration.",
  ],
  ["provider_refused", "The identity provider refused the sign-in."],
  ["state_mismatch", "That sign-in attempt expired. Try again."],
  ["session_failed", GENERIC_SSO_ERROR],
]);

export function LoginForm({
  sso,
  password,
  ssoError,
  returnTo,
}: {
  sso: boolean;
  password: boolean;
  ssoError?: string;
  /** Where the operator was when their session ended. Already sanitized server-side. */
  returnTo?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Whether the *value* was checked and rejected, as opposed to the request
  // having failed. Only a 401 is a verdict (`api/login/route.ts`); an
  // unreachable console is not one, and `aria-invalid` must not claim
  // otherwise about a password nothing has looked at.
  const [rejected, setRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumped by every submit and every keystroke, so a verdict that arrives late
  // cannot land on a value the operator has already replaced — the field stays
  // editable while a sign-in is in flight.
  const attempt = useRef(0);
  // Interactivity marker: before hydration a submit would fall back to the
  // browser's native handling; method="post" below keeps that fallback from
  // ever putting the password in the URL.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    const mine = (attempt.current += 1);
    setBusy(true);
    setError(null);
    setRejected(false);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: value }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      router.replace(returnTo ?? "/agents");
      return;
    }
    // A newer attempt, or a keystroke, has superseded this one.
    if (mine !== attempt.current) return;
    setError("Wrong password.");
    setRejected(response?.status === 401);
  }

  const ssoMessage = ssoError
    ? (SSO_ERRORS.get(ssoError) ?? GENERIC_SSO_ERROR)
    : null;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      data-sso={sso}
      data-sso-error={ssoError}
      data-return-to={returnTo}
    >
      <div className="w-80 space-y-4">
        <div>
          <h1 className="text-[22px] font-medium leading-7">Managed Agents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sso
              ? "Sign in with your organization account to continue."
              : "Enter the console password to continue."}
          </p>
        </div>

        {ssoMessage && (
          <p className="text-sm text-destructive" role="alert">
            {ssoMessage}
          </p>
        )}

        {sso && (
          // A plain link, not a fetch: the flow's first step is a 302 to the
          // identity provider, and only a top-level navigation can follow one.
          <a
            href={
              returnTo === undefined
                ? "/api/auth/login"
                : `/api/auth/login?return_to=${encodeURIComponent(returnTo)}`
            }
            data-testid="sso-sign-in"
            className={buttonVariants()}
          >
            Sign in with SSO
          </a>
        )}

        {password && (
          <form
            method="post"
            onSubmit={submit}
            data-hydrated={hydrated || undefined}
            className="space-y-4"
          >
            {sso && (
              <p className="text-xs text-muted-foreground">
                This deployment also keeps a shared console password. It admits
                you to the console; it does not authorize anything on the
                platform.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoFocus={!sso}
                // The rejection is a verdict on this one value, so it is the
                // field that carries it — not just a sentence beside it.
                // `aria-invalid` is already machine-readable, so this derived
                // state needs no extra `data-*` for the e2e pass to read. It
                // tracks `rejected`, not `error`: a console that could not be
                // reached still shows the message, but has judged nothing.
                aria-invalid={rejected}
                aria-describedby={error ? "password-error" : undefined}
                // Typing makes "Wrong password." stale; leaving it would keep
                // the field announced invalid while the operator fixes it.
                onChange={() => {
                  attempt.current += 1;
                  setError(null);
                  setRejected(false);
                }}
              />
            </div>
            {error && (
              // `role="alert"` as well as the description, because the submit
              // button holds focus when this appears: a description alone is
              // announced only once the field is reached again.
              <p
                id="password-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy}
              variant={sso ? "outline" : "default"}
            >
              Sign in
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
