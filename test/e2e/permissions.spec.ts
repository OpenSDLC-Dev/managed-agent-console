import { expect, test, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:18080";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

/**
 * Plan 08 slice 4. The console renders every control, because it cannot learn
 * what an operator may do — the platform has no `me` route, and `requireRole`
 * denies at every floor, so "authenticated, any role" is not expressible there
 * (D4, filed as a platform issue). The cost of that choice is that a denial
 * arrives as a failed request, and these are what make it arrive legibly.
 *
 * The mock answers the platform's own 403 shape: `permission_error`, with a
 * message naming **the role the route requires** and never the caller's.
 */
test("a surface the operator's role cannot read stays visible and says why", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__forbid`, { data: { paths: ["v1/skills"] } });
  await signIn(page);
  await page.goto("/skills");

  const state = page.getByTestId("error-state");
  await expect(state).toBeVisible();
  await expect(state).toHaveAttribute("data-error-status", "403");
  await expect(state).toHaveAttribute("data-denied", "true");
  // The platform's own message, quoted rather than paraphrased. This is the
  // platform's string travelling the whole path — mock, BFF, client, DOM — not
  // one of the console's own formatters, so asserting it here is asserting
  // *data*, the way these specs assert a resource's name. The console-authored
  // line that accompanies it (`ROLE_NOTE`) is a formatter string and is pinned
  // in exactly one place, `bits.test.tsx`; `data-denied` above is what says it
  // renders here.
  await expect(
    page.getByText("this route requires the admin role"),
  ).toBeVisible();

  // The crucial negative: a denial is NOT feature detection. The surface exists
  // on this deployment and must keep saying so, or an operator would report a
  // missing feature instead of asking for a role.
  await expect(page.getByTestId("unavailable-surface")).toHaveCount(0);
  await expect(page.locator("nav [data-surface=skills]")).toBeVisible();
});

// The shape plan 08 slice 5 will drive with a real viewer token: the operator
// can read, so the control is right there, and only the write is refused. Only
// the archive path is forbidden, so the read that got them here still works —
// which is exactly the state a viewer is in.
test("a denied write is titled as a denial, not as a fault", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Environments", exact: true }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Name").fill("role-check");
  await page
    .getByRole("button", { name: "Create environment", exact: true })
    .click();
  await expect(page).toHaveURL(/\/environments\/env_mock/);

  const id = new URL(page.url()).pathname.split("/").pop();
  await request.post(`${MOCK}/__forbid`, {
    data: { paths: [`v1/environments/${id}/archive`] },
  });

  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archive environment" }).click();

  // The title stays the one the call site chose, because it names what was
  // refused — better than a generic "Not permitted", which is only the fallback
  // for a read that has no action to name. What must be there either way is the
  // reason, and the fact that retrying will not change it.
  // Both strings here are ones no unit test can place: the title is this call
  // site's own, and the message is the platform's, arriving through the toast
  // rather than the error state. `ROLE_NOTE` is the console's formatter string
  // and stays pinned in `toast-error.test.ts` alone.
  await expect(page.getByText("Archive failed")).toBeVisible();
  await expect(
    page.getByText(/this route requires the admin role/),
  ).toBeVisible();

  // And the environment is still active: a refused write changed nothing.
  await expect(page.getByText("archived", { exact: true })).toHaveCount(0);
});
