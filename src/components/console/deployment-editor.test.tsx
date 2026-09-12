import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DeploymentEditor,
  deploymentBodyFromForm,
  formFromDeployment,
  newDeploymentForm,
  initialMessageFromEvents,
} from "./deployment-editor";
import type { Deployment } from "@/lib/platform/types";
import type { DeploymentWriteBody } from "@/lib/platform/queries";
import {
  agents,
  deployments,
  environments,
} from "../../../test/mock-platform/fixtures.mjs";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Context = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
  }>({
    value: "",
    onValueChange: vi.fn<(value: string) => void>(),
  });
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) =>
      React.createElement(
        Context.Provider,
        { value: { value, onValueChange } },
        children,
      ),
    SelectTrigger: ({ children, ...props }: React.ComponentProps<"button">) =>
      React.createElement("button", { type: "button", ...props }, children),
    SelectValue: () => React.createElement("span"),
    SelectContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const context = React.useContext(Context);
      return React.createElement(
        "button",
        { type: "button", onClick: () => context.onValueChange(value) },
        children,
      );
    },
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function inlineEditor({
  readOnly = false,
  reject = false,
  holdUpload = false,
} = {}) {
  let saved = structuredClone(deployments[0]) as Deployment;
  saved.resources = [
    { type: "file", file_id: "file_existing", mount_path: "/notes.txt" },
    {
      type: "memory_store",
      memory_store_id: "mem_project",
      access: "read_only",
      instructions: "Read context",
    },
    {
      type: "github_repository",
      url: "https://github.com/example/project",
      checkout: { type: "branch", name: "main" },
    },
  ];
  const posts: DeploymentWriteBody[] = [];
  let fail = reject;
  let finishUpload: (() => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.body instanceof FormData) {
        if (holdUpload)
          await new Promise<void>((resolve) => {
            finishUpload = resolve;
          });
        return Response.json({ id: "file_uploaded", filename: "new.txt" });
      }
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as DeploymentWriteBody;
        posts.push(body);
        if (fail) {
          fail = false;
          return Response.json(
            {
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "Repository token required",
              },
            },
            { status: 400 },
          );
        }
        saved = {
          ...saved,
          ...body,
          agent: {
            ...saved.agent,
            ...(body.agent as Partial<Deployment["agent"]>),
          },
          resources:
            body.resources?.map((resource) => {
              if (resource.type !== "github_repository") return resource;
              const { authorization_token: _token, ...safe } = resource;
              void _token;
              return safe;
            }) ?? saved.resources,
        } as Deployment;
        return Response.json(saved);
      }
      const data = url.includes("/versions")
        ? [3, 2].map((version) => ({ ...agents[1], version }))
        : url.includes("/agents")
          ? agents
          : url.includes("/environments")
            ? environments
            : [];
      return Response.json({ data, next_page: null });
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSaved = vi.fn();
  const element = (item: Deployment) => (
    <QueryClientProvider client={client}>
      <DeploymentEditor
        mode="edit"
        inline
        readOnly={readOnly}
        deploymentId={item.id}
        initial={formFromDeployment(item)}
        initialResources={item.resources}
        onSaved={onSaved}
      />
    </QueryClientProvider>
  );
  const view = render(element(saved));
  return {
    posts,
    onSaved,
    saved,
    refetch: () =>
      view.rerender(
        element({
          ...saved,
          name: "Server refresh",
          updated_at: "2026-09-12T12:00:00Z",
        }),
      ),
    finishUpload: () => finishUpload?.(),
  };
}

it("keeps inline drafts through refresh, discards locally, and omits unchanged write-only resources", async () => {
  const { saved, posts, refetch, onSaved } = inlineEditor();
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  await userEvent.clear(screen.getByLabelText("Name"));
  await userEvent.type(screen.getByLabelText("Name"), "Draft");
  refetch();
  expect(screen.getByLabelText("Name")).toHaveValue("Draft");
  await userEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.getByLabelText("Name")).toHaveValue(saved.name);
  await userEvent.click(await screen.findByRole("button", { name: "v2" }));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(posts[0].agent).toMatchObject({ id: saved.agent.id, version: 2 });
  expect(posts[0]).not.toHaveProperty("resources");
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  expect(push).not.toHaveBeenCalled();
});

it("submits the complete edited resource collection, retains a rejected draft, and clears repository secrets after save", async () => {
  const { posts, onSaved } = inlineEditor({ reject: true });
  await userEvent.selectOptions(screen.getByLabelText("Access"), "read_write");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Repository token required",
  );
  expect(screen.getByLabelText("Access")).toHaveValue("read_write");
  expect(posts[0].resources).toHaveLength(3);
  await userEvent.type(
    screen.getByLabelText("Authorization token"),
    "replacement-token",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(posts[1].resources).toMatchObject([
    { type: "file", file_id: "file_existing", mount_path: "/notes.txt" },
    {
      type: "memory_store",
      access: "read_write",
      instructions: "Read context",
    },
    {
      type: "github_repository",
      authorization_token: "replacement-token",
      checkout: { type: "branch", name: "main" },
    },
  ]);
  expect(screen.getByLabelText("Authorization token")).toHaveValue("");
});

it("locks resource rows during upload so an in-flight response cannot attach to a different row", async () => {
  const { finishUpload } = inlineEditor({ holdUpload: true });
  await userEvent.upload(
    screen.getByLabelText("Upload file"),
    new File(["new"], "new.txt", { type: "text/plain" }),
  );
  await waitFor(() => expect(screen.getByLabelText("File ID")).toBeDisabled());
  expect(screen.getByRole("button", { name: /Remove.*1/ })).toBeDisabled();
  finishUpload();
  await waitFor(() =>
    expect(screen.getByLabelText("File ID")).toHaveValue("file_uploaded"),
  );
});

it("renders archived configuration with disabled fields and no save controls", () => {
  inlineEditor({ readOnly: true });
  expect(screen.getByLabelText("Name")).toBeDisabled();
  expect(screen.getByLabelText("File ID")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
});

describe("deployment editor wire mapping", () => {
  it("pins the selected agent and includes create-only resources", () => {
    const form = {
      ...newDeploymentForm(),
      initialEvents: '[{"type":"user.message","content":"Run"}]',
      name: "Daily digest",
      agentId: "agent_1",
      agentVersion: 4,
      environmentId: "env_1",
      scheduleEnabled: true,
      scheduleExpression: "0 9 * * 1-5",
      scheduleTimezone: "Asia/Shanghai",
      metadata: '{"owner":"ops"}',
    };
    expect(
      deploymentBodyFromForm(
        form,
        [
          {
            type: "github_repository",
            url: "https://github.com/example/project",
            authorization_token: "write-only",
          },
        ],
        {
          owner: "old",
          removed: "delete me",
        },
      ),
    ).toMatchObject({
      name: "Daily digest",
      agent: { type: "agent", id: "agent_1", version: 4 },
      environment_id: "env_1",
      metadata: { owner: "ops", removed: null },
      schedule: {
        type: "cron",
        expression: "0 9 * * 1-5",
        timezone: "Asia/Shanghai",
      },
      resources: [{ authorization_token: "write-only" }],
    });
  });

  it("round-trips rendered fields while leaving resources outside edit state", () => {
    const deployment = {
      id: "depl_1",
      type: "deployment",
      name: "Run",
      description: null,
      agent: { type: "agent", id: "agent_1", version: 2 },
      environment_id: "env_1",
      vault_ids: [],
      initial_events: [{ type: "user.message", content: "Go" }],
      resources: [{ type: "github_repository", url: "https://github.com/x/y" }],
      metadata: {},
      schedule: null,
      status: "active",
      paused_reason: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      archived_at: null,
    } satisfies Deployment;
    const body = deploymentBodyFromForm(formFromDeployment(deployment));
    expect(body.agent).toEqual({ type: "agent", id: "agent_1", version: 2 });
    expect(body.schedule).toBeNull();
    expect(body).not.toHaveProperty("resources");
  });

  it("shows the pinned version and can upgrade it while deleting metadata keys", async () => {
    const posts: DeploymentWriteBody[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)) as DeploymentWriteBody);
          return new Response(
            JSON.stringify({ id: "depl_1", type: "deployment" }),
            { status: 200 },
          );
        }
        const data = url.includes("/agents")
          ? [
              {
                id: "agent_1",
                name: "Task agent",
                version: 3,
                archived_at: null,
              },
            ]
          : url.includes("/environments")
            ? [
                {
                  id: "env_1",
                  name: "Workers",
                  config: { type: "self_hosted" },
                  archived_at: null,
                },
              ]
            : [];
        return new Response(JSON.stringify({ data, next_page: null }), {
          status: 200,
        });
      }),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <DeploymentEditor
          mode="edit"
          deploymentId="depl_1"
          initial={{
            ...newDeploymentForm(),
            initialEvents: '[{"type":"user.message","content":"Run"}]',
            name: "Run",
            agentId: "agent_1",
            agentVersion: 2,
            environmentId: "env_1",
            metadata: '{"remove":"yes"}',
          }}
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole(
        "button",
        {
          name: "Task agent · v2 (pinned)",
        },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Task agent · v3" }),
    );
    fireEvent.change(screen.getByLabelText("Metadata (JSON object)"), {
      target: { value: "{}" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      agent: { id: "agent_1", version: 3 },
      metadata: { remove: null },
    });
  });

  it("drives every create input and submits resources without echoing secrets", async () => {
    const posts: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.body instanceof FormData) {
          return new Response(
            JSON.stringify({
              id: "file_uploaded",
              type: "file",
              filename: "brief.txt",
              mime_type: "text/plain",
              size_bytes: 5,
              downloadable: false,
              scope: null,
              created_at: "2026-01-01T00:00:00Z",
            }),
            { status: 200 },
          );
        }
        if (init?.method === "POST") {
          posts.push({ url, body: JSON.parse(String(init.body)) });
          return new Response(
            JSON.stringify({ id: "depl_created", type: "deployment" }),
            { status: 200 },
          );
        }
        const data = url.includes("/agents")
          ? [
              {
                id: "agent_1",
                name: "Task agent",
                version: 3,
                archived_at: null,
              },
            ]
          : url.includes("/environments")
            ? [
                {
                  id: "env_1",
                  name: "Workers",
                  config: { type: "self_hosted" },
                  archived_at: null,
                },
              ]
            : url.includes("/memory_stores")
              ? [
                  {
                    id: "mem_1",
                    type: "memory_store",
                    name: "Project notes",
                    archived_at: null,
                  },
                ]
              : [
                  {
                    id: "vlt_1",
                    display_name: "GitHub",
                    archived_at: null,
                  },
                ];
        return new Response(JSON.stringify({ data, next_page: null }), {
          status: 200,
        });
      }),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <DeploymentEditor mode="create" initial={newDeploymentForm()} />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Task agent/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Workers/ }));
    await userEvent.type(screen.getByLabelText("Name"), "Morning run");
    await userEvent.type(screen.getByLabelText("Description"), "Daily triage");
    await userEvent.click(
      screen.getByRole("button", { name: "Credential vaults" }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "GitHub" }));
    await userEvent.click(
      screen.getByRole("radio", { name: "Advanced events" }),
    );
    fireEvent.change(screen.getByLabelText("Initial events (JSON)"), {
      target: { value: '[{"type":"user.message","content":"Go"}]' },
    });
    fireEvent.change(screen.getByLabelText("Metadata (JSON object)"), {
      target: { value: '{"owner":"ops"}' },
    });
    await userEvent.click(screen.getByRole("radio", { name: "Schedule" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit cron" }));
    await userEvent.clear(screen.getByLabelText("Cron expression"));
    await userEvent.type(
      screen.getByLabelText("Cron expression"),
      "30 8 * * 1-5",
    );
    await userEvent.click(
      screen.getByRole("combobox", { name: "IANA timezone" }),
    );
    await userEvent.type(
      await screen.findByRole("combobox", { name: "Search timezones" }),
      "Shanghai",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Asia\/Shanghai$/ }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Resource" }));
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: "GitHub repository",
      }),
    );
    await userEvent.type(
      screen.getByLabelText("Repository URL"),
      "https://github.com/example/project",
    );
    await userEvent.type(screen.getByLabelText("Authorization token"), "token");
    await userEvent.selectOptions(screen.getByLabelText("Checkout"), "branch");
    await userEvent.type(screen.getByLabelText("Branch name"), "main");
    await userEvent.click(screen.getByRole("button", { name: "Resource" }));
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: "Memory store",
      }),
    );
    await waitFor(() =>
      expect(
        document.querySelector(
          'datalist#active-memory-stores option[value="mem_1"]',
        ),
      ).toHaveTextContent("Project notes"),
    );
    await userEvent.type(screen.getByLabelText("Memory store ID"), "mem_1");
    await userEvent.selectOptions(screen.getByLabelText("Access"), "read_only");
    await userEvent.type(
      screen.getByLabelText("Memory instructions (optional)"),
      "Read context",
    );
    fireEvent.change(screen.getByLabelText("Upload file"), {
      target: {
        files: [new File(["brief"], "brief.txt", { type: "text/plain" })],
      },
    });
    await screen.findByText("brief.txt");
    await userEvent.click(
      screen.getByRole("button", { name: "Create deployment" }),
    );

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      url: "/api/platform/v1/deployments",
      body: {
        name: "Morning run",
        agent: { id: "agent_1", version: 3 },
        environment_id: "env_1",
        vault_ids: ["vlt_1"],
        schedule: { expression: "30 8 * * 1-5", timezone: "Asia/Shanghai" },
        resources: [
          { type: "file", file_id: "file_uploaded" },
          { type: "github_repository", authorization_token: "token" },
          { type: "memory_store", memory_store_id: "mem_1" },
        ],
      },
    });
    expect(push).toHaveBeenCalledWith("/deployments/depl_created");
  }, 15_000);

  it("keeps malformed JSON for correction without calling the platform", async () => {
    const fetch = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const initial = {
      ...newDeploymentForm(),
      initialEvents: '[{"type":"user.message","content":"Run"}]',
      name: "Run",
      agentId: "agent_1",
      environmentId: "env_1",
      metadata: "{",
    };
    render(
      <QueryClientProvider client={client}>
        <DeploymentEditor mode="edit" initial={initial} deploymentId="depl_1" />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText(/Expected property name/),
    ).toBeInTheDocument();
    expect(fetch.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(
      true,
    );
  });
});

it.each([
  "{}",
  "null",
  "[null]",
  "[]",
  "{",
  '[{"type":"user.define_outcome","content":"Go"}]',
  '[{"type":"user.message","content":[]}]',
  '[{"type":"user.message","content":"Go","metadata":{"keep":true}}]',
  '[{"type":"user.message","content":"Go"},{"type":"system.message","content":"Keep"}]',
])("keeps advanced events intact: %s", (raw) => {
  expect(initialMessageFromEvents(raw)).toBeNull();
});

it("round-trips plain message drafts between rendered and advanced views", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: [] }))),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DeploymentEditor mode="create" initial={newDeploymentForm()} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Initial message" }), {
    target: { value: "First\nSecond" },
  });
  await userEvent.click(screen.getByRole("radio", { name: "Advanced events" }));
  expect(
    initialMessageFromEvents(
      (screen.getByLabelText("Initial events (JSON)") as HTMLTextAreaElement)
        .value,
    ),
  ).toBe("First\nSecond");
  fireEvent.change(screen.getByLabelText("Initial events (JSON)"), {
    target: { value: "{" },
  });
  expect(screen.getByRole("radio", { name: "Initial message" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Initial events (JSON)"), {
    target: { value: '[{"type":"user.message","content":"Corrected"}]' },
  });
  await userEvent.click(screen.getByRole("radio", { name: "Initial message" }));
  expect(screen.getByRole("textbox", { name: "Initial message" })).toHaveValue(
    "Corrected",
  );
  expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
  await userEvent.click(screen.getByRole("radio", { name: "Schedule" }));
  await userEvent.click(screen.getByRole("button", { name: "Edit cron" }));
  fireEvent.change(screen.getByLabelText("Cron expression"), {
    target: { value: "30 9 * * *" },
  });
  await userEvent.click(screen.getByRole("radio", { name: "Manual" }));
  expect(screen.queryByLabelText("Cron expression")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "Schedule" }));
  await userEvent.click(screen.getByRole("button", { name: "Edit cron" }));
  expect(screen.getByLabelText("Cron expression")).toHaveValue("30 9 * * *");
});

it("deletes special metadata keys as own properties", () => {
  const previous = JSON.parse('{"__proto__":"keep","toString":"old"}');
  const metadata = deploymentBodyFromForm(
    { ...newDeploymentForm(), metadata: "{}" },
    undefined,
    previous,
  ).metadata;
  expect(JSON.stringify(metadata)).toBe('{"__proto__":null,"toString":null}');
});

it.each(["", "  \n "])(
  "treats cleared metadata as an empty patch: %j",
  (metadata) => {
    expect(
      deploymentBodyFromForm({ ...newDeploymentForm(), metadata }).metadata,
    ).toEqual({});
    expect(
      deploymentBodyFromForm({ ...newDeploymentForm(), metadata }, undefined, {
        owner: "old",
      }).metadata,
    ).toEqual({ owner: null });
  },
);
