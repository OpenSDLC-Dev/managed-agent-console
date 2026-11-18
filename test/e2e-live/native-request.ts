import { request, type APIRequestContext, type Page } from "@playwright/test";
import { LIVE_BROWSER_ORIGIN, resolveLiveEnv } from "./env";

/** A separate native browser session for run-scoped cleanup, never a public key. */
export async function nativeRequest(): Promise<{
  api: APIRequestContext;
  headers: Record<string, string>;
}> {
  const { loginName, loginPassword } = resolveLiveEnv();
  const api = await request.newContext();
  try {
    const login = await api.post(`${LIVE_BROWSER_ORIGIN}/api/auth/login`, {
      headers: { origin: LIVE_BROWSER_ORIGIN },
      data: { login_name: loginName, password: loginPassword },
    });
    if (!login.ok())
      throw new Error(`Native fixture login: HTTP ${login.status()}`);
    const session = await (
      await api.get(`${LIVE_BROWSER_ORIGIN}/api/auth/session`)
    ).json();
    return {
      api,
      headers: {
        origin: LIVE_BROWSER_ORIGIN,
        "x-csrf-token": session.csrf_token,
      },
    };
  } catch (error) {
    await api.dispose();
    throw error;
  }
}

export async function privateHeaders(
  page: Page,
): Promise<Record<string, string>> {
  const response = await page.request.get("/api/auth/session");
  if (!response.ok())
    throw new Error(`Native fixture session: HTTP ${response.status()}`);
  return {
    origin: new URL(page.url()).origin,
    "x-csrf-token": (await response.json()).csrf_token,
  };
}
