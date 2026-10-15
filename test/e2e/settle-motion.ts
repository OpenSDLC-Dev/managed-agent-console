import type { Page } from "@playwright/test";

/**
 * Wait until every CSS transition and finite animation on the page has ended.
 *
 * Call it before an axe scan. Buttons, tabs and dialogs fade their colours and
 * opacity for about 150 ms after a state change, and axe reads the colour
 * mid-fade: a button that had just turned enabled failed `color-contrast` at
 * half opacity (#222). Infinite animations, such as a spinner, never end and
 * are left running.
 */
export async function settleMotion(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}
