import type { APIRequestContext, Page } from "@playwright/test";

type Options = Parameters<APIRequestContext["post"]>[1];
/** Explicit private fixture writes use the same cookie and CSRF contract as UI. */
async function write(
  page: Page,
  method: "POST" | "DELETE",
  url: string,
  options?: Options,
) {
  const response = await page.request.get(
    new URL("/api/auth/session", page.url()).href,
  );
  if (!response.ok())
    throw new Error(`Fixture browser session: HTTP ${response.status()}`);
  const session = await response.json();
  return page.request.fetch(url, {
    ...options,
    method,
    headers: {
      origin: new URL(page.url()).origin,
      "x-csrf-token": session.csrf_token,
      ...options?.headers,
    },
  });
}
export const browserPost = (page: Page, url: string, options?: Options) =>
  write(page, "POST", url, options);
export const browserDelete = (page: Page, url: string, options?: Options) =>
  write(page, "DELETE", url, options);
