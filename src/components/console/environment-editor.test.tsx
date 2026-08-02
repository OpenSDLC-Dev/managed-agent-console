import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps, ReactNode } from "react";
import {
  EnvironmentEditor,
  formFromEnvironment,
  newEnvForm,
} from "./environment-editor";
import type { Environment, Packages } from "@/lib/platform/types";

const { pushSpy, backSpy } = vi.hoisted(() => ({
  pushSpy: vi.fn(),
  backSpy: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: backSpy,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/environments",
  useSearchParams: () => new URLSearchParams(),
}));

// base-ui's Select needs real pointer geometry; replace it with a flat mock
// that renders items as buttons wired to onValueChange (vendored ui/ is
// excluded from coverage, so nothing under test is lost).
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Ctx = React.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
  }>({});

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children?: ReactNode;
  }) {
    return (
      <Ctx.Provider value={{ value, onValueChange }}>
        <div data-slot="mock-select">{children}</div>
      </Ctx.Provider>
    );
  }

  function SelectTrigger({
    children,
    disabled,
    "aria-label": ariaLabel,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    "aria-label"?: string;
    size?: string;
    className?: string;
  }) {
    return (
      <button type="button" aria-label={ariaLabel} disabled={disabled}>
        {children}
      </button>
    );
  }

  function SelectValue() {
    const { value } = React.useContext(Ctx);
    return <span>{value}</span>;
  }

  function SelectContent({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  }

  function SelectItem({
    value,
    children,
  }: {
    value: string;
    children?: ReactNode;
  }) {
    const { onValueChange } = React.useContext(Ctx);
    return (
      <button type="button" onClick={() => onValueChange?.(value)}>
        {children}
      </button>
    );
  }

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

const emptyPackages: Packages = {
  apt: [],
  cargo: [],
  gem: [],
  go: [],
  npm: [],
  pip: [],
};

const envBase = {
  type: "environment" as const,
  scope: "organization" as const,
  metadata: {},
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  archived_at: null,
};

const cloudLimitedEnv: Environment = {
  ...envBase,
  id: "env_1",
  name: "Prod",
  description: "Main",
  config: {
    type: "cloud",
    networking: {
      type: "limited",
      allowed_hosts: ["a.com", "b.com"],
      allow_mcp_servers: true,
      allow_package_managers: false,
    },
    packages: {
      ...emptyPackages,
      go: ["golang.org/x/tools"],
      npm: ["react", "next"],
    },
  },
};

const cloudUnrestrictedEnv: Environment = {
  ...envBase,
  id: "env_3",
  name: "Dev",
  description: "",
  config: {
    type: "cloud",
    networking: { type: "unrestricted" },
    packages: emptyPackages,
  },
};

const selfHostedEnv: Environment = {
  ...envBase,
  id: "env_2",
  name: "Rack",
  description: "On-prem",
  config: { type: "self_hosted" },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function stubFetch(respond: () => Response = () => json(selfHostedEnv)) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return respond();
    throw new Error(`unexpected fetch: ${String(input)}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderEditor(
  props?: Partial<ComponentProps<typeof EnvironmentEditor>>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EnvironmentEditor mode="create" initial={newEnvForm()} {...props} />
    </QueryClientProvider>,
  );
}

async function choose(user: UserEvent, triggerLabel: string, option: string) {
  const trigger = screen.getByRole("button", { name: triggerLabel });
  const wrapper = trigger.closest('[data-slot="mock-select"]') as HTMLElement;
  await user.click(within(wrapper).getByRole("button", { name: option }));
}

const postCalls = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.filter(([, init]) => init?.method === "POST");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("newEnvForm", () => {
  it("defaults to an unrestricted cloud environment", () => {
    expect(newEnvForm()).toEqual({
      name: "",
      description: "",
      kind: "cloud",
      networkingType: "unrestricted",
      allowedHosts: "",
      allowMcpServers: false,
      allowPackageManagers: true,
      packages: { apt: "", cargo: "", gem: "", go: "", npm: "", pip: "" },
    });
  });
});

describe("formFromEnvironment", () => {
  it("maps a cloud environment with limited networking", () => {
    expect(formFromEnvironment(cloudLimitedEnv)).toEqual({
      name: "Prod",
      description: "Main",
      kind: "cloud",
      networkingType: "limited",
      allowedHosts: "a.com\nb.com",
      allowMcpServers: true,
      allowPackageManagers: false,
      packages: {
        apt: "",
        cargo: "",
        gem: "",
        go: "golang.org/x/tools",
        npm: "react, next",
        pip: "",
      },
    });
  });

  it("maps a cloud environment with unrestricted networking", () => {
    const form = formFromEnvironment(cloudUnrestrictedEnv);
    expect(form.kind).toBe("cloud");
    expect(form.networkingType).toBe("unrestricted");
    expect(form.allowedHosts).toBe("");
    expect(form.allowMcpServers).toBe(false);
    expect(form.allowPackageManagers).toBe(true);
  });

  it("maps a self-hosted environment with empty cloud fields", () => {
    const form = formFromEnvironment(selfHostedEnv);
    expect(form.kind).toBe("self_hosted");
    expect(form.networkingType).toBe("unrestricted");
    expect(form.packages).toEqual({
      apt: "",
      cargo: "",
      gem: "",
      go: "",
      npm: "",
      pip: "",
    });
  });
});

describe("EnvironmentEditor", () => {
  it("creates a cloud environment with limited networking and packages", async () => {
    const mock = stubFetch(() =>
      json({ ...cloudUnrestrictedEnv, id: "env_new" }),
    );
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByLabelText("Name"), "Prod");
    await user.type(screen.getByLabelText("Description"), "Main env");
    await choose(user, "Networking", "limited");
    fireEvent.change(screen.getByLabelText("Allowed hosts (one per line)"), {
      target: { value: " api.github.com \n\n registry.npmjs.org " },
    });
    await user.click(
      screen.getByRole("checkbox", { name: "Allow MCP servers" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Allow package managers" }),
    );
    fireEvent.change(screen.getByLabelText("npm"), {
      target: { value: " react , next ,, " },
    });
    fireEvent.change(screen.getByLabelText("pip"), {
      target: { value: "requests" },
    });

    await user.click(
      screen.getByRole("button", { name: "Create environment" }),
    );
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/environments/env_new"),
    );

    const [url, init] = postCalls(mock)[0];
    expect(url).toBe("/api/platform/v1/environments");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({
      name: "Prod",
      description: "Main env",
      config: {
        type: "cloud",
        networking: {
          type: "limited",
          allowed_hosts: ["api.github.com", "registry.npmjs.org"],
          allow_mcp_servers: true,
          allow_package_managers: false,
        },
        packages: {
          apt: [],
          cargo: [],
          gem: [],
          go: [],
          npm: ["react", "next"],
          pip: ["requests"],
        },
      },
    });
  });

  it("creates a self-hosted environment and hides cloud-only fields", async () => {
    const mock = stubFetch(() => json({ ...selfHostedEnv, id: "env_new" }));
    const user = userEvent.setup();
    renderEditor();

    // No name yet: save is disabled.
    expect(
      screen.getByRole("button", { name: "Create environment" }),
    ).toBeDisabled();

    await choose(user, "Environment type", "self_hosted");
    expect(screen.queryByRole("button", { name: "Networking" })).toBeNull();
    expect(screen.queryByLabelText("npm")).toBeNull();

    await user.type(screen.getByLabelText("Name"), "Rack");
    await user.click(
      screen.getByRole("button", { name: "Create environment" }),
    );
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/environments/env_new"),
    );

    const [, init] = postCalls(mock)[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      name: "Rack",
      description: "",
      config: { type: "self_hosted" },
    });
  });

  it("keeps the kind immutable in edit mode and round-trips the cloud config", async () => {
    const mock = stubFetch(() => json(cloudLimitedEnv));
    const user = userEvent.setup();
    renderEditor({
      mode: "edit",
      initial: formFromEnvironment(cloudLimitedEnv),
      environmentId: "env_1",
    });

    expect(screen.getByText("cloud (immutable)")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Environment type" }),
    ).toBeNull();
    expect(screen.getByLabelText("Allowed hosts (one per line)")).toHaveValue(
      "a.com\nb.com",
    );
    expect(screen.getByLabelText("npm")).toHaveValue("react, next");

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/environments/env_1"),
    );

    const [url, init] = postCalls(mock)[0];
    expect(url).toBe("/api/platform/v1/environments/env_1");
    expect(JSON.parse(init?.body as string)).toEqual({
      name: "Prod",
      description: "Main",
      config: {
        type: "cloud",
        networking: {
          type: "limited",
          allowed_hosts: ["a.com", "b.com"],
          allow_mcp_servers: true,
          allow_package_managers: false,
        },
        packages: {
          apt: [],
          cargo: [],
          gem: [],
          go: ["golang.org/x/tools"],
          npm: ["react", "next"],
          pip: [],
        },
      },
    });
  });

  it("omits config when editing a self-hosted environment", async () => {
    const mock = stubFetch(() => json(selfHostedEnv));
    const user = userEvent.setup();
    renderEditor({
      mode: "edit",
      initial: formFromEnvironment(selfHostedEnv),
      environmentId: "env_2",
    });

    expect(screen.getByText("self_hosted (immutable)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/environments/env_2"),
    );

    const [url, init] = postCalls(mock)[0];
    expect(url).toBe("/api/platform/v1/environments/env_2");
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body).toEqual({ name: "Rack", description: "On-prem" });
    expect("config" in body).toBe(false);
  });

  it("shows the platform error and request id when saving fails", async () => {
    const mock = stubFetch(() =>
      json(
        {
          type: "error",
          request_id: "req_env1",
          error: {
            type: "invalid_request_error",
            message: "name already in use",
          },
        },
        400,
      ),
    );
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByLabelText("Name"), "Dup");
    await user.click(
      screen.getByRole("button", { name: "Create environment" }),
    );

    expect(await screen.findByText(/name already in use/)).toBeInTheDocument();
    expect(screen.getByText(/req_env1/)).toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();

    // The default form still sent the unrestricted-cloud config shape.
    const [, init] = postCalls(mock)[0];
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body.config).toEqual({
      type: "cloud",
      networking: { type: "unrestricted" },
      packages: emptyPackages,
    });
  });

  it("cancels back to the previous page", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(backSpy).toHaveBeenCalled();
  });
});
