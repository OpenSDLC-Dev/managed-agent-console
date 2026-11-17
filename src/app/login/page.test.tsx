import { expect, it } from "vitest";
import { NativeAuth } from "@/components/console/native-auth";
import LoginPage from "./page";

it("uses platform-owned login without a local credential form", () => {
  expect(LoginPage().type).toBe(NativeAuth);
});
