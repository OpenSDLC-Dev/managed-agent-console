import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useAddCredential,
  useAgent,
  useAgentOptions,
  useAgents,
  useAgentVersions,
  useArchiveAgent,
  useArchiveCredential,
  useArchiveEnvironment,
  useArchiveVault,
  useCreateAgent,
  useCreateEnvironment,
  useCreateSession,
  useCreateVault,
  useDeleteCredential,
  useDeleteEnvironment,
  useDeleteFile,
  useDeleteSkill,
  useDeleteSkillVersion,
  useDeleteVault,
  useEnvironment,
  useEnvironments,
  useFiles,
  useSendEvents,
  useSession,
  useSessions,
  useSkill,
  useSkills,
  useSkillVersions,
  useUpdateAgent,
  useUpdateEnvironment,
  useUploadFile,
  useUploadSkill,
  useUploadSkillVersion,
  useValidateOAuthCredential,
  useVault,
  useVaultCredentials,
  useVaults,
} from "./queries";

const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function stubFetch(payload: unknown) {
  const fetchMock = vi.fn<
    (input: string, init?: RequestInit) => Promise<Response>
  >(async () => jsonResponse(payload));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

/** Split a fetched URL into pathname + a comparable search-params record. */
function searchOf(url: string): Record<string, string | string[]> {
  const parsed = new URL(url, "http://console.test");
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(parsed.searchParams.keys())) {
    const values = parsed.searchParams.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface QueryCase {
  name: string;
  useHook: () => { isSuccess: boolean };
  path: string;
  search: Record<string, string | string[]>;
}

const queryCases: QueryCase[] = [
  {
    name: "useAgents (defaults)",
    useHook: () => useAgents({}),
    path: "/api/platform/v1/agents",
    search: { limit: "20" },
  },
  {
    name: "useAgents (page, include_archived, limit override, created bound)",
    useHook: () =>
      useAgents({
        page: "cur_1",
        include_archived: true,
        limit: 5,
        "created_at[gte]": "2026-08-01T00:00:00.000Z",
      }),
    path: "/api/platform/v1/agents",
    search: {
      limit: "5",
      page: "cur_1",
      include_archived: "true",
      "created_at[gte]": "2026-08-01T00:00:00.000Z",
    },
  },
  {
    name: "useAgent",
    useHook: () => useAgent("agt_1"),
    path: "/api/platform/v1/agents/agt_1",
    search: {},
  },
  {
    name: "useAgentVersions (with page)",
    useHook: () => useAgentVersions("agt_1", "cur_2"),
    path: "/api/platform/v1/agents/agt_1/versions",
    search: { limit: "20", page: "cur_2" },
  },
  {
    name: "useAgentVersions (no page)",
    useHook: () => useAgentVersions("agt_1"),
    path: "/api/platform/v1/agents/agt_1/versions",
    search: { limit: "20" },
  },
  {
    name: "useEnvironments",
    useHook: () => useEnvironments({}),
    path: "/api/platform/v1/environments",
    search: { limit: "20" },
  },
  {
    name: "useEnvironment",
    useHook: () => useEnvironment("env_1"),
    path: "/api/platform/v1/environments/env_1",
    search: {},
  },
  {
    name: "useSessions (statuses repeated, filters)",
    useHook: () =>
      useSessions({
        statuses: ["running", "idle"],
        agent_id: "agt_1",
        order: "desc",
        include_archived: true,
        "created_at[gte]": "2026-08-01T00:00:00.000Z",
      }),
    path: "/api/platform/v1/sessions",
    search: {
      limit: "20",
      statuses: ["running", "idle"],
      agent_id: "agt_1",
      order: "desc",
      include_archived: "true",
      "created_at[gte]": "2026-08-01T00:00:00.000Z",
    },
  },
  {
    name: "useSessions (defaults)",
    useHook: () => useSessions({}),
    path: "/api/platform/v1/sessions",
    search: { limit: "20" },
  },
  {
    name: "useSession",
    useHook: () => useSession("sess_1"),
    path: "/api/platform/v1/sessions/sess_1",
    search: {},
  },
  {
    name: "useVaults",
    useHook: () => useVaults({}),
    path: "/api/platform/v1/vaults",
    search: { limit: "20" },
  },
  {
    name: "useVault",
    useHook: () => useVault("vlt_1"),
    path: "/api/platform/v1/vaults/vlt_1",
    search: {},
  },
  {
    name: "useVaultCredentials",
    useHook: () => useVaultCredentials("vlt_1", "cur_3"),
    path: "/api/platform/v1/vaults/vlt_1/credentials",
    search: { limit: "20", page: "cur_3", include_archived: "true" },
  },
  {
    name: "useSkills",
    useHook: () => useSkills({ source: "custom" }),
    path: "/api/platform/v1/skills",
    search: { limit: "20", source: "custom" },
  },
  {
    name: "useSkill",
    useHook: () => useSkill("skl_1"),
    path: "/api/platform/v1/skills/skl_1",
    search: {},
  },
  {
    name: "useSkillVersions",
    useHook: () => useSkillVersions("skl_1", "cur_4"),
    path: "/api/platform/v1/skills/skl_1/versions",
    search: { limit: "20", page: "cur_4" },
  },
  {
    name: "useFiles (with after_id)",
    useHook: () => useFiles("file_9"),
    path: "/api/platform/v1/files",
    search: { limit: "20", after_id: "file_9" },
  },
  {
    name: "useFiles (first page)",
    useHook: () => useFiles(),
    path: "/api/platform/v1/files",
    search: { limit: "20" },
  },
];

describe("query hooks", () => {
  it.each(queryCases)("$name GETs $path", async ({ useHook, path, search }) => {
    const fetchMock = stubFetch({ data: [] });
    const { wrapper } = createClient();

    const { result } = renderHook(useHook, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(init).toBeUndefined(); // plain GET
    expect(new URL(url, "http://console.test").pathname).toBe(path);
    expect(searchOf(url)).toEqual(search);
  });
});

describe("useAgentOptions", () => {
  it("pages v1/agents to exhaustion with archived included", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(String(input), "http://console.test");
      return jsonResponse(
        url.searchParams.get("page") === "cur_2"
          ? { data: [{ id: "agt_2" }], next_page: null }
          : { data: [{ id: "agt_1" }], next_page: "cur_2" },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = createClient();
    const { result } = renderHook(() => useAgentOptions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      agents: [{ id: "agt_1" }, { id: "agt_2" }],
      truncated: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(searchOf(fetchMock.mock.calls[0][0])).toEqual({
      limit: "100",
      include_archived: "true",
    });
    expect(searchOf(fetchMock.mock.calls[1][0])).toEqual({
      limit: "100",
      include_archived: "true",
      page: "cur_2",
    });
  });

  it("stops at the page cap and reports truncation", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ id: "agt_x" }], next_page: "again" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = createClient();
    const { result } = renderHook(() => useAgentOptions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(result.current.data?.truncated).toBe(true);
    expect(result.current.data?.agents).toHaveLength(10);
  });
});

interface MutationCase {
  name: string;
  useHook: () => { mutateAsync: (variables: never) => Promise<unknown> };
  variables?: unknown;
  path: string;
  method: "POST" | "DELETE";
  /** JSON body (platformPost); asserts the content-type header too. */
  jsonBody?: unknown;
  /** FormData entries as [name, string value or file name] (platformPostForm). */
  formEntries?: [string, string][];
  meta: Record<string, unknown>;
  invalidates: string[][];
  /** Query key whose cache entry is set to the mutation response. */
  setsData?: string[];
  removes?: string[][];
}

const skillMd = () =>
  new File(["# skill"], "SKILL.md", { type: "text/markdown" });

const mutationCases: MutationCase[] = [
  {
    name: "useSendEvents",
    useHook: () => useSendEvents("sess_1"),
    variables: [{ type: "user.interrupt" }],
    path: "/api/platform/v1/sessions/sess_1/events",
    method: "POST",
    jsonBody: { events: [{ type: "user.interrupt" }] },
    meta: { errorToast: false },
    invalidates: [["session", "sess_1"]],
  },
  {
    name: "useCreateAgent",
    useHook: () => useCreateAgent(),
    variables: { name: "Support agent" },
    path: "/api/platform/v1/agents",
    method: "POST",
    jsonBody: { name: "Support agent" },
    meta: { errorToast: false },
    invalidates: [["agents"]],
  },
  {
    name: "useUpdateAgent",
    useHook: () => useUpdateAgent("agt_1"),
    variables: { name: "Renamed", version: 3 },
    path: "/api/platform/v1/agents/agt_1",
    method: "POST",
    jsonBody: { name: "Renamed", version: 3 },
    meta: { errorToast: false },
    invalidates: [["agents"], ["agent-versions", "agt_1"]],
    setsData: ["agent", "agt_1"],
  },
  {
    name: "useArchiveAgent",
    useHook: () => useArchiveAgent("agt_1"),
    path: "/api/platform/v1/agents/agt_1/archive",
    method: "POST",
    jsonBody: {},
    meta: { errorTitle: "Archive failed" },
    invalidates: [["agents"]],
    setsData: ["agent", "agt_1"],
  },
  {
    name: "useCreateEnvironment",
    useHook: () => useCreateEnvironment(),
    variables: { name: "Default" },
    path: "/api/platform/v1/environments",
    method: "POST",
    jsonBody: { name: "Default" },
    meta: { errorToast: false },
    invalidates: [["environments"]],
  },
  {
    name: "useUpdateEnvironment",
    useHook: () => useUpdateEnvironment("env_1"),
    variables: { description: "updated" },
    path: "/api/platform/v1/environments/env_1",
    method: "POST",
    jsonBody: { description: "updated" },
    meta: { errorToast: false },
    invalidates: [["environments"]],
    setsData: ["environment", "env_1"],
  },
  {
    name: "useArchiveEnvironment",
    useHook: () => useArchiveEnvironment("env_1"),
    path: "/api/platform/v1/environments/env_1/archive",
    method: "POST",
    jsonBody: {},
    meta: { errorTitle: "Archive failed" },
    invalidates: [["environments"]],
    setsData: ["environment", "env_1"],
  },
  {
    name: "useDeleteEnvironment",
    useHook: () => useDeleteEnvironment("env_1"),
    path: "/api/platform/v1/environments/env_1",
    method: "DELETE",
    meta: { errorTitle: "Delete failed" },
    invalidates: [["environments"]],
    removes: [["environment", "env_1"]],
  },
  {
    name: "useCreateSession",
    useHook: () => useCreateSession(),
    variables: { agent: "agt_1", environment_id: "env_1", title: "Run" },
    path: "/api/platform/v1/sessions",
    method: "POST",
    jsonBody: { agent: "agt_1", environment_id: "env_1", title: "Run" },
    meta: { errorToast: false },
    invalidates: [["sessions"]],
  },
  {
    name: "useUploadFile",
    useHook: () => useUploadFile(),
    variables: new File(["hello"], "notes.txt", { type: "text/plain" }),
    path: "/api/platform/v1/files",
    method: "POST",
    formEntries: [["file", "notes.txt"]],
    meta: { errorToast: false },
    invalidates: [["files"]],
  },
  {
    name: "useCreateVault",
    useHook: () => useCreateVault(),
    variables: { display_name: "Prod" },
    path: "/api/platform/v1/vaults",
    method: "POST",
    jsonBody: { display_name: "Prod" },
    meta: { errorToast: false },
    invalidates: [["vaults"]],
  },
  {
    name: "useArchiveVault",
    useHook: () => useArchiveVault("vlt_1"),
    path: "/api/platform/v1/vaults/vlt_1/archive",
    method: "POST",
    jsonBody: {},
    meta: { errorTitle: "Archive failed" },
    invalidates: [["vaults"], ["vault-credentials", "vlt_1"]],
    setsData: ["vault", "vlt_1"],
  },
  {
    name: "useDeleteVault",
    useHook: () => useDeleteVault("vlt_1"),
    path: "/api/platform/v1/vaults/vlt_1",
    method: "DELETE",
    meta: { errorTitle: "Delete failed" },
    invalidates: [["vaults"]],
    removes: [["vault", "vlt_1"]],
  },
  {
    name: "useAddCredential",
    useHook: () => useAddCredential("vlt_1"),
    variables: { display_name: "GitHub", auth: { token: "t" } },
    path: "/api/platform/v1/vaults/vlt_1/credentials",
    method: "POST",
    jsonBody: { display_name: "GitHub", auth: { token: "t" } },
    meta: { errorToast: false },
    invalidates: [["vault-credentials", "vlt_1"]],
  },
  {
    name: "useArchiveCredential",
    useHook: () => useArchiveCredential("vlt_1"),
    variables: "crd_1",
    path: "/api/platform/v1/vaults/vlt_1/credentials/crd_1/archive",
    method: "POST",
    jsonBody: {},
    meta: { errorTitle: "Archive failed" },
    invalidates: [["vault-credentials", "vlt_1"]],
  },
  {
    name: "useDeleteCredential",
    useHook: () => useDeleteCredential("vlt_1"),
    variables: "crd_1",
    path: "/api/platform/v1/vaults/vlt_1/credentials/crd_1",
    method: "DELETE",
    meta: { errorTitle: "Delete failed" },
    invalidates: [["vault-credentials", "vlt_1"]],
  },
  {
    name: "useValidateOAuthCredential",
    useHook: () => useValidateOAuthCredential("vlt_1"),
    variables: "crd_1",
    path: "/api/platform/v1/vaults/vlt_1/credentials/crd_1/mcp_oauth_validate",
    method: "POST",
    jsonBody: {},
    meta: { errorToast: false },
    invalidates: [],
  },
  {
    name: "useUploadSkill (with display title)",
    useHook: () => useUploadSkill(),
    variables: {
      files: [skillMd(), new File(["print()"], "run.py")],
      displayTitle: "My skill",
    },
    path: "/api/platform/v1/skills",
    method: "POST",
    formEntries: [
      ["files[]", "SKILL.md"],
      ["files[]", "run.py"],
      ["display_title", "My skill"],
    ],
    meta: { errorToast: false },
    invalidates: [["skills"]],
  },
  {
    name: "useUploadSkill (no display title)",
    useHook: () => useUploadSkill(),
    variables: { files: [skillMd()] },
    path: "/api/platform/v1/skills",
    method: "POST",
    formEntries: [["files[]", "SKILL.md"]],
    meta: { errorToast: false },
    invalidates: [["skills"]],
  },
  {
    name: "useUploadSkillVersion",
    useHook: () => useUploadSkillVersion("skl_1"),
    variables: [skillMd()],
    path: "/api/platform/v1/skills/skl_1/versions",
    method: "POST",
    formEntries: [["files[]", "SKILL.md"]],
    meta: { errorTitle: "Upload failed" },
    invalidates: [
      ["skill", "skl_1"],
      ["skill-versions", "skl_1"],
    ],
  },
  {
    name: "useDeleteSkillVersion",
    useHook: () => useDeleteSkillVersion("skl_1"),
    variables: "1759178010641556",
    path: "/api/platform/v1/skills/skl_1/versions/1759178010641556",
    method: "DELETE",
    meta: { errorTitle: "Delete failed" },
    invalidates: [
      ["skill", "skl_1"],
      ["skill-versions", "skl_1"],
    ],
  },
  {
    name: "useDeleteSkill",
    useHook: () => useDeleteSkill("skl_1"),
    path: "/api/platform/v1/skills/skl_1",
    method: "DELETE",
    meta: { errorTitle: "Delete failed" },
    invalidates: [["skills"]],
    removes: [["skill", "skl_1"]],
  },
  {
    name: "useDeleteFile",
    useHook: () => useDeleteFile(),
    variables: "file_1",
    path: "/api/platform/v1/files/file_1",
    method: "DELETE",
    meta: { errorTitle: "Delete failed" },
    invalidates: [["files"]],
  },
];

describe("mutation hooks", () => {
  it.each(mutationCases)(
    "$name sends $method $path and settles the cache",
    async (mutation) => {
      const response = { id: "obj_1" };
      const fetchMock = stubFetch(response);
      const { client, wrapper } = createClient();
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const setData = vi.spyOn(client, "setQueryData");
      const remove = vi.spyOn(client, "removeQueries");

      const { result } = renderHook(mutation.useHook, { wrapper });
      await act(async () => {
        await result.current.mutateAsync(mutation.variables as never);
      });

      // Request wire shape.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(mutation.path);
      expect(init?.method).toBe(mutation.method);
      if (mutation.jsonBody !== undefined) {
        expect(init?.headers).toEqual({ "content-type": "application/json" });
        expect(JSON.parse(init?.body as string)).toEqual(mutation.jsonBody);
      }
      if (mutation.formEntries) {
        const form = init?.body as FormData;
        expect(
          [...form.entries()].map(([name, value]) => [
            name,
            typeof value === "string" ? value : value.name,
          ]),
        ).toEqual(mutation.formEntries);
      }
      if (mutation.method === "DELETE") {
        expect(init?.body).toBeUndefined();
      }

      // onSuccess cache effects.
      expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
        mutation.invalidates,
      );
      if (mutation.setsData) {
        expect(setData).toHaveBeenCalledExactlyOnceWith(
          mutation.setsData,
          response,
        );
      } else {
        expect(setData).not.toHaveBeenCalled();
      }
      expect(remove.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
        mutation.removes ?? [],
      );

      // Mutation meta drives the global error-toast behavior.
      expect(client.getMutationCache().getAll().at(0)?.options.meta).toEqual(
        mutation.meta,
      );
    },
  );
});
