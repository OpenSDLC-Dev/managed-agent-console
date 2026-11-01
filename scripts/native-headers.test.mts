// @vitest-environment node
import { expect, it } from "vitest";
import { credentialHeaders } from "../test/native/credential-headers";
const origin = "http://127.0.0.1:38201";
const check = (url: string, headers: Record<string, string>) =>
  expect(credentialHeaders(origin, url, headers)).toEqual([]);
it.each(["x-api-key", "Authorization"])(
  "probe: OIDC browser oracle rejects synthetic %s without recording values",
  (name) => {
    expect(() =>
      check(`${origin}/api/auth/session`, { [name]: "synthetic" }),
    ).toThrow();
    expect(
      credentialHeaders(origin, `${origin}/api/auth/session`, {
        [name]: "synthetic",
      }),
    ).toEqual([name]);
  },
);
it.each([
  "http://127.0.0.1:38130/authorize",
  "http://127.0.0.1:38200/api/auth/session",
  "http://unrelated.example.test/callback?next=http://127.0.0.1:38201",
])("OIDC browser oracle ignores IdP or unrelated origin %s", (url) => {
  check(url, { "x-api-key": "synthetic", Authorization: "synthetic" });
});
it("OIDC browser oracle admits cookie/CSRF requests at its application origin", () => {
  check(`${origin}/api/auth/session`, {
    cookie: "synthetic",
    "x-csrf-token": "synthetic",
  });
});
