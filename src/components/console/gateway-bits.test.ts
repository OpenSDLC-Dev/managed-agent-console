import { describe, expect, it } from "vitest";
import { isPlainHttp } from "./gateway-bits";

describe("isPlainHttp", () => {
  // validate.go checkEndpoint parses the scheme case-insensitively but stores
  // the endpoint as typed, so an upper-case scheme reaches the console.
  it.each([
    ["http://vllm.models.svc:8000/v1", true],
    ["HTTP://vllm.models.svc:8000/v1", true],
    ["Http://vllm.models.svc:8000/v1", true],
    ["https://api.deepseek.com", false],
    ["HTTPS://api.deepseek.com", false],
  ])("%s → %s", (url, plain) => {
    expect(isPlainHttp(url)).toBe(plain);
  });
});
