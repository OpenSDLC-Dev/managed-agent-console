import {
  expect,
  request as pwRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { resolveLiveEnv } from "./env";
import { signIn } from "./sign-in";

/**
 * Plan 07 slice 5 — acceptance for the two credentials the console issues,
 * against a REAL platform stack (the platform repo's deploy/compose).
 *
 * Both halves assert the same shape of claim, which is the only one worth
 * making about an issuance surface: **the credential the console minted is
 * accepted by the real platform on the lane it was minted for, and the
 * console's own retire control closes that lane.** Anything short of that —
 * a row appearing, a dialog rendering a string — is satisfied equally by a
 * key that never worked.
 *
 * This file spends no model tokens. It creates one environment and two
 * credentials; the environment is archived in cleanup and each credential is
 * retired by the test that mints it.
 *
 * What it deliberately does not do is drive `ant beta:worker poll` — the real
 * CLI is not a dependency this repo can install, and its binary would have to
 * exist on any machine running the tier. So the spec exercises the worker lane
 * over the wire exactly as the CLI does (Bearer + the poll and stats routes),
 * and the acceptance *run* recorded in docs/HISTORY.md drives the real binary
 * on top of it. The wire is the contract; the CLI is the witness.
 */

const { baseUrl, apiKey } = resolveLiveEnv();
const RUN = Date.now().toString(36);

let api: APIRequestContext;
let createdEnvironmentId: string | undefined;

/** A worker identifies itself with this header; the platform attributes the poll to it. */
const WORKER_ID = `live-e2e-worker-${RUN}`;

test.beforeAll(async () => {
  api = await pwRequest.newContext();
});

test.afterAll(async () => {
  // Archive what this run authored. A cleanup failure is a real failure:
  // leftovers accumulate on a stack every later run shares.
  if (createdEnvironmentId) {
    const res = await api.post(
      `${baseUrl}/v1/environments/${createdEnvironmentId}/archive`,
      { headers: { "x-api-key": apiKey }, data: {} },
    );
    const ok = res.ok();
    await api.dispose();
    expect(ok, `archiving ${createdEnvironmentId} -> ${res.status()}`).toBe(
      true,
    );
    return;
  }
  await api.dispose();
});

test("a console-issued environment key drives the real worker lane, and revoking it closes the lane", async ({
  page,
}) => {
  await signIn(page);

  // Authored through the console's own form, not seeded over the API: the
  // claim under test starts at the operator's first click.
  await page.goto("/environments/new");
  await page.getByLabel("Name").fill(`live-e2e-byoc-${RUN}`);
  await page.getByLabel("Environment type").click();
  await page.getByRole("option", { name: "self_hosted" }).click();
  await page
    .getByRole("button", { name: "Create environment", exact: true })
    .click();
  await expect(page).toHaveURL(/\/environments\/env_/);
  const environmentId = page.url().split("/environments/")[1];
  createdEnvironmentId = environmentId;

  await page
    .getByRole("button", { name: "Generate environment key", exact: true })
    .click();
  await page.getByLabel("Name").fill(`live-e2e-host-${RUN}`);
  await page
    .getByRole("button", { name: "Create environment key", exact: true })
    .click();

  const revealed = page.getByTestId("revealed-key");
  await expect(revealed).toBeVisible();
  const environmentKey = ((await revealed.textContent()) ?? "").trim();
  // The platform's own prefix, deliberately not an Anthropic look-alike — a
  // key that reads like one invites being pasted into ANTHROPIC_API_KEY
  // (platform docs/DIVERGENCES.md).
  expect(environmentKey).toMatch(/^sk-map-env01-/);
  await page.getByTestId("close-revealed-key").click();
  // Closing is final. Real platform, real secret: it must be gone from the
  // document, not merely hidden.
  expect(await page.content()).not.toContain(environmentKey);

  const row = page.getByRole("row").filter({ hasText: `live-e2e-host-${RUN}` });
  await expect(row.locator("[data-key-state]")).toHaveAttribute(
    "data-key-state",
    "active",
  );

  // The worker lane, over the wire the real `ant beta:worker poll` uses: a
  // non-blocking poll on an empty queue answers 200 with a null item.
  const poll = () =>
    api.get(`${baseUrl}/v1/environments/${environmentId}/work/poll`, {
      headers: {
        Authorization: `Bearer ${environmentKey}`,
        "Anthropic-Worker-ID": WORKER_ID,
      },
    });
  const accepted = await poll();
  expect(accepted.status(), await accepted.text()).toBe(200);

  // Proof by the platform's own bookkeeping rather than by silence:
  // Queue.RecordPoll fires only on the *authenticated* poll path, so a
  // non-zero workers_polling cannot be produced by a rejected request.
  const stats = await api.get(
    `${baseUrl}/v1/environments/${environmentId}/work/stats`,
    { headers: { Authorization: `Bearer ${environmentKey}` } },
  );
  expect(stats.status()).toBe(200);
  expect(
    ((await stats.json()) as { workers_polling: number }).workers_polling,
  ).toBeGreaterThan(0);

  // And it is demonstrably the *worker* lane: the management key the console
  // itself runs on is refused here.
  const asManagement = await api.get(
    `${baseUrl}/v1/environments/${environmentId}/work/poll`,
    { headers: { "x-api-key": apiKey } },
  );
  expect(asManagement.status()).toBe(401);

  // Revoke through the UI — the operator action the whole surface exists for.
  await row.getByRole("button", { name: /^Revoke environment key / }).click();
  await page
    .getByRole("button", { name: "Revoke environment key", exact: true })
    .click();
  await expect(page.getByText(`live-e2e-host-${RUN}`)).toBeHidden();

  // The lane closes on the platform, not just in the listing.
  const refused = await poll();
  expect(refused.status()).toBe(401);
});

test("a console-issued management key drives the real wire API, and Disable stops it", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/api-keys");

  await page.getByRole("button", { name: "Create key" }).click();
  await page.getByLabel("Name").fill(`live-e2e-mgmt-${RUN}`);
  await page.getByLabel("Expires").selectOption("7d");
  await page.getByRole("button", { name: "Add" }).click();

  const revealed = page.getByTestId("revealed-api-key");
  await expect(revealed).toBeVisible();
  const managementKey = ((await revealed.textContent()) ?? "").trim();
  expect(managementKey).toMatch(/^sk-map-api01-/);
  await page.getByTestId("close-revealed-api-key").click();
  expect(await page.content()).not.toContain(managementKey);

  const row = page.locator("tr", { hasText: `live-e2e-mgmt-${RUN}` });
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "active",
  );

  // The listing identifies the key that was just minted — the property that
  // makes a lost plaintext recoverable rather than an orphan (PR #97).
  await expect(row).toContainText(managementKey.slice(-4));

  // A management credential, so the claim is against the management wire.
  const call = () =>
    api.get(`${baseUrl}/v1/agents?limit=1`, {
      headers: { "x-api-key": managementKey },
    });
  const accepted = await call();
  expect(accepted.status(), await accepted.text()).toBe(200);

  await row.getByRole("button", { name: "Disable" }).click();
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "inactive",
  );

  // The platform authenticates only `active` rows, so the operator's click is
  // the whole story: the same call, the same key, refused.
  const refused = await call();
  expect(refused.status()).toBe(401);

  // Archive is terminal and doubles as this test's cleanup.
  await row
    .getByRole("button", { name: `Archive API key live-e2e-mgmt-${RUN}` })
    .click();
  await page
    .getByRole("button", { name: "Archive API key", exact: true })
    .click();
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "archived",
  );
  await expect(row.getByRole("button")).toHaveCount(0);
});
