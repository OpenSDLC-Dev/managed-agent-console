import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NativeAuth } from "./native-auth";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.consoleAuth;
});
function mock(mode = "password", status = 401) {
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/auth/config"
      ? Response.json({ mode, native_login: true })
      : url === "/api/auth/session"
        ? new Response(null, {
            status: 401,
            headers: { "x-platform-signed-out": "1" },
          })
        : Response.json(
            {
              error: {
                type: "invalid_request_error",
                message:
                  status === 409
                    ? "an active local administrator already exists"
                    : "credentials refused",
              },
            },
            { status },
          ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("native password login sends login_name and clears the password after a refused request", async () => {
  const fetcher = mock();
  render(<NativeAuth />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Login name"), "alice");
  await user.type(screen.getByLabelText("Password"), "twelve-bytes-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "credentials refused",
  );
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(fetcher).toHaveBeenCalledWith(
    "/api/auth/login",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        login_name: "alice",
        password: "twelve-bytes-password",
      }),
    }),
  );
  expect(
    screen.queryByText("Enter the console password to continue."),
  ).not.toBeInTheDocument();
});
it("anonymous password setup uses code/name/password and displays the backend 409 without a bounce", async () => {
  const fetcher = mock("password", 409);
  render(<NativeAuth setup />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Setup code"), "setup-once");
  await user.type(screen.getByLabelText("Login name"), "admin");
  await user.type(screen.getByLabelText("Password"), "密码密码密码密码");
  await user.click(
    screen.getByRole("button", { name: "Create administrator" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "an active local administrator already exists",
  );
  expect(screen.getByLabelText("Setup code")).toHaveValue("");
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(fetcher).toHaveBeenCalledWith(
    "/api/console/organizations/default/setup_code/redeem",
    expect.objectContaining({
      body: JSON.stringify({
        code: "setup-once",
        login_name: "admin",
        password: "密码密码密码密码",
      }),
    }),
  );
});
it("OIDC is a top-level native link without return_to or a browser code exchange", async () => {
  mock("oidc");
  render(<NativeAuth />);
  expect(
    await screen.findByRole("link", { name: "Sign in with SSO" }),
  ).toHaveAttribute("href", "/api/auth/login");
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
});
it("trusted proxy uses native POST and no token entry", async () => {
  const fetcher = mock("trusted_proxy");
  render(<NativeAuth />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", {
      name: "Continue with organization account",
    }),
  );
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST", body: "{}" }),
    ),
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
it("disabled native login fails closed rather than offering a legacy form", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ mode: "disabled", native_login: false })),
  );
  render(<NativeAuth />);
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Native browser login is not enabled",
  );
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
});
it.each([
  { mode: "typo", native_login: true },
  { mode: "password", native_login: "true" },
])("probe: malformed native config fails closed: %j", async (config) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(config)),
  );
  render(<NativeAuth />);
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Native browser login is not enabled",
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("configuration outage does not expose legacy fallback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 502 })),
  );
  render(<NativeAuth />);
  expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 502");
  expect(
    screen.queryByRole("button", { name: "Sign in" }),
  ).not.toBeInTheDocument();
});

it("anonymous identity setup handles its optional missing session without a sign-out loop", async () => {
  mock("oidc");
  render(<NativeAuth setup />);
  expect(await screen.findByText(/Sign in before redeeming/)).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Setup code")).not.toBeInTheDocument();
});

it("native login does not reference a setup-only password hint", async () => {
  mock();
  render(<NativeAuth />);
  expect(await screen.findByLabelText("Password")).not.toHaveAttribute(
    "aria-describedby",
  );
});
