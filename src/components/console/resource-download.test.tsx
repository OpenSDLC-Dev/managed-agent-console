import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ResourceDownload } from "./resource-download";
import {
  hasBouncedToLogin,
  resetSignedOutBounceForTests,
} from "@/lib/identity/signed-out";

vi.mock("@/lib/platform/toast-error", () => ({ toastPlatformError: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.consoleAuth;
  resetSignedOutBounceForTests();
});
it("native downloads select the private lane and save a binary blob with its filename", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  const create = vi.fn((blob: Blob) => {
      expect(blob.size).toBe(4);
      return "blob:synthetic";
    }),
    revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  const saved: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
  const fetcher = vi.fn(
    async () =>
      new Response(new Uint8Array([0, 1, 255, 10]), {
        headers: { "content-type": "application/octet-stream" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <ResourceDownload path="v1/files/file_a/content" filename="output.bin">
      Download
    </ResourceDownload>,
  );
  fireEvent.click(screen.getByRole("link"));
  await waitFor(() => expect(saved).toEqual(["output.bin"]));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/organizations/default/proxy/v1/files/file_a/content",
  );
  expect(create.mock.calls[0][0]).toMatchObject({
    size: 4,
    type: "application/octet-stream",
  });
  expect(revoke).toHaveBeenCalledWith("blob:synthetic");
});
it.each([401, 403])(
  "probe: a marked native download refusal %i leaves the identity boundary without saving an error as a file",
  async (status) => {
    document.documentElement.dataset.consoleAuth = "platform";
    const assign = vi.fn();
    vi.stubGlobal(
      "window",
      Object.create(window, {
        location: { value: { pathname: "/files", search: "", assign } },
      }),
    );
    const save = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { type: "authentication_error", message: "signed out" } },
          { status, headers: { "x-platform-signed-out": "1" } },
        ),
      ),
    );
    render(
      <ResourceDownload path="v1/files/file_a/content" filename="output.bin">
        Download
      </ResourceDownload>,
    );
    fireEvent.click(screen.getByRole("link"));
    await waitFor(() => expect(hasBouncedToLogin()).toBe(true));
    expect(assign).toHaveBeenCalledExactlyOnceWith("/login?return_to=%2Ffiles");
    expect(save).not.toHaveBeenCalled();
  },
);
it("legacy downloads keep their original BFF link and download attribute", () => {
  render(
    <ResourceDownload path="v1/skills/skill_a/content" filename="skill.zip">
      Download
    </ResourceDownload>,
  );
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "/api/platform/v1/skills/skill_a/content",
  );
  expect(screen.getByRole("link")).toHaveAttribute("download", "skill.zip");
});
