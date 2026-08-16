import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The palette's accessibility contract, asserted against `globals.css` itself.
 *
 * Issue #90 shipped unobserved for months because the only gate was an axe
 * pass over the handful of surfaces an e2e test happened to open, and none of
 * them rendered a destructive control. This test needs no browser: it reads
 * the tokens the stylesheet actually defines and computes the ratios, so a
 * palette edit that breaks AA reddens in `pnpm test`, not in a screenshot
 * someone looks at later.
 *
 * It covers the console's own tokens only. Contrast against a Tailwind colour
 * the console does not define — the amber approval banner — is left to the
 * axe pass in `test/e2e/a11y.spec.ts`, which measures what the browser
 * actually composited rather than what we believe Tailwind's amber is.
 */

// Vitest runs from the repo root; `import.meta.url` is not a file URL here.
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

// ---- just enough colour maths to compute a WCAG ratio -------------------
// Only the notations `globals.css` uses: hex, `oklch()`, `hsl()`.

type Rgb = [number, number, number];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** OKLCH -> sRGB, via OKLab (Björn Ottosson). */
function oklch(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => clamp01(fromLinear(v)) * 255) as Rgb;
}

function hsl(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const hp = (((h % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(hp) % 6;
  const t: Rgb[] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  return t[sector].map((v) => (v + m) * 255) as Rgb;
}

function parse(value: string): Rgb {
  const v = value.trim();

  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^oklch\(([^)]+)\)$/i.exec(v);
  if (m) {
    const [L, C, h] = m[1].trim().split(/\s+/).map(Number);
    return oklch(L, C, h);
  }
  m = /^hsla?\(([^)]+)\)$/i.exec(v);
  if (m) {
    // Any alpha in the token is dropped: where a colour is painted at an
    // alpha, the Tailwind utility (`/50`) sets it, and the caller composites.
    const [h, s, l] = m[1]
      .trim()
      .replace(/%/g, "")
      .split(/[\s,/]+/)
      .map(Number);
    return hsl(h, s, l);
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) {
    const [r, g, b] = m[1]
      .trim()
      .split(/[\s,/]+/)
      .map(Number);
    return [r, g, b];
  }
  throw new Error(`globals.test.ts cannot parse the colour ${value}`);
}

/** `fg` at `alpha` painted over the opaque `bg`. */
const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;

const luminance = ([r, g, b]: Rgb) =>
  0.2126 * toLinear(r / 255) +
  0.7152 * toLinear(g / 255) +
  0.0722 * toLinear(b / 255);

function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- the tokens, read out of the stylesheet -----------------------------

/** Custom properties declared in the given selector's block. */
function tokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in globals.css`);
  const body = CSS.slice(start, CSS.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm))
    out[name] = value.trim();
  return out;
}

const THEMES = {
  light: { vars: tokens(":root"), washes: [0.1, 0.2], fieldFill: 0 },
  /**
   * `fieldFill` is what a field paints inside its own border: nothing in
   * light (`bg-transparent`), and `dark:bg-input/30` in dark. That resolves to
   * **0.06**, not 0.3, because a Tailwind modifier *multiplies* the token's
   * own alpha rather than replacing it — `--input` is already `/ 0.2`, and
   * `bg-input/30` is `color-mix(in oklab, var(--input) 30%, transparent)`.
   * Measured in Chrome on the running console rather than reasoned about.
   */
  dark: { vars: tokens(".dark"), washes: [0.2, 0.3], fieldFill: 0.2 * 0.3 },
};

/**
 * The surfaces the danger palette is painted on, composited the way the DOM
 * composites them. Assuming `--popover` for the confirm dialog is the trap
 * this test exists to avoid: `DialogFooter` is `bg-muted/50`, which is a
 * *lighter* backdrop than the popover and so a harder contrast target — 0.26
 * of a ratio point harder, enough to be the difference between passing and
 * failing. Verified against axe's own measurement of the composited value.
 */
const surfaces = (vars: Record<string, string>) => ({
  "page background": parse(vars["--background"]),
  card: parse(vars["--card"]),
  popover: parse(vars["--popover"]),
  muted: parse(vars["--muted"]),
  sidebar: parse(vars["--sidebar"]),
  // ConfirmButton, ConfirmIconButton, ArchiveButton, DeleteButton all end here.
  "dialog footer": over(parse(vars["--muted"]), parse(vars["--popover"]), 0.5),
  // A transcript row under the cursor, and the selected one.
  "transcript row, hovered": over(
    parse(vars["--secondary"]),
    parse(vars["--background"]),
    0.4,
  ),
  "transcript row, selected": over(
    parse(vars["--secondary"]),
    parse(vars["--background"]),
    0.6,
  ),
});

/**
 * Where a destructive *wash* is painted, as opposed to bare text. Only two
 * places: the confirm dialog's footer, and the approval banner — whose amber
 * is a Tailwind colour the console does not define, so the axe pass owns it.
 * A destructive control placed anywhere else would need this list, and the
 * palette, revisited.
 */
const WASHED = ["dialog footer"];

const AA_TEXT = 4.5; // WCAG 2.1 1.4.3, normal-size text
const AA_NON_TEXT = 3; // WCAG 2.1 1.4.11, borders and focus rings

describe.each(Object.entries(THEMES))(
  "the %s palette",
  (_theme, { vars, washes, fieldFill }) => {
    const text = () => parse(vars["--destructive"]);
    const surface = () => parse(vars["--destructive-surface"]);
    const on = surfaces(vars);

    it.each(Object.keys(on))("reads destructive text on the %s", (where) => {
      expect(
        contrast(text(), on[where as keyof typeof on]),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });

    // The bug in #90: the label sits on a wash of the danger colour, so the two
    // must be compared against each other, not against the page. Both alphas —
    // the resting wash and the hover one — carry text, so both are asserted.
    it.each(WASHED.flatMap((w) => washes.map((a) => [w, a] as const)))(
      "reads destructive text on the %s under a wash at alpha %s",
      (where, alpha) => {
        const bg = over(surface(), on[where as keyof typeof on], alpha);
        expect(contrast(text(), bg)).toBeGreaterThanOrEqual(AA_TEXT);
      },
    );

    // A focus ring is a non-text indicator, so it owes 3:1 — and it is drawn
    // at an alpha, which is the whole point: asserting the opaque token would
    // pass while the ring the browser paints sits at 1.4:1. Every variant
    // including `destructive` inherits this one ring; the danger colour
    // deliberately does not tint it (see button.tsx).
    it.each(["page background", "card"])(
      "shows the focus ring against the %s",
      (where) => {
        const ring = over(
          parse(vars["--ring"]),
          on[where as keyof typeof on],
          0.5, // focus-visible:ring-ring/50
        );
        expect(
          contrast(ring, on[where as keyof typeof on]),
        ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      },
    );

    /**
     * The invalid-field border (issue #104) — the only place the console
     * paints the danger colour as a non-text indicator.
     *
     * It is drawn at **full opacity**, because nothing weaker arrives: the
     * floor for 3:1 is alpha 0.60 light and 0.81 dark, and against `--muted`
     * in dark no alpha reaches it at all. Upstream's `/20` halo and `/50` dark
     * border are therefore gone rather than re-tinted, which is also what the
     * reference draws — one full-strength line, `inset 0 0 0 1px
     * var(--cds-fill-danger)`, no alpha and no halo.
     *
     * A border has two adjacencies and both are asserted: the surface outside
     * the field, and the fill inside it. Only placements that actually render
     * invalid are listed — the login password field and the agent editor's raw
     * tab, the console's two per-field invalid states. An `<Input>` inside a
     * dialog is deliberately absent: it does not render invalid today, and it
     * would not pass, its dark fill putting the inner edge at 2.94:1. Wiring
     * one there means revisiting this.
     */
    it.each([
      ["login page, outside the field", () => on["page background"]],
      [
        "login password field, inside it",
        () => over(parse(vars["--input"]), on["page background"], fieldFill),
      ],
      // Raw tab: on the page when editing, in the create dialog when creating.
      ["agent editor raw tab, outside", () => on["popover"]],
      // That textarea paints its own opaque `bg-card`, not the field fill.
      ["agent editor raw tab, inside", () => parse(vars["--card"])],
    ])("shows the invalid-field border at the %s", (_where, bg) => {
      expect(contrast(surface(), bg())).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });

    it("keeps the wash distinct from the text colour", () => {
      // If these ever collapse to one value the #90 ceiling is back: a colour
      // cannot reach 4.5:1 against a tint of itself on a dark surface.
      expect(vars["--destructive"]).not.toBe(vars["--destructive-surface"]);
    });
  },
);
