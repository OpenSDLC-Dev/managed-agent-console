// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { consolePassword, platformApiKey, platformBaseUrl } from "./env";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("platformBaseUrl", () => {
  it("returns the configured base URL", () => {
    vi.stubEnv("PLATFORM_BASE_URL", "http://localhost:8080");
    expect(platformBaseUrl()).toBe("http://localhost:8080");
  });

  it("strips trailing slashes", () => {
    vi.stubEnv("PLATFORM_BASE_URL", "http://localhost:8080///");
    expect(platformBaseUrl()).toBe("http://localhost:8080");
  });

  it("throws when unset", () => {
    vi.stubEnv("PLATFORM_BASE_URL", undefined);
    expect(() => platformBaseUrl()).toThrow("PLATFORM_BASE_URL is not set");
  });
});

describe("platformApiKey", () => {
  it("returns the configured key", () => {
    vi.stubEnv("PLATFORM_API_KEY", "sk-test-key");
    expect(platformApiKey()).toBe("sk-test-key");
  });

  it("throws when unset", () => {
    vi.stubEnv("PLATFORM_API_KEY", undefined);
    expect(() => platformApiKey()).toThrow("PLATFORM_API_KEY is not set");
  });
});

describe("consolePassword", () => {
  it("returns the configured password", () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    expect(consolePassword()).toBe("hunter2");
  });

  it("returns undefined when unset (login gate disabled)", () => {
    vi.stubEnv("CONSOLE_PASSWORD", undefined);
    expect(consolePassword()).toBeUndefined();
  });

  it("treats an empty string as unset", () => {
    vi.stubEnv("CONSOLE_PASSWORD", "");
    expect(consolePassword()).toBeUndefined();
  });
});
