import { expect, test, type Locator } from "@playwright/test";
import { grantDashboardModelDiscovery } from "./dashboard-fixture";
import { signIn } from "./sign-in";

const workspace = "/workspaces/default";

// Resolve CSS colors through the browser, including custom properties and color-mix().
function rgb(
  node: Locator,
  property: "color" | "backgroundColor" | "fill" | "stroke" = "color",
) {
  return node.evaluate((element, name) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = getComputedStyle(element)[name];
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
  }, property);
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

for (const scheme of ["light", "dark"] as const) {
  test(`charts and resource icons carry their colors in ${scheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    const [volumeRed, volumeGreen] = await rgb(
      page.locator('[data-dashboard-metric="tokens"] rect').first(),
      "fill",
    );
    expect(volumeGreen - volumeRed).toBeGreaterThan(35);
    const [cacheRed, , cacheBlue] = await rgb(
      page
        .getByRole("img", { name: /Cache read tokens per UTC day/ })
        .locator("path"),
      "stroke",
    );
    expect(cacheBlue - cacheRed).toBeGreaterThan(35);
    await page.goto(workspace + "/agents-overview");
    const resources = page
      .getByRole("heading", { name: "Resources", exact: true })
      .locator("..");
    const [r, , b] = await rgb(
      resources.getByRole("link").first().locator("svg").first(),
    );
    expect(b - r).toBeGreaterThan(35);
    const sessions = page.getByRole("figure", { name: "Sessions over time" });
    expect(
      await rgb(sessions.locator("figcaption i").first(), "backgroundColor"),
    ).toEqual(
      await rgb(sessions.locator("[data-day] i").first(), "backgroundColor"),
    );
    await page.goto("/usage");
    const chart = page
      .getByRole("list", { name: "Cost per day" })
      .locator("..")
      .locator("..");
    const legend = chart.getByLabel("Cost series").locator("i[data-series]");
    await expect(legend.first()).toBeVisible();
    const swatches = await Promise.all(
      (await legend.all()).map((swatch) => rgb(swatch, "backgroundColor")),
    );
    expect(
      new Set(swatches.map((color) => color.join(","))).size,
    ).toBeGreaterThan(1);
    for (const [i, color] of swatches.entries()) {
      expect(
        await rgb(
          chart.locator(`[data-day] [data-series="${i}"]`).first(),
          "backgroundColor",
        ),
      ).toEqual(color);
    }
    const costs = chart.locator("[data-day]");
    await costs.first().focus();
    await page.keyboard.press("Tab");
    const focused = costs.nth(1);
    await expect(focused).toBeFocused();
    const tooltip = chart.getByRole("tooltip");
    const focusedValue = await tooltip.innerText();
    await costs.last().hover();
    await expect(tooltip).not.toHaveText(focusedValue);
    await expect(focused).toHaveCSS("outline-style", "solid");
    await expect(focused).toHaveCSS("outline-width", "2px");
    await chart.locator("figcaption").hover();
    await expect(tooltip).toHaveText(focusedValue);
    const totals = () =>
      costs.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-cost")),
      );
    const original = await totals();
    await page
      .getByRole("combobox", { name: "Group by", exact: true })
      .selectOption("principal_id");
    await expect(page.locator("table[data-by=principal_id]")).toBeVisible();
    expect(await totals()).toEqual(original);
  });

  test(`editing and copying Raw YAML preserves the highlighted source in ${scheme} mode`, async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signIn(page, workspace + "/agents/new");
    await page.getByRole("radio", { name: "raw", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Raw agent config" });
    const source = 'name: "Café <script>"\ncount: 12\nenabled: true\n';
    await input.fill(source);
    const code = page.locator('[aria-hidden="true"] [data-language="yaml"]');
    await expect(code).toHaveText(source, { useInnerText: false });
    expect(await code.textContent()).toBe(source);
    const key = await rgb(code.locator(".token.key").first());
    const string = await rgb(code.locator(".token.string").first());
    expect(key[0]).toBeGreaterThan(key[1]);
    expect(string[1]).toBeGreaterThan(string[0]);
    await page.getByRole("button", { name: "Copy configuration" }).click();
    await expect(
      page.getByText("Configuration copied", { exact: true }),
    ).toBeVisible();
    // The Windows clipboard stores CRLF; the native editor restores its LF text on paste.
    await input.fill("");
    await input.press("ControlOrMeta+v");
    await expect(input).toHaveValue(source);
    await page.emulateMedia({ forcedColors: "active" });
    await expect(input).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
    await expect(code).toBeHidden();
  });
}

test("Playground keeps cURL and JSON source aligned through editing, scrolling and forced colors", async ({
  page,
}) => {
  await grantDashboardModelDiscovery(page);
  await signIn(page, workspace + "/playground");
  await page.getByRole("main").getByText("Code", { exact: true }).click();
  const curl = page.getByRole("textbox", { name: "cURL request code" });
  const shell = page.locator(
    'pre[aria-hidden="true"] code[data-language=bash]',
  );
  expect(await shell.textContent()).toBe(await curl.inputValue());
  expect(await shell.locator(".token.string").count()).toBeGreaterThan(0);
  await page.getByLabel("Code language").selectOption("JSON");
  const editor = page.getByRole("textbox", { name: "JSON request code" });
  const code = page.locator('pre[aria-hidden="true"] code[data-language=json]');
  const source = JSON.stringify(
    {
      model: "default",
      messages: Array.from({ length: 42 }, (_, i) => ({
        role: "user",
        content: i + "x".repeat(220),
      })),
    },
    null,
    2,
  );
  await editor.fill(source);
  expect(await code.textContent()).toBe(source);
  // A native resize can reach the textarea's CSS minimum. Its client area
  // excludes the border and any scrollbars, even at that minimum.
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.style.height = "0px";
  });
  await expect
    .poll(() =>
      editor.evaluate(
        (input: HTMLTextAreaElement) =>
          input.parentElement!.querySelector("pre")!.clientHeight -
          input.clientHeight,
      ),
    )
    .toBe(0);
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.scrollTop = element.scrollHeight;
    element.scrollLeft = element.scrollWidth;
  });
  await expect
    .poll(() =>
      editor.evaluate((input: HTMLTextAreaElement) => {
        const mirror = input.parentElement!.querySelector("pre")!;
        return (
          input.scrollTop > 0 &&
          input.scrollLeft > 0 &&
          Math.abs(mirror.scrollTop - input.scrollTop) <= 1 &&
          Math.abs(mirror.scrollLeft - input.scrollLeft) <= 1
        );
      }),
    )
    .toBe(true);
  await editor.press("ControlOrMeta+End");
  await editor.press("Tab");
  await expect(editor).toHaveValue(source + "  ");
  await expect(editor).toBeFocused();
  await editor.press("Escape");
  await editor.press("Tab");
  await expect(editor).not.toBeFocused();
});
