import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";

function stubClipboard(writeText: (() => Promise<void>) | undefined) {
  Object.defineProperty(window.navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

function stubExecCommand(impl: () => boolean) {
  Object.defineProperty(document, "execCommand", {
    value: impl,
    configurable: true,
  });
}

afterEach(() => {
  delete (window.navigator as { clipboard?: unknown }).clipboard;
  delete (document as { execCommand?: unknown }).execCommand;
  document.body.innerHTML = "";
});

describe("copyText", () => {
  it("uses the async Clipboard API when available", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    await expect(copyText("req_123")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("req_123");
  });

  it("falls back to a transient textarea when the Clipboard API is missing", async () => {
    stubClipboard(undefined);
    let selectedValue: string | undefined;
    stubExecCommand(
      vi.fn(() => {
        selectedValue = document.querySelector("textarea")?.value;
        return true;
      }),
    );
    await expect(copyText("plain-http")).resolves.toBe(true);
    expect(selectedValue).toBe("plain-http");
    // The textarea is transient — removed after the copy.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the Clipboard API rejects (insecure origin)", async () => {
    stubClipboard(
      vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    );
    stubExecCommand(() => true);
    await expect(copyText("text")).resolves.toBe(true);
  });

  it("returns false when execCommand reports failure", async () => {
    stubClipboard(undefined);
    stubExecCommand(() => false);
    await expect(copyText("text")).resolves.toBe(false);
  });

  it("returns false when the legacy path throws", async () => {
    stubClipboard(undefined);
    stubExecCommand(() => {
      throw new Error("not supported");
    });
    await expect(copyText("text")).resolves.toBe(false);
  });
});
