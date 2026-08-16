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
/** A token as written: its colour, and the alpha it carries itself. */
type Rgba = [number, number, number, number];

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

/**
 * A token's colour **and its own alpha**. Keeping the alpha is the whole
 * point: this used to drop it, on the reasoning that a Tailwind modifier
 * (`/50`) sets the alpha and the caller composites. It does not — a v4
 * modifier is `color-mix(in oklab, var(--token) 50%, transparent)`, which
 * *multiplies* whatever alpha the token already carries. Dropping it modelled
 * a focus ring painted at 0.15 as one painted at 0.5, and so reported a
 * 1.39:1 indicator as 3.67:1 ([#110]).
 *
 * [#110]: https://github.com/OpenSDLC-Dev/managed-agent-console/issues/110
 */
function parse(value: string): Rgba {
  const v = value.trim();

  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = /^oklch\(([^)]+)\)$/i.exec(v);
  if (m) {
    const [L, C, h, a] = m[1].trim().split(/[\s/]+/);
    return [...oklch(Number(L), Number(C), Number(h)), opacity(a)];
  }
  m = /^hsla?\(([^)]+)\)$/i.exec(v);
  if (m) {
    // `parseFloat` off the `%` on saturation and lightness; the alpha is read
    // by `opacity`, which is the one component where `50%` and `50` differ.
    const [h, s, l, a] = m[1].trim().split(/[\s,/]+/);
    return [...hsl(Number(h), parseFloat(s), parseFloat(l)), opacity(a)];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) {
    const [r, g, b, a] = m[1].trim().split(/[\s,/]+/);
    return [Number(r), Number(g), Number(b), opacity(a)];
  }
  throw new Error(`globals.test.ts cannot parse the colour ${value}`);
}

/**
 * An alpha as CSS may write it — absent, `0.4`, or `40%`. It throws rather
 * than yielding `NaN` or a 100×-too-large number, because a wrong alpha here
 * does not fail: it quietly rescales a ratio, which is #110 in one component.
 */
function opacity(raw: string | undefined): number {
  if (raw === undefined) return 1;
  // `Number("")` is 0, so an empty component — `hsl(0 0% 0% /)` — would model
  // as fully transparent instead of failing.
  if (raw.trim() === "")
    throw new Error(`globals.test.ts cannot read the alpha ${raw}`);
  const n = raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  if (!(n >= 0 && n <= 1))
    throw new Error(`globals.test.ts cannot read the alpha ${raw}`);
  return n;
}

/**
 * A token that must be opaque — a surface painted over, or a colour that is
 * read rather than composited. It throws rather than dropping an alpha,
 * because dropping one silently is what #110 was.
 */
function solid(value: string): Rgb {
  const [r, g, b, a] = parse(value);
  if (a !== 1)
    throw new Error(`globals.test.ts expected ${value} to be opaque, got ${a}`);
  return [r, g, b];
}

/**
 * `fg` painted over the opaque `bg`, at the alpha the browser actually paints:
 * the token's own alpha times the Tailwind modifier applied to it, if any.
 */
const over = (fg: readonly number[], bg: Rgb, modifier = 1): Rgb => {
  const alpha = (fg[3] ?? 1) * modifier;
  return bg.map((c, i) => fg[i] * alpha + c * (1 - alpha)) as Rgb;
};

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
   * `fieldFill` is the modifier on what a field paints inside its own border:
   * nothing in light (`bg-transparent`), `dark:bg-input/30` in dark. `over()`
   * multiplies it by `--input`'s own `/ 0.2`, so the fill lands at **0.06** —
   * the value Chrome paints, and the one the `login-invalid` shot samples.
   */
  dark: { vars: tokens(".dark"), washes: [0.2, 0.3], fieldFill: 0.3 },
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
  "page background": solid(vars["--background"]),
  card: solid(vars["--card"]),
  popover: solid(vars["--popover"]),
  muted: solid(vars["--muted"]),
  sidebar: solid(vars["--sidebar"]),
  // ConfirmButton, ConfirmIconButton, ArchiveButton, DeleteButton all end here.
  "dialog footer": over(parse(vars["--muted"]), solid(vars["--popover"]), 0.5),
  // A transcript row under the cursor, and the selected one.
  "transcript row, hovered": over(
    parse(vars["--secondary"]),
    solid(vars["--background"]),
    0.4,
  ),
  "transcript row, selected": over(
    parse(vars["--secondary"]),
    solid(vars["--background"]),
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
    const text = () => solid(vars["--destructive"]);
    const surface = () => solid(vars["--destructive-surface"]);
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

    // A focus ring is a non-text indicator, so it owes 3:1 — measured on what
    // Chrome paints, which is `--ring`'s own alpha times the modifier. That
    // product is why #110 shipped at 1.39:1 under a model that read 3.67:1,
    // and why `--ring` is now opaque: the halo is the only half of the
    // indicator that survives on a `default` Button, whose focused border
    // turns `--ring` against a fill of the same colour. Every variant
    // including `destructive` inherits this one ring; the danger colour
    // deliberately does not tint it (see button.tsx).
    // 0.5 is the modifier in `focus-visible:ring-ring/50`, not the alpha.
    const halo = (bg: Rgb) => over(parse(vars["--ring"]), bg, 0.5);

    // Every surface, not the two this checked before: the tightest margins are
    // not on the page (3.25:1 on dark `--muted`, 3.44:1 on the dialog footer),
    // and a ring that clears 3:1 in the two easy places is what #110 looked
    // like from inside the test.
    it.each(Object.keys(on))("shows the focus ring against the %s", (where) => {
      const bg = on[where as keyof typeof on];
      expect(contrast(halo(bg), bg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });

    // The inner edge, on the one control where it is the only edge there is.
    // A `default` Button's focused border turns `--ring` against a fill of the
    // same colour — 1.00:1 light, 1.31:1 dark — so the halo outside it carries
    // the whole indicator, at 3.71:1 dark: the narrowest margin in the set,
    // and the reason this fix could not have been a thinner opaque line.
    it("shows the focus ring against a default Button's own fill", () => {
      expect(
        contrast(halo(on["page background"]), solid(vars["--primary"])),
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });

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
      ["agent editor raw tab, inside", () => solid(vars["--card"])],
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
