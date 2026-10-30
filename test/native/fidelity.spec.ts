import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { NATIVE_SURFACES } from "../fidelity/native-surfaces";
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
  for (const surface of NATIVE_SURFACES) {
    await test.step(surface.id, async () => {
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
      if (surface.id === "native-oidc-login") {
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
        await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
      } else {
        if (surface.id === "native-no-resources") {
          const signedIn = await request.post("/api/auth/login", {
            headers: { origin: "http://127.0.0.1:38200" },
            data: { login_name: "shot-user", password },
          });
          expect(signedIn.status(), await signedIn.text()).toBe(200);
        }
        await page.goto(surface.route);
        if (surface.route === "/login" || surface.route === "/setup")
          await expect(
            page.getByLabel(
              surface.route === "/login" ? "Login name" : "Setup code",
            ),
          ).toBeVisible();
        else await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
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
        if (surface.id === "native-no-resources")
          await expect(page.locator("[data-no-resource-access]")).toBeVisible();
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
          await page.getByRole("button", { name: "Remove shot-admin" }).click();
          await page.getByRole("button", { name: "Confirm removal" }).click();
          await expect(page.locator("p[role=alert]")).toContainText("last");
        }
        if (surface.id === "native-service-accounts") {
          await page.getByLabel("Include archived").check();
          await expect(
            page.getByText("release-bot", { exact: true }),
          ).toBeVisible();
          await expect(page.locator('[data-status="archived"]')).toBeVisible();
        }
        if (surface.id === "native-service-account-edit") {
          await page.getByRole("button", { name: "Edit release-bot" }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
        }
      }
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          document
            .getAnimations()
            .filter((animation) =>
              Number.isFinite(animation.effect?.getComputedTiming().iterations),
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
      });
      if (surface.id === "native-members-loading")
        await page.unrouteAll({ behavior: "wait" });
    });
  }
});
