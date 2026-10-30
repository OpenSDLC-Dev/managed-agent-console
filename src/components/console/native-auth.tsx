"use client";

import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AuthConfig,
  NativeSession,
  ORGANIZATION,
  enterConsole,
  nativeGet,
  nativeWrite,
  passwordProblem,
  setupSession,
} from "@/lib/platform/native";

export function NativeAuth({ setup = false }: { setup?: boolean }) {
  const [config, setConfig] = useState<AuthConfig>();
  const [session, setSession] = useState<NativeSession | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const config = await nativeGet<AuthConfig>("/api/auth/config");
        if (
          config.native_login !== true ||
          !["password", "oidc", "trusted_proxy"].includes(config.mode)
        )
          throw new Error(
            "Native browser login is not enabled. Check the application edge and platform configuration.",
          );
        const session =
          setup && config.mode !== "password" ? await setupSession() : null;
        if (active) {
          setConfig(config);
          setSession(session);
        }
      } catch (error) {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "The platform could not be reached.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [setup]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const body =
      config?.mode === "password"
        ? {
            ...(setup ? { code: String(values.get("code") ?? "") } : {}),
            login_name: String(values.get("login_name") ?? ""),
            password: String(values.get("password") ?? ""),
          }
        : setup
          ? { code: String(values.get("code") ?? "") }
          : {};
    const problem =
      "password" in body ? passwordProblem(body.password as string) : undefined;
    if (problem) {
      setError(problem);
      return;
    }
    // Clear secrets before waiting. Neither failed requests nor navigation keep
    // a password or setup code in rendered state or the Query mutation cache.
    form.reset();
    setBusy(true);
    setError(undefined);
    try {
      await nativeWrite(
        setup ? `${ORGANIZATION}/setup_code/redeem` : "/api/auth/login",
        body,
        "POST",
        !setup || config?.mode === "password",
      );
      enterConsole();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The platform could not be reached.",
      );
    } finally {
      setBusy(false);
    }
  }

  const password = config?.mode === "password";
  const canSetup = password || session !== null;
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-6 py-10"
      data-native-auth
      data-setup={setup}
    >
      <div className="w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-[22px] font-medium leading-7">
            {setup ? "Set up an administrator" : "Managed Agents"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {setup
              ? "Use a setup code from your platform operator. The platform checks whether this account is eligible."
              : "Sign in to your self-hosted platform."}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!config && !error && (
          <Skeleton className="h-24 w-full" aria-busy="true" />
        )}
        {config && (!setup || canSetup) && (
          <form
            method="post"
            onSubmit={submit}
            className="space-y-4"
            data-hydrated="true"
          >
            {setup && (
              <div className="space-y-1.5">
                <Label htmlFor="code">Setup code</Label>
                <Input
                  id="code"
                  name="code"
                  type="password"
                  required
                  autoComplete="off"
                />
              </div>
            )}
            {password && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="login_name">Login name</Label>
                  <Input
                    id="login_name"
                    name="login_name"
                    required
                    pattern={"[a-z0-9][a-z0-9._\\-]{0,63}"}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete={setup ? "new-password" : "current-password"}
                    aria-describedby={setup ? "password-policy" : undefined}
                  />
                  {setup && (
                    <p
                      id="password-policy"
                      className="text-xs text-muted-foreground"
                    >
                      12–1024 UTF-8 bytes. Non-ASCII characters can use more
                      than one byte.
                    </p>
                  )}
                </div>
              </>
            )}
            {!setup && config.mode === "oidc" ? (
              <a href="/api/auth/login" className={buttonVariants()}>
                Sign in with SSO
              </a>
            ) : (
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : setup
                    ? password
                      ? "Create administrator"
                      : "Redeem setup code"
                    : password
                      ? "Sign in"
                      : "Continue with organization account"}
              </Button>
            )}
          </form>
        )}
        {config && setup && !canSetup && (
          <p className="text-sm">
            Sign in before redeeming an organization setup code.{" "}
            <a href="/login" className="underline">
              Sign in
            </a>
          </p>
        )}
        <a
          href={setup ? "/login" : "/setup"}
          className="block text-sm text-muted-foreground underline"
        >
          {setup ? "Back to sign in" : "Have an administrator setup code?"}
        </a>
      </div>
    </main>
  );
}
