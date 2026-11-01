import { expect, it } from "vitest";
import { NATIVE_SURFACES, selectNativeSurfaces } from "./native-surfaces";

it.each([undefined, ""])(
  "keeps the manifest default for selection %s",
  (selection) => {
    expect(selectNativeSurfaces(selection)).toEqual(NATIVE_SURFACES);
  },
);
it("selects a valid subset in manifest order", () => {
  expect(
    selectNativeSurfaces("native-last-admin,native-password-login").map(
      (s) => s.id,
    ),
  ).toEqual(["native-password-login", "native-last-admin"]);
});
it.each(["native-last-admn", "native-last-admin,native-last-admn"])(
  "probe: rejects every invalid fidelity entry in %s",
  (selection) => {
    expect(() => selectNativeSurfaces(selection)).toThrow(/native-last-admn/);
  },
);
