import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test, expect } from "./test";
import { selectNativeSurfaces } from "../fidelity/native-surfaces";
const selected = selectNativeSurfaces(process.env.NATIVE_FIDELITY_IDS);
const org = "/api/console/organizations/default";
const password = "native-shot-password-123";

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
  const mapped = spawnSync(
    "docker",
    [
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
    ],
    { encoding: "utf8" },
  );
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
          await page.goto(surface.route);
          if (surface.route === "/login" || surface.route === "/setup")
            await expect(
              page.getByLabel(
                surface.route === "/login" ? "Login name" : "Setup code",
              ),
            ).toBeVisible();
          else await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
          if (surface.id === "native-owned-key-list") {
            await expect(
              page.locator(`[data-owner-id="${session.id}"]`).first(),
            ).toBeVisible();
            await expect(
              page.locator(`[data-owner-id="${service.id}"]`).first(),
            ).toBeVisible();
          } else if (surface.id === "native-owned-key-form") {
            await page
              .getByRole("button", { name: "Create key", exact: true })
              .click();
          } else if (surface.id === "native-owned-key-dashboard-form") {
            await page
              .getByRole("button", { name: "Get API key", exact: true })
              .click();
          } else if (surface.id === "native-owned-key-owner-picker") {
            await page
              .getByRole("button", { name: "Create key", exact: true })
              .click();
            await expect(
              page.getByLabel("Owner").locator(`option[value="${service.id}"]`),
            ).toHaveCount(1);
            await page.getByLabel("Owner").selectOption(service.id);
            await page.getByLabel("Owner").focus();
          } else if (surface.id === "native-owned-key-reveal") {
            await page
              .getByRole("button", { name: "Create key", exact: true })
              .click();
            await page
              .getByLabel("Name", { exact: true })
              .fill(`shot-reveal-${info.project.name}`);
            const issuance = page.waitForResponse(
              (response) =>
                response.url().endsWith(keyPath) &&
                response.request().method() === "POST",
            );
            await page
              .getByRole("button", { name: "Add", exact: true })
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
          if (surface.id.includes("pending")) {
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
            } else if (surface.id.endsWith("pending-create")) {
              const isMember = surface.route === "/members";
              await page
                .getByRole("button", {
                  name: isMember
                    ? "Create local member"
                    : "Create service account",
                  exact: true,
                })
                .click();
              await page
                .getByLabel(isMember ? "Login name" : "Name", { exact: true })
                .fill(`new-${target}`);
              if (isMember)
                await page
                  .getByLabel("Password", { exact: true })
                  .fill(password);
              await page
                .getByRole("button", {
                  name: isMember ? "Create member" : "Create account",
                  exact: true,
                })
                .click();
            } else if (surface.id.endsWith("pending-update")) {
              await page
                .getByRole("button", { name: `Edit ${target}`, exact: true })
                .click();
              await page.getByLabel("Description").fill("Pending description");
              await page
                .getByRole("button", { name: "Save account", exact: true })
                .click();
            } else {
              await page
                .getByRole("button", { name: `Archive ${target}`, exact: true })
                .click();
              await page
                .getByRole("button", { name: "Confirm archive", exact: true })
                .click();
            }
            await writeArrived;
            if (surface.id !== "native-members-pending-role")
              await page
                .getByRole("button", { name: "Cancel", exact: true })
                .click();
            const trigger = page.getByRole("button", {
              name:
                surface.route === "/members"
                  ? "Create local member"
                  : "Create service account",
              exact: true,
            });
            await expect(trigger).toBeDisabled();
            if (
              surface.id.endsWith("pending-create") ||
              surface.id.endsWith("pending-update")
            ) {
              await expect(trigger).toBeFocused();
              await trigger.press("Enter");
              await trigger.press("Space");
              await trigger.dispatchEvent("click");
              await expect(page.getByRole("dialog")).toHaveCount(0);
            }
            await expect(page.getByRole("dialog")).toHaveCount(0);
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
            await page.getByLabel("Include archived").check();
            await expect(
              page.getByText("release-bot", { exact: true }),
            ).toBeVisible();
            await expect(
              page
                .getByRole("row", { name: /retired-bot/ })
                .locator('[data-status="archived"]'),
            ).toBeVisible();
          }
          if (surface.id === "native-service-account-edit") {
            await page
              .getByRole("button", { name: "Edit release-bot" })
              .click();
            await expect(page.getByRole("dialog")).toBeVisible();
          }
        }
        // These assertions are independent of the interaction branches above.
        // Removing an interaction must fail, not produce a mislabeled list shot.
        switch (surface.id) {
          case "native-owned-key-list":
            await expect(
              page.getByRole("columnheader", { name: "Owner", exact: true }),
            ).toBeVisible();
            await expect(
              page.getByRole("columnheader", {
                name: "Created by",
                exact: true,
              }),
            ).toBeVisible();
            break;
          case "native-owned-key-form":
          case "native-owned-key-dashboard-form":
            await expect(
              page.getByRole("dialog", { name: "Create API key" }),
            ).toBeVisible();
            await expect(page.getByLabel("Owner")).toHaveValue(session.id);
            break;
          case "native-owned-key-owner-picker":
            await expect(page.getByLabel("Owner")).toHaveValue(service.id);
            await expect(
              page.getByLabel("Owner").locator(`option[value="${retired.id}"]`),
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
            if (surface.id.startsWith("native-owned-key-"))
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
          mask: [page.getByTestId("revealed-api-key")],
        });
        walked.push(surface.id);
        if (surface.id === "native-owned-key-reveal")
          await page.getByTestId("close-revealed-api-key").click();
        if (releaseWrite) {
          releaseWrite();
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
