import { openApiKeyForm } from "../api-key-flow";
import {
  openServiceAccountForm,
  openServiceAccountMenu,
  serviceAccountsPath,
  showArchivedServiceAccounts,
} from "../service-account-flow";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nativeDocker } from "./docker";
import { test, expect } from "./test";
import { selectNativeSurfaces } from "../fidelity/native-surfaces";
import {
  seedGateway,
  seedPlaygroundModel,
  principals,
} from "./gateway-fixture";
import { seedDeployment } from "./deployment-fixture";
const selected = selectNativeSurfaces(process.env.NATIVE_FIDELITY_IDS);
const org = "/api/console/organizations/default";
const password = "native-shot-password-123";
const playgroundReplies = new Set([
  "native-playground-response",
  "native-playground-raw",
  "native-playground-continuation",
  "native-playground-history",
]);

test("walk native manifest in owned Chrome (not a current-reference comparison)", async ({
  page,
}, info) => {
  const request = page.request;
  const receipt = JSON.parse(
    readFileSync(
      join(process.env.NATIVE_EVIDENCE_DIR!, "task6-native-receipt.json"),
      "utf8",
    ),
  );
  const dir = join(
    process.env.NATIVE_EVIDENCE_DIR!,
    "task6-fidelity",
    info.project.name,
  );
  mkdirSync(dir, { recursive: true });
  const setupCode = readFileSync(
    join(receipt.dir, "password-setup-code"),
    "utf8",
  );
  const setup = await request.post(`${org}/setup_code/redeem`, {
    headers: { origin: "http://127.0.0.1:38200" },
    data: { code: setupCode, login_name: "shot-admin", password },
  });
  if (setup.status() !== 200 && setup.status() !== 409)
    throw new Error(`synthetic setup: ${setup.status()}`);
  // request and page share the test context; setup's HttpOnly cookie remains
  // browser-owned. On the second theme, sign in to the same synthetic account.
  if (setup.status() === 409)
    await request.post("/api/auth/login", {
      headers: { origin: "http://127.0.0.1:38200" },
      data: { login_name: "shot-admin", password },
    });
  const adminCookies = await page.context().cookies();
  expect(
    adminCookies.some(
      (cookie) => cookie.name === "map_session" && cookie.httpOnly,
    ),
  ).toBe(true);
  const session = await (await request.get("/api/auth/session")).json();
  const headers = {
    origin: "http://127.0.0.1:38200",
    "X-CSRF-Token": session.csrf_token,
  };
  const addUser = await request.post(`${org}/members`, {
    headers,
    data: { login_name: "shot-user", password, role: "user" },
  });
  expect([200, 409]).toContain(addUser.status());
  const addMapped = await request.post(`${org}/members`, {
    headers,
    data: {
      login_name: "shot-mapped",
      password,
      role: "developer",
      name: "Mapped member",
    },
  });
  expect([200, 409]).toContain(addMapped.status());
  const mapped = nativeDocker([
    "exec",
    receipt.container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "native_password",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "UPDATE principals SET role_source='idp' WHERE subject='shot-mapped'",
  ]);
  expect(mapped.status, mapped.stderr).toBe(0);
  const addAccount = await request.post(`${org}/service_accounts`, {
    headers,
    data: {
      name: "release-bot",
      description: "Build automation",
      organization_role: "developer",
    },
  });
  expect([200, 409]).toContain(addAccount.status());
  const archived = await request.post(`${org}/service_accounts`, {
    headers,
    data: { name: "retired-bot" },
  });
  expect([200, 409]).toContain(archived.status());
  const allAccounts = await (
    await request.get(`${org}/service_accounts?include_archived=true`)
  ).json();
  const retired = allAccounts.data.find(
    (a: { name: string }) => a.name === "retired-bot",
  );
  expect(
    (
      await request.post(`${org}/service_accounts/${retired.id}/archive`, {
        headers,
      })
    ).status(),
  ).toBe(200);
  const keyPath = `${org}/workspaces/default/api_keys`;
  const service = allAccounts.data.find(
    (account: { name: string }) => account.name === "release-bot",
  );
  for (const [name, principal_id] of [
    ["human", session.id],
    ["service", service.id],
  ]) {
    const created = await request.post(keyPath, {
      headers,
      data: { name: `shot-owned-${name}-${info.project.name}`, principal_id },
    });
    expect(created.status()).toBe(200);
    // The raw field is not needed to arrange a metadata screenshot.
    await created.dispose();
  }
  const walked: string[] = [];
  const environmentFixtures: Record<string, string> = {};
  if (
    selected.some((surface) => surface.id.startsWith("native-environment-"))
  ) {
    const resource = "/api/organizations/default/proxy/v1/environments";
    for (const [name, kind, archived] of [
      ["cloud", "cloud", false],
      ["archived-cloud", "cloud", true],
      ["self-hosted", "self_hosted", false],
    ] as const) {
      const created = await request.post(resource, {
        headers,
        data: { name: `Key management — ${name}`, config: { type: kind } },
      });
      expect(created.status()).toBe(200);
      const environment = await created.json();
      environmentFixtures[name] = environment.id;
      if (archived)
        expect(
          (
            await request.post(`${resource}/${environment.id}/archive`, {
              headers,
            })
          ).status(),
        ).toBe(200);
      const issued = await request.post(
        `/api/oauth/organizations/default/environments/${environment.id}/tokens`,
        {
          headers,
          data: { name: "shot-environment-key" },
        },
      );
      expect(issued.status()).toBe(200);
      await issued.dispose();
    }
  }
  const deploymentFixture = selected.some((s) =>
    s.id.startsWith("native-deployment-initiator"),
  )
    ? await seedDeployment(request)
    : undefined;
  if (
    selected.some(
      (s) =>
        s.id.startsWith("native-model-limits") ||
        s.id.startsWith("native-principal-") ||
        (s.id.startsWith("native-playground") && !playgroundReplies.has(s.id)),
    )
  )
    await seedGateway(request, receipt.container);
  const playgroundAlias = `playground-${info.project.name}`;
  if (selected.some((surface) => playgroundReplies.has(surface.id)))
    await seedPlaygroundModel(request, playgroundAlias);
  for (const surface of selected) {
    await test.step(surface.id, async () => {
      let releaseWrite: (() => void) | undefined;
      let writeArrived: Promise<void> | undefined;
      try {
        await page.goto("about:blank");
        await page.context().clearCookies();
        if (
          ![
            "native-password-login",
            "native-login-keyboard-error",
            "native-oidc-login",
            "native-setup",
            "native-setup-refused",
          ].includes(surface.id)
        )
          await page.context().addCookies(adminCookies);
        if (
          surface.id === "native-identity-loading" ||
          surface.id === "native-identity-failure"
        ) {
          await page.route("**/api/auth/session", async (route) => {
            if (surface.id === "native-identity-loading") {
              await new Promise((r) => setTimeout(r, 2000));
              await route.continue().catch(() => {});
            } else
              await route.fulfill({
                status: 503,
                json: {
                  error: {
                    type: "api_error",
                    message: "Session metadata is temporarily unavailable.",
                  },
                },
              });
          });
          await page.goto(surface.route);
          await expect(
            page.locator(
              `[data-native-identity=${surface.id.endsWith("loading") ? "loading" : "error"}]`,
            ),
          ).toBeVisible();
          await expect(
            page.getByRole("button", { name: "Create local member" }),
          ).toHaveCount(0);
        } else if (surface.id === "native-oidc-login") {
          await page.goto("http://127.0.0.1:38201/login");
          await expect(
            page.getByRole("link", { name: "Sign in with SSO" }),
          ).toBeVisible();
        } else if (surface.id === "native-members-loading") {
          await page.route(
            "**/api/console/organizations/default/members?**",
            async (route) => {
              await new Promise((r) => setTimeout(r, 2000));
              await route.continue().catch(() => {});
            },
          );
          await page.goto(surface.route);
          await expect(
            page.locator('[aria-busy="true"]').first(),
          ).toBeVisible();
        } else {
          if (surface.id === "native-dashboard-unimplemented") {
            await page.route("**/*", async (route) => {
              const path = new URL(route.request().url()).pathname;
              if (
                (path.startsWith("/api/") && !path.startsWith("/api/auth/")) ||
                path.startsWith("/admin/v1/")
              )
                await route.fulfill({
                  status: 404,
                  json: {
                    error: {
                      type: "not_found_error",
                      message: "collection unavailable",
                    },
                  },
                });
              else await route.continue();
            });
          }
          if (surface.id.includes("pending")) {
            const isMember = surface.route === "/members";
            const target = `pending-${surface.id.split("-").at(-1)}-${info.project.name}`;
            const created = await request.post(
              `${org}/${isMember ? "members" : "service_accounts"}`,
              {
                headers,
                data: isMember
                  ? { login_name: target, password, role: "user" }
                  : { name: target },
              },
            );
            expect(created.status()).toBe(200);
            let arrived!: () => void;
            writeArrived = new Promise<void>((r) => {
              arrived = r;
            });
            const held = new Promise<void>((r) => {
              releaseWrite = r;
            });
            await page.route(
              `**/api/console/organizations/default/${isMember ? "members" : "service_accounts"}**`,
              async (route) => {
                if (route.request().method() !== "GET") {
                  arrived();
                  await held;
                }
                await route.continue().catch(() => {});
              },
            );
          }
          if (surface.id === "native-no-resources") {
            const signedIn = await request.post("/api/auth/login", {
              headers: { origin: "http://127.0.0.1:38200" },
              data: { login_name: "shot-user", password },
            });
            expect(signedIn.status()).toBe(200);
          }
          await page.goto(
            surface.id.startsWith("native-deployment-initiator")
              ? `/deployments/${deploymentFixture!.deployment.id}`
              : surface.id.startsWith("native-environment-")
                ? `/environments/${environmentFixtures[surface.id.includes("archived-cloud") ? "archived-cloud" : surface.id.includes("self-hosted") ? "self-hosted" : "cloud"]}`
                : surface.route === "/service-accounts/[id]"
                  ? `/service-accounts/${service.id}`
                  : surface.route,
          );
          if (surface.route === "/login" || surface.route === "/setup")
            await expect(
              page.getByLabel(
                surface.route === "/login" ? "Login name" : "Setup code",
              ),
            ).toBeVisible();
          else await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
          if (
            [
              "native-environment-cloud-key-form",
              "native-environment-cloud-key-reveal",
            ].includes(surface.id)
          ) {
            await page
              .getByRole("button", {
                name: "Generate environment key",
                exact: true,
              })
              .click();
            if (surface.id.endsWith("reveal")) {
              await page
                .getByLabel("Name", { exact: true })
                .fill(`shot-cloud-reveal-${info.project.name}`);
              await page
                .getByRole("button", {
                  name: "Create environment key",
                  exact: true,
                })
                .click();
            }
          }
          if (surface.id === "native-environment-cloud-key-revoke")
            await page
              .getByRole("button", {
                name: "Revoke environment key shot-environment-key",
                exact: true,
              })
              .click();
          if (surface.id === "native-model-limits-form")
            await page.getByRole("button", { name: "Edit limits" }).click();
          if (surface.id === "native-playground-code") {
            await page
              .getByLabel("Prompt", { exact: true })
              .fill("Write a short greeting.");
            await page.getByText("Code", { exact: true }).click();
          }
          if (surface.id === "native-playground-settings")
            await page.getByRole("button", { name: "Model settings" }).click();
          if (playgroundReplies.has(surface.id)) {
            await page
              .getByRole("combobox", { name: "Model", exact: true })
              .click();
            await page
              .getByRole("option", { name: playgroundAlias, exact: true })
              .click();
            await page
              .getByLabel("Prompt", { exact: true })
              .fill("Write a short greeting.");
            await page.getByRole("button", { name: "Run prompt" }).click();
            await expect(
              page.locator('[data-run-status="complete"]'),
            ).toBeAttached();
            if (surface.id === "native-playground-raw")
              await page.getByText("Raw", { exact: true }).click();
            if (surface.id === "native-playground-continuation")
              await page
                .getByRole("button", { name: "Add to messages" })
                .click();
            if (surface.id === "native-playground-history")
              await page
                .getByRole("button", { name: "History", exact: true })
                .click();
          }
          if (surface.id === "native-deployment-initiator-form") {
            await page
              .getByRole("button", { name: "Change initiator" })
              .click();
            await page
              .getByLabel("Service account")
              .selectOption(deploymentFixture!.account.id);
          }
          if (surface.id === "native-principal-usage")
            await page
              .getByRole("button", { name: "Principal", exact: true })
              .click();
          if (surface.id === "native-owned-key-list") {
            await expect(
              page.locator(`[data-owner-id="${session.id}"]`).first(),
            ).toBeVisible();
            await expect(
              page.locator(`[data-owner-id="${service.id}"]`).first(),
            ).toBeVisible();
          } else if (surface.id === "native-owned-key-form") {
            await openApiKeyForm(page);
          } else if (surface.id === "native-owned-key-dashboard-form") {
            await openApiKeyForm(page, "Get API key");
          } else if (surface.id === "native-owned-key-owner-picker") {
            await openApiKeyForm(page);
            await expect(
              page
                .getByRole("dialog", { name: "Create API key" })
                .getByLabel("Linked account", { exact: true })
                .locator(`option[value="${service.id}"]`),
            ).toHaveCount(1);
            await page
              .getByRole("dialog", { name: "Create API key" })
              .getByLabel("Linked account", { exact: true })
              .selectOption(service.id);
            await page
              .getByRole("dialog", { name: "Create API key" })
              .getByLabel("Linked account", { exact: true })
              .focus();
          } else if (surface.id === "native-owned-key-reveal") {
            await openApiKeyForm(page);
            await page
              .getByLabel("Name", { exact: true })
              .fill(`shot-reveal-${info.project.name}`);
            const issuance = page.waitForResponse(
              (response) =>
                response.url().endsWith(keyPath) &&
                response.request().method() === "POST",
            );
            await page
              .getByRole("dialog", { name: "Create API key" })
              .getByRole("button", { name: "Create key", exact: true })
              .click();
            expect((await issuance).status()).toBe(200);
          }
          if (surface.id === "native-login-keyboard-error") {
            await page.getByLabel("Login name").fill("unknown-shot");
            await page.getByLabel("Password").fill(password);
            await page
              .getByRole("button", { name: "Sign in", exact: true })
              .click();
            await expect(page.locator("p[role=alert]")).toBeVisible();
            await page.getByLabel("Login name").focus();
            await page.keyboard.press("Tab");
            await page.keyboard.press("Shift+Tab");
            await expect(page.getByLabel("Login name")).toBeFocused();
            expect(
              await page
                .getByLabel("Login name")
                .evaluate((el) => el.matches(":focus-visible")),
            ).toBe(true);
          }
          if (surface.id === "native-setup-refused") {
            await page.getByLabel("Setup code").fill("spent-setup-code");
            await page.getByLabel("Login name").fill("another-admin");
            await page.getByLabel("Password").fill(password);
            await page
              .getByRole("button", { name: "Create administrator" })
              .click();
            await expect(page.locator("p[role=alert]")).toBeVisible();
          }
          if (surface.id === "native-dashboard-unimplemented") {
            await expect(page.locator("[data-dashboard-card]")).toHaveCount(0);
            await expect(page.locator("[data-no-resource-access]")).toHaveCount(
              0,
            );
          }
          if (surface.route === "/members" && surface.id.includes("pending")) {
            const target = `pending-${surface.id.split("-").at(-1)}-${info.project.name}`;
            if (surface.id === "native-members-pending-removal") {
              await page
                .getByRole("button", { name: `Remove ${target}`, exact: true })
                .click();
              await page
                .getByRole("button", { name: "Confirm removal" })
                .click();
            } else if (surface.id === "native-members-pending-role") {
              await page
                .getByLabel(`Role for ${target}`, { exact: true })
                .selectOption("developer");
            } else {
              await page
                .getByRole("button", {
                  name: "Create local member",
                  exact: true,
                })
                .click();
              await page
                .getByLabel("Login name", { exact: true })
                .fill(`new-${target}`);
              await page.getByLabel("Password", { exact: true }).fill(password);
              await page
                .getByRole("button", {
                  name: "Create member",
                  exact: true,
                })
                .click();
            }
            await writeArrived;
            if (surface.id !== "native-members-pending-role")
              await page
                .getByRole("button", { name: "Cancel", exact: true })
                .click();
            const trigger = page.getByRole("button", {
              name: "Create local member",
              exact: true,
            });
            await expect(trigger).toBeDisabled();
            if (surface.id.endsWith("pending-create")) {
              await expect(trigger).toBeFocused();
              await trigger.press("Enter");
              await trigger.press("Space");
              await trigger.dispatchEvent("click");
              await expect(page.getByRole("dialog")).toHaveCount(0);
            }
            await expect(page.getByRole("dialog")).toHaveCount(0);
          }
          if (surface.id.startsWith("native-service-account-pending-")) {
            const target = `pending-${surface.id.split("-").at(-1)}-${info.project.name}`;
            let dialog;
            let submit;
            if (surface.id.endsWith("pending-create")) {
              dialog = await openServiceAccountForm(page);
              await dialog
                .getByLabel("Name", { exact: true })
                .fill(`new-${target}`);
              submit = dialog.getByRole("button", {
                name: "Create service account",
                exact: true,
              });
            } else if (surface.id.endsWith("pending-update")) {
              const menu = await openServiceAccountMenu(page, target);
              await menu
                .getByRole("menuitem", { name: "Edit", exact: true })
                .click();
              dialog = page.getByRole("dialog", { name: target });
              await dialog
                .getByLabel(/Description/)
                .fill("Pending description");
              submit = dialog.getByRole("button", {
                name: "Save",
                exact: true,
              });
            } else {
              const menu = await openServiceAccountMenu(page, target);
              await menu
                .getByRole("menuitem", { name: "Archive", exact: true })
                .click();
              dialog = page.getByRole("alertdialog", {
                name: "Archive service account",
                exact: true,
              });
              submit = dialog.getByRole("button", {
                name: "Archive",
                exact: true,
              });
            }
            await submit.click();
            await writeArrived;
            await expect(submit).toBeDisabled();
            await page.keyboard.press("Escape");
            await expect(dialog).toBeVisible();
          }
          if (surface.id === "native-member-create-refused") {
            await page
              .getByRole("button", { name: "Create local member" })
              .click();
            await page.getByLabel("Login name").fill("shot-admin");
            await page.getByLabel("Name", { exact: true }).fill("Draft member");
            await page
              .getByLabel("Role", { exact: true })
              .selectOption("admin");
            await page.getByLabel("Password").fill(password);
            await page
              .getByRole("button", { name: "Create member", exact: true })
              .click();
            await expect(page.locator("p[role=alert]")).toContainText(
              "unavailable",
            );
            await expect(page.getByLabel("Login name")).toHaveValue(
              "shot-admin",
            );
            await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
              "Draft member",
            );
            await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
              "admin",
            );
            await expect(page.getByLabel("Password")).toHaveValue("");
          }
          if (surface.id === "native-no-resources")
            await expect(
              page.locator("[data-no-resource-access]"),
            ).toBeVisible();
          if (surface.id === "native-members")
            await expect(
              page.getByText("Managed by identity provider"),
            ).toBeVisible();
          if (surface.id === "native-member-create") {
            await page
              .getByRole("button", { name: "Create local member" })
              .click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await page.keyboard.press("Tab");
          }
          if (surface.id === "native-last-admin") {
            await page
              .getByRole("button", { name: "Remove shot-admin" })
              .click();
            await page.getByRole("button", { name: "Confirm removal" }).click();
            await expect(page.locator("p[role=alert]")).toContainText("last");
          }
          if (surface.id === "native-service-accounts") {
            await expect(
              page.getByRole("radio", { name: "Active", exact: true }),
            ).toBeChecked();
            await expect(
              page.getByRole("button", { name: "release-bot", exact: true }),
            ).toBeVisible();
            await expect(
              page.getByRole("button", { name: "retired-bot", exact: true }),
            ).toHaveCount(0);
          }
          if (surface.id === "native-service-accounts-archived") {
            await showArchivedServiceAccounts(page);
            await expect(
              page.getByRole("button", { name: "retired-bot", exact: true }),
            ).toBeVisible();
            await expect(
              page.getByRole("button", { name: "release-bot", exact: true }),
            ).toHaveCount(0);
          }
          if (surface.id === "native-service-account-search") {
            await page
              .getByLabel("Search service accounts", { exact: true })
              .fill("no-matching-bot");
            await expect(
              page.getByRole("button", { name: "Reset search", exact: true }),
            ).toBeVisible();
          }
          if (surface.id === "native-service-account-drawer") {
            await page
              .getByRole("button", { name: "release-bot", exact: true })
              .click();
            const inspector = page.getByRole("dialog", {
              name: "release-bot",
              exact: true,
            });
            await expect(
              inspector.getByRole("link", { name: "Open", exact: true }),
            ).toBeVisible();
            await expect(
              inspector.getByRole("link", {
                name: new RegExp(`^shot-owned-service-${info.project.name}\\b`),
              }),
            ).toBeVisible();
          }
          if (surface.id === "native-service-account-detail") {
            await expect(
              page.getByRole("heading", { name: "release-bot", level: 1 }),
            ).toBeVisible();
            await expect(
              page.getByRole("link", {
                name: new RegExp(`^shot-owned-service-${info.project.name}\\b`),
              }),
            ).toBeVisible();
          }
          if (surface.id === "native-service-account-draft") {
            const dialog = await openServiceAccountForm(page);
            await dialog
              .getByLabel("Name", { exact: true })
              .fill("deploy-worker");
            await page.keyboard.press("Escape");
            const discard = page.getByRole("alertdialog", {
              name: "Discard unsaved changes?",
            });
            await expect(
              discard.getByRole("button", { name: "Keep editing" }),
            ).toBeFocused();
          }
          if (surface.id === "native-service-account-create") {
            const dialog = await openServiceAccountForm(page);
            await expect(
              dialog.getByLabel("Name", { exact: true }),
            ).toBeFocused();
            await expect(
              dialog.getByRole("button", {
                name: "Create service account",
                exact: true,
              }),
            ).toBeDisabled();
          }
          if (
            surface.id === "native-service-account-actions" ||
            surface.id === "native-service-account-key-form"
          ) {
            const menu = await openServiceAccountMenu(page, "release-bot");
            await expect(menu.getByRole("menuitem")).toHaveText([
              "Edit",
              "Create API key",
              "Archive",
            ]);
            if (surface.id === "native-service-account-key-form") {
              await menu
                .getByRole("menuitem", { name: "Create API key" })
                .click();
              const form = page.getByRole("dialog", { name: "Create API key" });
              await expect(
                form.getByText("release-bot", { exact: true }),
              ).toBeVisible();
              await expect(
                form.getByLabel("Expires", { exact: true }),
              ).toHaveValue("");
              await expect(
                form.getByRole("button", { name: "Add", exact: true }),
              ).toBeDisabled();
            }
          }
          if (surface.id === "native-service-account-edit") {
            const menu = await openServiceAccountMenu(page, "release-bot");
            await menu.getByRole("menuitem", { name: "Edit" }).click();
            await expect(
              page
                .getByRole("dialog", { name: "release-bot" })
                .getByLabel(/Description/),
            ).toHaveValue("Build automation");
          }
        }
        // These assertions are independent of the interaction branches above.
        // Removing an interaction must fail, not produce a mislabeled list shot.
        switch (surface.id) {
          case "native-environment-cloud-keys":
          case "native-environment-archived-cloud-keys":
          case "native-environment-self-hosted-keys":
            await expect(
              page.getByRole("cell", {
                name: "shot-environment-key",
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              page.getByRole("button", {
                name: "Generate environment key",
                exact: true,
              }),
            ).toBeVisible();
            await expect(page.getByTestId("environment-key-setup")).toHaveCount(
              surface.id.includes("self-hosted") ? 1 : 0,
            );
            await page.getByTestId("environment-keys").scrollIntoViewIfNeeded();
            break;
          case "native-environment-cloud-key-form":
            await expect(
              page.getByRole("dialog", { name: "Create environment key" }),
            ).toBeVisible();
            break;
          case "native-environment-cloud-key-revoke":
            await expect(
              page.getByRole("dialog", { name: "Revoke environment key" }),
            ).toBeVisible();
            break;
          case "native-environment-cloud-key-reveal":
            await expect(
              page.getByRole("dialog", { name: "Save your environment key" }),
            ).toBeVisible();
            expect(
              await page.getByTestId("revealed-key").evaluate((element) => {
                const dialog = element.closest('[role="dialog"]')!;
                const keyBounds = element.getBoundingClientRect();
                const dialogBounds = dialog.getBoundingClientRect();
                return (
                  keyBounds.left >= dialogBounds.left &&
                  keyBounds.right <= dialogBounds.right &&
                  keyBounds.top >= dialogBounds.top &&
                  keyBounds.bottom <= dialogBounds.bottom &&
                  element.scrollWidth <= element.clientWidth
                );
              }),
            ).toBe(true);
            expect(
              await page
                .getByTestId("revealed-key")
                .evaluate((element) =>
                  /^sk-map-env01-.+/.test(element.textContent ?? ""),
                ),
            ).toBe(true);
            break;
          case "native-deployment-initiator":
            await expect(page.locator("[data-initiator-id]")).toHaveAttribute(
              "data-initiator-id",
              deploymentFixture!.session.id,
            );
            await page
              .getByRole("heading", { name: "Scheduled run initiator" })
              .scrollIntoViewIfNeeded();
            break;
          case "native-deployment-initiator-form":
            await expect(page.getByRole("dialog")).toBeVisible();
            await expect(page.getByLabel("Service account")).toHaveValue(
              deploymentFixture!.account.id,
            );
            break;
          case "native-model-limits":
            await expect(
              page.locator("[data-limit=requests_per_minute]"),
            ).toHaveAttribute("data-value", "120");
            break;
          case "native-playground-code":
            await expect(page.getByLabel("Request code")).toContainText(
              "Write a short greeting.",
            );
            break;
          case "native-playground-settings":
            await expect(page.getByLabel("Max tokens")).toBeVisible();
            break;
          case "native-playground-response":
            await expect(
              page.getByText("Fixture response", { exact: true }),
            ).toBeVisible();
            await expect(page.locator("[data-input-tokens]")).toHaveAttribute(
              "data-input-tokens",
              "3",
            );
            await expect(page.locator("[data-output-tokens]")).toHaveAttribute(
              "data-output-tokens",
              "2",
            );
            break;
          case "native-playground-raw":
            await expect(page.getByLabel("Response body")).toContainText(
              "Fixture response",
            );
            break;
          case "native-playground-continuation":
            await expect(page.getByLabel("assistant message 2")).toHaveValue(
              "Fixture response",
            );
            await expect(page.getByLabel("user message 3")).toBeEmpty();
            break;
          case "native-playground-history":
            await expect(
              page
                .getByRole("region", { name: "History" })
                .getByRole("button", { name: "Write a short greeting." }),
            ).toBeVisible();
            break;
          case "native-playground":
            await expect(
              page.getByRole("heading", { name: "Playground", exact: true }),
            ).toBeVisible();
            await expect(
              page.getByLabel("Model", { exact: true }),
            ).toBeEnabled();
            await expect(
              page.getByLabel("Prompt", { exact: true }),
            ).toBeVisible();
            break;
          case "native-model-limits-form":
            await expect(page.getByRole("dialog")).toBeVisible();
            await expect(page.getByLabel("Requests per minute")).toHaveValue(
              "120",
            );
            break;
          case "native-principal-usage":
            for (const id of principals)
              await expect(page.locator(`[data-group=${id}]`)).toBeVisible();
            break;
          case "native-principal-requests":
            for (const id of principals)
              await expect(
                page.locator(`[data-principal-id=${id}]`),
              ).toBeVisible();
            break;
          case "native-owned-key-list":
            await expect(
              page.getByRole("columnheader", {
                name: "Linked account",
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              page.getByRole("columnheader", {
                name: "Created",
                exact: true,
              }),
            ).toBeVisible();
            break;
          case "native-owned-key-form":
          case "native-owned-key-dashboard-form":
            await expect(
              page.getByRole("dialog", { name: "Create API key" }),
            ).toBeVisible();
            await expect(
              page
                .getByRole("dialog", { name: "Create API key" })
                .getByLabel("Linked account", { exact: true }),
            ).toHaveValue(session.id);
            break;
          case "native-owned-key-owner-picker":
            await expect(
              page
                .getByRole("dialog", { name: "Create API key" })
                .getByLabel("Linked account", { exact: true }),
            ).toHaveValue(service.id);
            await expect(
              page
                .getByRole("dialog", { name: "Create API key" })
                .getByLabel("Linked account", { exact: true })
                .locator(`option[value="${retired.id}"]`),
            ).toHaveCount(0);
            break;
          case "native-owned-key-reveal":
            expect(
              await page.getByTestId("revealed-api-key").evaluate((element) => {
                const dialog = element.closest('[role="dialog"]')!;
                return (
                  element.getBoundingClientRect().right <=
                    dialog.getBoundingClientRect().right &&
                  element.scrollWidth <= element.clientWidth
                );
              }),
            ).toBe(true);
            await expect(
              page.getByRole("dialog", { name: "Save your API key" }),
            ).toBeVisible();
            // Boolean projection only: assertion diagnostics cannot print plaintext.
            expect(
              await page
                .getByTestId("revealed-api-key")
                .evaluate((element) =>
                  /^sk-map-api01-.+/.test(element.textContent ?? ""),
                ),
            ).toBe(true);
            break;
          default:
            if (
              surface.id.startsWith("native-owned-key-") ||
              surface.id.startsWith("native-environment-")
            )
              throw new Error(`Unwalked owned-key surface: ${surface.id}`);
        }
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            document
              .getAnimations()
              .filter((animation) =>
                Number.isFinite(
                  animation.effect?.getComputedTiming().iterations,
                ),
              )
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: join(dir, `${surface.id}.png`),
          fullPage: true,
          mask: [
            page.getByTestId("revealed-api-key"),
            page.getByTestId("revealed-key"),
          ],
        });
        walked.push(surface.id);
        if (surface.id === "native-owned-key-reveal")
          await page.getByTestId("close-revealed-api-key").click();
        if (surface.id === "native-environment-cloud-key-reveal")
          await page.getByTestId("close-revealed-key").click();
        if (releaseWrite) {
          const response = page.waitForResponse(
            (r) =>
              r.request().method() !== "GET" &&
              new URL(r.url()).pathname.startsWith(
                surface.route === "/members"
                  ? `${org}/members`
                  : serviceAccountsPath,
              ),
          );
          releaseWrite();
          expect((await response).ok()).toBe(true);
          await expect(
            page.getByRole("button", {
              name:
                surface.route === "/members"
                  ? "Create local member"
                  : "Create service account",
              exact: true,
            }),
          ).toBeEnabled();
        }
      } finally {
        releaseWrite?.();
        await page.unrouteAll({ behavior: "wait" });
      }
    });
  }
  expect(walked).toEqual(selected.map((surface) => surface.id));
  writeFileSync(
    join(dir, "walked.json"),
    JSON.stringify(
      {
        browser: "chrome",
        theme: info.project.name,
        surfaces: walked,
        revealMasked: true,
        horizontalOverflow: false,
      },
      null,
      2,
    ),
  );
});
