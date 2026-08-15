import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { consoleUrl, DEFAULT_MODE, MOCK_URL } from "./consoles";
import { SURFACES } from "./surfaces";

/**
 * Walks the surface manifest and writes one screenshot per surface per theme
 * (plan 04 slice 4). Run with `pnpm fidelity:shots`; output lands in the
 * gitignored `fidelity-shots/<theme>/`.
 *
 * These are not assertions. A shot that renders is not a shot that matches the
 * reference — the comparison is the human half of CLAUDE.md's fidelity clause,
 * made against docs/design-reference.md. What this guarantees is only that the
 * pass has a complete, named denominator to compare.
 *
 * Deliberately not a `toHaveScreenshot` baseline suite: pinning bytes would
 * redden CI on a font-hinting difference between two machines while saying
 * nothing about whether the console still looks like the reference.
 */

const OUT = "fidelity-shots";

async function signInWithPassword(page: Page, base: string) {
  await page.goto(`${base}/login`);
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/agents$/);
}

async function signInWithSso(page: Page, base: string) {
  // One navigation, three redirects: the console's own start, the stub
  // provider's auto-approving `/authorize`, and the callback — which sets the
  // session cookie on its 302 and names no host in the `Location`, so the
  // browser never leaves this console. Nothing to fill in and nothing to click,
  // which is the whole reason the stub approves without a consent screen.
  await page.goto(`${base}/api/auth/login`);
  // The console's own failure channel, read before the wait rather than after
  // it: every way this flow can fail ends at `/login?sso_error=<code>`, and
  // without this the next line spends its full timeout and then reports
  // "expected /agents" — which says nothing about whether discovery, the token
  // exchange or the id_token gave way.
  const failed = /\/login\?sso_error=([a-z_]+)/.exec(page.url());
  if (failed) throw new Error(`SSO sign-in failed: ${failed[1]}`);
  await page.waitForURL(/\/agents$/);
}

test.beforeEach(async ({ request }) => {
  // `request.post` resolves on 4xx/5xx too, so an unchecked call would let a
  // failed reset carry the previous surface's mutations into this shot — and
  // a shot of stale state still looks like a shot.
  const reset = await request.post(`${MOCK_URL}/__reset`);
  if (!reset.ok()) {
    throw new Error(`mock-platform reset failed: ${reset.status()}`);
  }
});

for (const surface of SURFACES) {
  test(`shot: ${surface.id}`, async ({ page }, testInfo) => {
    const theme = testInfo.project.name;
    const mode = surface.mode ?? DEFAULT_MODE;
    // `use.baseURL` names one console and this pass walks two, so every
    // navigation below is absolute. A relative `goto` would land on whichever
    // console the config happens to name — which, for every surface but the
    // login page, still looks like a perfectly good shot.
    const base = consoleUrl(mode);

    // The login gate is the one route shot signed out, once per console
    // configuration, because what it offers *is* the configuration. Keyed on
    // the route rather than the id: two surfaces share it now.
    if (surface.route === "/login") {
      await page.context().clearCookies();
      await page.goto(`${base}${surface.route}`);
      // `data-sso` is on the wrapper in every configuration; the hydration
      // marker only exists where a password form does, and the SSO page has
      // none — `login-form.tsx` gates the whole form on `password`, so waiting
      // for it there would hang to timeout rather than fail with a reason.
      await page.locator("[data-sso]").waitFor();
      if (await page.locator("form").count()) {
        await page.locator("form[data-hydrated]").waitFor();
      }
    } else {
      if (mode === "sso") await signInWithSso(page, base);
      else await signInWithPassword(page, base);
      await page.goto(`${base}${surface.route}`);
      // The shell's platform probe resolves independently of the page's own
      // data; without this the sidebar is caught mid-"Checking platform…".
      await page
        .locator('[data-testid="connection-dot"]:not([data-state="checking"])')
        .waitFor();
      await surface.setup?.(page);
    }

    // Readiness, using the console's own loading convention: every skeleton
    // carries aria-busy, so their absence means the data arrived.
    //
    // Deliberately not `networkidle` — a session page holds its SSE stream
    // open, so the network is never idle and every trace surface times out.
    // And this check is only worth anything because the marker is uniform:
    // `DataTable` had no aria-busy, so the first run shot six lists of
    // skeleton bars, passed 46/46, and looked like coverage.
    await page.waitForFunction(
      () => !document.querySelector('[aria-busy="true"]'),
    );

    // A dialog is painted before its entry animation ends, so a shot taken on
    // `waitFor` alone catches it part-way through the fade — over a backdrop
    // that is still lightening. Two runs of the same build then differ across
    // essentially the whole frame (measured: 1,292,989 of 1,296,000 pixels on
    // `archive-confirm`), which makes every dialog shot unreadable as
    // evidence. The e2e axe pass hit this first and waits the same way.
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) {
      await expect
        .poll(() =>
          dialog.first().evaluate((el) => getComputedStyle(el).opacity),
        )
        .toBe("1");
    }

    await mkdir(`${OUT}/${theme}`, { recursive: true });
    await page.screenshot({
      path: `${OUT}/${theme}/${surface.id}.png`,
      fullPage: true,
    });
  });
}
