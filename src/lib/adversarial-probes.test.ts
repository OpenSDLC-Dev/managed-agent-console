// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The meta-test (plan 04 slice 2, decision 7).
 *
 * The workshop sample's rule is "every unit declares a probe fixture" — across
 * 58 test files here that would be busywork. Decision 7 narrows it to where
 * adversarial input *actually arrives*: input the console does not author and
 * cannot assume well-formed. That is two seams — the SSE/seed reconciliation
 * layer and wire parsing — plus the surface that renders whatever they produce.
 *
 * A suite of only happy-path assertions passes just as loudly when a surface is
 * broken as when it works, and the drift is silent: nobody deletes coverage on
 * purpose, it erodes one refactor at a time. This test makes that erosion loud.
 *
 * **Convention:** an adversarial test is named `probe: …` (or sits in a
 * `probe: …` describe block). Adding one is the whole cost of keeping a seam
 * honest.
 */

const PROBE = /\b(it|test|describe)\(\s*[`"']probe:/;

interface Seam {
  label: string;
  dir: string;
  /** Source modules in this seam that adversarial input reaches. */
  modules: string[];
}

const SEAMS: Seam[] = [
  {
    label:
      "SSE / seed reconciliation — a stream may drop, reorder, or duplicate anything",
    dir: "src/lib/session-trace",
    // `store` reconciles the stream; `summary` and `timing` read wire fields
    // off whatever it produced, which is where a missing one turns into a
    // wrong rendered value. `sse`/`use-*` are transport and clock — covered,
    // but not the place malformed *content* lands.
    modules: ["store", "summary", "timing"],
  },
  {
    label: "wire parsing — the shapes a platform actually renders",
    dir: "src/lib/platform",
    modules: ["schemas"],
  },
  {
    label: "the trace surface — renders whatever the two seams above produce",
    dir: "src/app/(console)/sessions/[id]",
    modules: ["page"],
  },
];

const testFilesIn = (dir: string) =>
  readdirSync(join(process.cwd(), dir))
    .filter((name) => /\.test\.tsx?$/.test(name))
    .map((name) => ({
      name,
      source: readFileSync(join(process.cwd(), dir, name), "utf8"),
    }));

describe("adversarial-input seams keep their probe coverage", () => {
  for (const seam of SEAMS) {
    describe(seam.dir, () => {
      const files = testFilesIn(seam.dir);

      it("has test files at all", () => {
        expect(files.length, `no tests found in ${seam.dir}`).toBeGreaterThan(
          0,
        );
      });

      for (const target of seam.modules) {
        it(`\`${target}\` carries at least one probe — ${seam.label}`, () => {
          const covering = files.filter(
            (file) =>
              PROBE.test(file.source) &&
              new RegExp(`from "\\./${target}"`).test(file.source),
          );
          expect(
            covering.map((f) => f.name),
            `No probe test imports ./${target} in ${seam.dir}.\n` +
              `This seam takes input the console did not author, so happy-path ` +
              `coverage alone cannot tell a working surface from a broken one.\n` +
              `Add a test named "probe: …" that asserts honest degradation.`,
          ).not.toHaveLength(0);
        });
      }
    });
  }

  it("the probe convention matches something (the matcher itself is not dead)", () => {
    // Guards the inverse failure: a typo'd regex would make every check above
    // pass vacuously the moment it stopped matching anything.
    const all = SEAMS.flatMap((seam) => testFilesIn(seam.dir));
    const probed = all.filter((file) => PROBE.test(file.source));
    expect(probed.length).toBeGreaterThanOrEqual(SEAMS.length);
  });
});
