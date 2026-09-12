"use client";

import {
  useMutation,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  PlatformError,
  consoleGet,
  consoleKeysGet,
  consoleKeysPost,
  consolePost,
  consolePostNoContent,
  platformDelete,
  platformGet,
  platformPost,
  platformPostForm,
  type Page,
} from "./http";
import { CONSOLE_ORG, CONSOLE_WORKSPACE } from "./surfaces";
import type { ResourceInput } from "./session-resources";
import type {
  Agent,
  ApiKey,
  ApiKeyIssued,
  Deployment,
  DeploymentRun,
  Dream,
  DreamStatus,
  Environment,
  EnvironmentKeyIssued,
  EnvironmentKeyPage,
  Memory,
  MemoryListItem,
  MemoryStore,
  MemoryVersion,
  PlatformFile,
  Session,
  SessionEvent,
  SessionStatus,
  SessionThread,
  Skill,
  SkillVersion,
  Vault,
  VaultCredential,
} from "./types";

export function useAgents(params: {
  page?: string;
  include_archived?: boolean;
  limit?: number;
  "created_at[gte]"?: string;
  "created_at[lte]"?: string;
}) {
  return useQuery({
    queryKey: ["agents", params],
    queryFn: () =>
      platformGet<Page<Agent>>("v1/agents", { limit: 20, ...params }),
    placeholderData: keepPreviousData,
  });
}

/** Options page size × page cap for the agent-filter dropdown (plan 03 slice 2). */
const AGENT_OPTIONS_PAGE_LIMIT = 100;
const AGENT_OPTIONS_PAGE_CAP = 10;
const MEMORY_STORE_OPTIONS_PAGE_LIMIT = 100;
const MEMORY_STORE_OPTIONS_PAGE_CAP = 10;
const FILE_OPTIONS_PAGE_LIMIT = 1000;

/**
 * Every agent, for filter options: pages `v1/agents` to exhaustion
 * (archived included — their sessions stay filterable). `truncated` flips
 * when the sanity cap (1000 agents) is hit, so the UI can say so instead
 * of silently offering a partial list.
 */
export function useAgentOptions() {
  return useQuery({
    queryKey: ["agent-options"],
    queryFn: async () => {
      const agents: Agent[] = [];
      let page: string | undefined;
      for (let i = 0; i < AGENT_OPTIONS_PAGE_CAP; i++) {
        const res = await platformGet<Page<Agent>>("v1/agents", {
          limit: AGENT_OPTIONS_PAGE_LIMIT,
          include_archived: true,
          page,
        });
        agents.push(...res.data);
        if (!res.next_page) return { agents, truncated: false };
        page = res.next_page;
      }
      return { agents, truncated: true };
    },
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => platformGet<Agent>(`v1/agents/${encodeURIComponent(id)}`),
  });
}

/** agents.go:getAgent accepts a version query; omitted means the current head. */
export function useAgentVersion(id: string, version: string | null) {
  return useQuery({
    queryKey: ["agent-version", id, version],
    queryFn: () =>
      platformGet<Agent>("v1/agents/" + encodeURIComponent(id), {
        version: version ?? undefined,
      }),
    enabled: version !== null,
  });
}

export function useAgentVersionOptions(id: string) {
  return useInfiniteQuery({
    queryKey: ["agent-versions", id, "options"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      platformGet<Page<Agent>>(
        "v1/agents/" + encodeURIComponent(id) + "/versions",
        { limit: 20, page: pageParam },
      ),
    getNextPageParam: (last) => last.next_page ?? undefined,
  });
}

export function useAgentVersions(id: string, page?: string) {
  return useQuery({
    queryKey: ["agent-versions", id, page],
    queryFn: () =>
      platformGet<Page<Agent>>(`v1/agents/${encodeURIComponent(id)}/versions`, {
        limit: 20,
        page,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useEnvironments(params: {
  page?: string;
  include_archived?: boolean;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["environments", params],
    queryFn: () =>
      platformGet<Page<Environment>>("v1/environments", {
        limit: 20,
        ...params,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useEnvironment(id: string) {
  return useQuery({
    queryKey: ["environment", id],
    queryFn: () =>
      platformGet<Environment>(`v1/environments/${encodeURIComponent(id)}`),
  });
}

export function useSessions(params: {
  page?: string;
  deployment_id?: string;
  statuses?: SessionStatus[];
  agent_id?: string;
  agent_version?: string;
  order?: "asc" | "desc";
  include_archived?: boolean;
  "created_at[gte]"?: string;
  "created_at[lte]"?: string;
}) {
  return useQuery({
    queryKey: ["sessions", params],
    queryFn: () =>
      platformGet<Page<Session>>("v1/sessions", {
        limit: 20,
        ...params,
        statuses: params.statuses,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useSession(id: string, refetchInterval?: number) {
  return useQuery({
    queryKey: ["session", id],
    queryFn: () =>
      platformGet<Session>(`v1/sessions/${encodeURIComponent(id)}`),
    refetchInterval,
  });
}

/** Include archived deployments so historical sessions remain filterable. */
export function useDeploymentOptions() {
  return useQuery({
    queryKey: ["deployment-options"],
    queryFn: async () => {
      const deployments: Deployment[] = [];
      let page: string | undefined;
      for (let i = 0; i < 10; i++) {
        const res = await platformGet<Page<Deployment>>("v1/deployments", {
          limit: 100,
          include_archived: true,
          page,
        });
        deployments.push(...res.data);
        if (!res.next_page) return { deployments, truncated: false };
        page = res.next_page;
      }
      return { deployments, truncated: true };
    },
  });
}

export function useDeployments(params: {
  page?: string;
  include_archived?: boolean;
  status?: "active" | "paused";
  agent_id?: string;
  limit?: number;
  "created_at[gte]"?: string;
  "created_at[lte]"?: string;
}) {
  return useQuery({
    queryKey: ["deployments", params],
    queryFn: () =>
      platformGet<Page<Deployment>>("v1/deployments", {
        limit: 20,
        ...params,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useDeployment(id: string) {
  return useQuery({
    queryKey: ["deployment", id],
    queryFn: () =>
      platformGet<Deployment>(`v1/deployments/${encodeURIComponent(id)}`),
  });
}

export function useDeploymentRuns(params: {
  page?: string;
  deployment_id?: string;
  trigger_type?: "manual" | "schedule";
  has_error?: boolean;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["deployment-runs", params],
    queryFn: () =>
      platformGet<Page<DeploymentRun>>("v1/deployment_runs", {
        limit: 20,
        ...params,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useDeploymentRun(id: string) {
  return useQuery({
    queryKey: ["deployment-run", id],
    queryFn: () => platformGet<DeploymentRun>(`v1/deployment_runs/${id}`),
  });
}

export function useDreams(params: {
  page?: string;
  statuses?: DreamStatus[];
  include_archived?: boolean;
  limit?: number;
  "created_at[gt]"?: string;
  "created_at[lt]"?: string;
}) {
  return useQuery({
    queryKey: ["dreams", params],
    queryFn: () => {
      const { statuses, ...rest } = params;
      return platformGet<Page<Dream>>("v1/dreams", {
        limit: 20,
        ...rest,
        "statuses[]": statuses,
      });
    },
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.data.some(
        (dream) => dream.status === "pending" || dream.status === "running",
      )
        ? 10_000
        : false,
  });
}

export function useDream(id: string) {
  return useQuery({
    queryKey: ["dream", id],
    queryFn: () => platformGet<Dream>(`v1/dreams/${id}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 10_000 : false;
    },
  });
}

export function useMemoryStores(params: {
  page?: string;
  include_archived?: boolean;
  limit?: number;
  "created_at[gte]"?: string;
  "created_at[lte]"?: string;
}) {
  return useQuery({
    queryKey: ["memory-stores", params],
    queryFn: () =>
      platformGet<Page<MemoryStore>>("v1/memory_stores", {
        limit: 20,
        ...params,
      }),
    placeholderData: keepPreviousData,
  });
}

/**
 * Active memory stores for creation-time resource pickers. The free-form ID
 * input remains available when this defensive 1000-store cap is reached.
 */
export function useMemoryStoreOptions() {
  return useQuery({
    queryKey: ["memory-store-options"],
    queryFn: async () => {
      const memoryStores: MemoryStore[] = [];
      let page: string | undefined;
      for (let i = 0; i < MEMORY_STORE_OPTIONS_PAGE_CAP; i++) {
        const res = await platformGet<Page<MemoryStore>>("v1/memory_stores", {
          limit: MEMORY_STORE_OPTIONS_PAGE_LIMIT,
          page,
        });
        memoryStores.push(...res.data);
        if (!res.next_page) return { memoryStores, truncated: false };
        page = res.next_page;
      }
      return { memoryStores, truncated: true };
    },
  });
}

export function useMemoryStore(id: string) {
  return useQuery({
    queryKey: ["memory-store", id],
    queryFn: () =>
      platformGet<MemoryStore>(`v1/memory_stores/${encodeURIComponent(id)}`),
  });
}

export function useMemories(
  storeId: string,
  params: {
    page?: string;
    path_prefix?: string;
    depth?: 0 | 1;
    view?: "basic" | "full";
    limit?: number;
  },
) {
  return useQuery({
    queryKey: ["memories", storeId, params],
    queryFn: () =>
      platformGet<Page<MemoryListItem>>(
        `v1/memory_stores/${storeId}/memories`,
        { limit: 20, ...params },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useMemory(storeId: string, memoryId: string, enabled = true) {
  return useQuery({
    queryKey: ["memory", storeId, memoryId],
    enabled,
    queryFn: () =>
      platformGet<Memory>(`v1/memory_stores/${storeId}/memories/${memoryId}`, {
        view: "full",
      }),
  });
}

export function useMemoryVersions(
  storeId: string,
  params: {
    page?: string;
    memory_id?: string;
    operation?: "created" | "modified" | "deleted";
    session_id?: string;
    api_key_id?: string;
    service_account_id?: string;
    "created_at[gte]"?: string;
    "created_at[lte]"?: string;
    view?: "basic" | "full";
    limit?: number;
  },
) {
  return useQuery({
    queryKey: ["memory-versions", storeId, params],
    queryFn: () =>
      platformGet<Page<MemoryVersion>>(
        `v1/memory_stores/${storeId}/memory_versions`,
        { limit: 20, ...params },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useMemoryVersion(storeId: string, versionId: string) {
  return useQuery({
    queryKey: ["memory-version", storeId, versionId],
    queryFn: () =>
      platformGet<MemoryVersion>(
        `v1/memory_stores/${storeId}/memory_versions/${versionId}`,
        { view: "full" },
      ),
  });
}

/** A session has at most 1,000 threads; the platform serves them in one page. */
export function useSessionThreads(id: string, refetchInterval?: number) {
  return useQuery({
    queryKey: ["session-threads", id],
    queryFn: () =>
      platformGet<Page<SessionThread>>(`v1/sessions/${id}/threads`, {
        limit: 1000,
      }),
    refetchInterval,
  });
}

/**
 * Send events into a session's log (user.message, user.tool_confirmation,
 * user.interrupt). The SSE trace picks up the results; only the session
 * object (status, usage) needs invalidating.
 */
export function useSendEvents(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (events: object[]) =>
      platformPost<{ data: SessionEvent[] }>(
        `v1/sessions/${sessionId}/events`,
        { events },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });
}

export function useVaults(params: {
  page?: string;
  include_archived?: boolean;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["vaults", params],
    queryFn: () =>
      platformGet<Page<Vault>>("v1/vaults", { limit: 20, ...params }),
    placeholderData: keepPreviousData,
  });
}

export function useVault(id: string) {
  return useQuery({
    queryKey: ["vault", id],
    queryFn: () => platformGet<Vault>(`v1/vaults/${id}`),
  });
}

export function useVaultCredentials(
  vaultId: string,
  params: { page?: string; include_archived?: boolean } = {},
) {
  return useQuery({
    queryKey: ["vault-credentials", vaultId, params],
    queryFn: () =>
      platformGet<Page<VaultCredential>>(`v1/vaults/${vaultId}/credentials`, {
        limit: 20,
        ...params,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useVaultCredential(vaultId: string, credentialId: string) {
  return useQuery({
    queryKey: ["vault-credential", vaultId, credentialId],
    queryFn: () =>
      platformGet<VaultCredential>(
        `v1/vaults/${vaultId}/credentials/${credentialId}`,
      ),
  });
}

export function useSkills(params: {
  page?: string;
  source?: "custom" | "anthropic";
  limit?: number;
}) {
  return useQuery({
    queryKey: ["skills", params],
    queryFn: () =>
      platformGet<Page<Skill>>("v1/skills", { limit: 20, ...params }),
    placeholderData: keepPreviousData,
  });
}

/** Incremental options retain pinned selections even when absent from loaded pages. */
export function useSkillOptions() {
  return useInfiniteQuery({
    queryKey: ["skills", "picker"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      platformGet<Page<Skill>>("v1/skills", { limit: 100, page: pageParam }),
    getNextPageParam: (lastPage) => lastPage.next_page || undefined,
  });
}

export function useSkill(id: string) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => platformGet<Skill>(`v1/skills/${encodeURIComponent(id)}`),
  });
}

export function useSkillVersions(id: string, page?: string) {
  return useQuery({
    queryKey: ["skill-versions", id, page],
    queryFn: () =>
      platformGet<Page<SkillVersion>>(
        `v1/skills/${encodeURIComponent(id)}/versions`,
        {
          limit: 20,
          page,
        },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useFiles(page?: string) {
  return useQuery({
    queryKey: ["files", page],
    queryFn: () =>
      platformGet<Page<PlatformFile>>("v1/files", {
        limit: 20,
        page,
      }),
    placeholderData: keepPreviousData,
  });
}

/** First 1,000 files for rubric suggestions; callers keep raw ID input. */
export function useFileOptions(enabled = true) {
  return useQuery({
    queryKey: ["file-options"],
    enabled,
    queryFn: async () => {
      const res = await platformGet<Page<PlatformFile>>("v1/files", {
        limit: FILE_OPTIONS_PAGE_LIMIT,
      });
      return { files: res.data, truncated: !!res.next_page };
    },
  });
}

export interface AgentWriteBody {
  name?: string;
  model?: unknown;
  system?: string | null;
  description?: string;
  tools?: unknown[];
  mcp_servers?: unknown[];
  skills?: unknown[];
  multiagent?: {
    type: "coordinator";
    agents: (
      { type: "self" } | { type: "agent"; id: string; version?: number }
    )[];
  } | null;
  metadata?: Record<string, string>;
  version?: number;
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: AgentWriteBody) =>
      platformPost<Agent>("v1/agents", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useUpdateAgent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: AgentWriteBody) =>
      platformPost<Agent>(`v1/agents/${encodeURIComponent(id)}`, body),
    onSuccess: (agent) => {
      queryClient.setQueryData(["agent", id], agent);
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
      void queryClient.invalidateQueries({ queryKey: ["agent-versions", id] });
    },
  });
}

export function useArchiveAgent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Archive failed" },
    mutationFn: () =>
      platformPost<Agent>(`v1/agents/${encodeURIComponent(id)}/archive`, {}),
    onSuccess: (agent) => {
      queryClient.setQueryData(["agent", id], agent);
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export interface EnvironmentWriteBody {
  name?: string;
  description?: string;
  config?: unknown;
  metadata?: Record<string, string>;
}

export function useCreateEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: EnvironmentWriteBody) =>
      platformPost<Environment>("v1/environments", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
  });
}

export function useUpdateEnvironment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: EnvironmentWriteBody) =>
      platformPost<Environment>(
        `v1/environments/${encodeURIComponent(id)}`,
        body,
      ),
    onSuccess: (environment) => {
      queryClient.setQueryData(["environment", id], environment);
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
  });
}

export function useArchiveEnvironment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Archive failed" },
    mutationFn: () =>
      platformPost<Environment>(
        `v1/environments/${encodeURIComponent(id)}/archive`,
        {},
      ),
    onSuccess: (environment) => {
      queryClient.setQueryData(["environment", id], environment);
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
  });
}

export function useDeleteEnvironment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: () =>
      platformDelete<{ id: string; type: string }>(
        `v1/environments/${encodeURIComponent(id)}`,
      ),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["environment", id] });
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
  });
}

export interface SessionCreateBody {
  agent: string | { type: "agent"; id: string; version?: number };
  environment_id: string;
  title?: string;
  vault_ids?: string[];
  resources?: ResourceInput[];
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: SessionCreateBody) =>
      platformPost<Session>("v1/sessions", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

// internal/api/sessions.go:updateSession; metadata is a patch, null is a no-op.
export interface SessionUpdateBody {
  title?: string | null;
  metadata?: Record<string, string | null> | null;
}

export function useUpdateSession(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: SessionUpdateBody) =>
      platformPost<Session>(`v1/sessions/${id}`, body),
    onSuccess: (session) => {
      client.setQueryData(["session", id], session);
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export function useArchiveSession(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Archive failed" },
    mutationFn: () => platformPost<Session>(`v1/sessions/${id}/archive`, {}),
    onSuccess: (session) => {
      client.setQueryData(["session", id], session);
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export function useDeleteSession(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: () =>
      platformDelete<{ id: string; type: string }>(`v1/sessions/${id}`),
    onSuccess: () => {
      client.removeQueries({ queryKey: ["session", id] });
      void client.invalidateQueries({ queryKey: ["sessions"] });
      // internal/api/sessions.go:deleteSession also removes session-produced files.
      void client.invalidateQueries({ queryKey: ["files"] });
      void client.invalidateQueries({ queryKey: ["file-options"] });
    },
  });
}

export function useArchiveSessionThread(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Archive thread failed" },
    mutationFn: (threadId: string) =>
      platformPost<SessionThread>(
        `v1/sessions/${sessionId}/threads/${threadId}/archive`,
        {},
      ),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["session-threads", sessionId],
      });
      void client.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });
}

export interface DeploymentWriteBody {
  name?: string;
  description?: string | null;
  agent?: string | { type: "agent"; id: string; version?: number };
  environment_id?: string;
  vault_ids?: string[] | null;
  initial_events?: object[];
  resources?: ResourceInput[] | null;
  metadata?: Record<string, string | null> | null;
  schedule?: {
    type: "cron";
    expression: string;
    timezone: string;
  } | null;
}

function deploymentMutationSuccess(
  client: ReturnType<typeof useQueryClient>,
  deployment: Deployment,
) {
  client.setQueryData(["deployment", deployment.id], deployment);
  void client.invalidateQueries({ queryKey: ["deployments"] });
}

export function useCreateDeployment() {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: DeploymentWriteBody) =>
      platformPost<Deployment>("v1/deployments", body),
    onSuccess: (deployment) => deploymentMutationSuccess(client, deployment),
  });
}

export function useUpdateDeployment(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: DeploymentWriteBody) =>
      platformPost<Deployment>(`v1/deployments/${id}`, body),
    onSuccess: (deployment) => deploymentMutationSuccess(client, deployment),
  });
}

export function useArchiveDeployment(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Archive deployment failed" },
    mutationFn: () =>
      platformPost<Deployment>(`v1/deployments/${id}/archive`, {}),
    onSuccess: (deployment) => deploymentMutationSuccess(client, deployment),
  });
}

export function usePauseDeployment(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Pause deployment failed" },
    mutationFn: () =>
      platformPost<Deployment>(`v1/deployments/${id}/pause`, {}),
    onSuccess: (deployment) => deploymentMutationSuccess(client, deployment),
  });
}

export function useUnpauseDeployment(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Resume deployment failed" },
    mutationFn: () =>
      platformPost<Deployment>(`v1/deployments/${id}/unpause`, {}),
    onSuccess: (deployment) => deploymentMutationSuccess(client, deployment),
  });
}

export function useRunDeployment(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Run deployment failed" },
    mutationFn: () =>
      platformPost<DeploymentRun>(`v1/deployments/${id}/run`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["deployment-runs"] });
      void client.invalidateQueries({ queryKey: ["deployment", id] });
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export interface DreamWriteBody {
  inputs: [
    { type: "memory_store"; memory_store_id: string },
    { type: "sessions"; session_ids: string[] },
  ];
  model: string | { id: string; speed: "standard" | "fast" };
  instructions?: string;
  output_behavior:
    | { type: "create_new" }
    | { type: "update_existing"; memory_store_id: string };
}

function dreamMutationSuccess(
  client: ReturnType<typeof useQueryClient>,
  dream: Dream,
) {
  client.setQueryData(["dream", dream.id], dream);
  void client.invalidateQueries({ queryKey: ["dreams"] });
}

export function useCreateDream() {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: DreamWriteBody) =>
      platformPost<Dream>("v1/dreams", body),
    onSuccess: (dream) => dreamMutationSuccess(client, dream),
  });
}

export function useCancelDream(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Cancel dream failed" },
    mutationFn: () => platformPost<Dream>(`v1/dreams/${id}/cancel`, {}),
    onSuccess: (dream) => dreamMutationSuccess(client, dream),
  });
}

export function useArchiveDream(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Archive dream failed" },
    mutationFn: () => platformPost<Dream>(`v1/dreams/${id}/archive`, {}),
    onSuccess: (dream) => dreamMutationSuccess(client, dream),
  });
}

export interface MemoryStoreWriteBody {
  name?: string;
  description?: string | null;
  metadata?: Record<string, string | null> | null;
}

function memoryStoreMutationSuccess(
  client: ReturnType<typeof useQueryClient>,
  store: MemoryStore,
) {
  client.setQueryData(["memory-store", store.id], store);
  void client.invalidateQueries({ queryKey: ["memory-stores"] });
}

export function useCreateMemoryStore() {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: MemoryStoreWriteBody) =>
      platformPost<MemoryStore>("v1/memory_stores", body),
    onSuccess: (store) => memoryStoreMutationSuccess(client, store),
  });
}

export function useUpdateMemoryStore(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: MemoryStoreWriteBody) =>
      platformPost<MemoryStore>(`v1/memory_stores/${id}`, body),
    onSuccess: (store) => memoryStoreMutationSuccess(client, store),
  });
}

export function useArchiveMemoryStore(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Archive memory store failed" },
    mutationFn: () =>
      platformPost<MemoryStore>(`v1/memory_stores/${id}/archive`, {}),
    onSuccess: (store) => memoryStoreMutationSuccess(client, store),
  });
}

export function useDeleteMemoryStore(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete memory store failed" },
    mutationFn: () =>
      platformDelete<{ id: string; type: "memory_store_deleted" }>(
        `v1/memory_stores/${id}`,
      ),
    onSuccess: () => {
      client.removeQueries({ queryKey: ["memory-store", id] });
      void client.invalidateQueries({ queryKey: ["memory-stores"] });
    },
  });
}

export interface MemoryWriteBody {
  path?: string;
  content?: string;
  precondition?: { type: "content_sha256"; content_sha256: string };
}

export function useCreateMemory(storeId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: Required<Pick<MemoryWriteBody, "path" | "content">>) =>
      platformPost<Memory>(
        `v1/memory_stores/${storeId}/memories?view=full`,
        body,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["memories", storeId] });
      void client.invalidateQueries({
        queryKey: ["memory-versions", storeId],
      });
    },
  });
}

export function useUpdateMemory(storeId: string, memoryId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: MemoryWriteBody) =>
      platformPost<Memory>(
        `v1/memory_stores/${storeId}/memories/${memoryId}?view=full`,
        body,
      ),
    onSuccess: (memory) => {
      client.setQueryData(["memory", storeId, memoryId], memory);
      void client.invalidateQueries({ queryKey: ["memories", storeId] });
      void client.invalidateQueries({
        queryKey: ["memory-versions", storeId],
      });
    },
  });
}

export function useDeleteMemory(storeId: string, memoryId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete memory failed" },
    mutationFn: (expectedContentSha256?: string) =>
      platformDelete<{ id: string; type: "memory_deleted" }>(
        `v1/memory_stores/${storeId}/memories/${memoryId}`,
        { expected_content_sha256: expectedContentSha256 },
      ),
    onSuccess: () => {
      client.removeQueries({ queryKey: ["memory", storeId, memoryId] });
      void client.invalidateQueries({ queryKey: ["memories", storeId] });
      void client.invalidateQueries({
        queryKey: ["memory-versions", storeId],
      });
    },
  });
}

export function useRedactMemoryVersion(storeId: string, versionId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Redact memory version failed" },
    mutationFn: () =>
      platformPost<MemoryVersion>(
        `v1/memory_stores/${storeId}/memory_versions/${versionId}/redact`,
        {},
      ),
    onSuccess: (version) => {
      client.setQueryData(["memory-version", storeId, versionId], version);
      void client.invalidateQueries({
        queryKey: ["memory-versions", storeId],
      });
      void client.invalidateQueries({ queryKey: ["memories", storeId] });
      void client.invalidateQueries({
        queryKey: ["memory", storeId, version.memory_id],
        exact: true,
      });
    },
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return platformPostForm<PlatformFile>("v1/files", form);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files"] });
      void queryClient.invalidateQueries({ queryKey: ["file-options"] });
    },
  });
}

export interface VaultWriteBody {
  display_name?: string;
  metadata?: Record<string, string | null>;
}

function vaultMutationSuccess(
  client: ReturnType<typeof useQueryClient>,
  vault: Vault,
) {
  client.setQueryData(["vault", vault.id], vault);
  void client.invalidateQueries({ queryKey: ["vaults"] });
}

export function useCreateVault() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: VaultWriteBody & { display_name: string }) =>
      platformPost<Vault>("v1/vaults", body),
    onSuccess: (vault) => vaultMutationSuccess(queryClient, vault),
  });
}

export function useUpdateVault(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: VaultWriteBody) =>
      platformPost<Vault>(`v1/vaults/${id}`, body),
    onSuccess: (vault) => vaultMutationSuccess(client, vault),
  });
}

export function useArchiveVault(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Archive failed" },
    mutationFn: () => platformPost<Vault>(`v1/vaults/${id}/archive`, {}),
    onSuccess: (vault) => {
      queryClient.setQueryData(["vault", id], vault);
      void queryClient.invalidateQueries({ queryKey: ["vaults"] });
      void queryClient.invalidateQueries({
        queryKey: ["vault-credentials", id],
      });
    },
  });
}

export function useDeleteVault(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: () =>
      platformDelete<{ id: string; type: string }>(`v1/vaults/${id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["vault", id] });
      void queryClient.invalidateQueries({ queryKey: ["vaults"] });
    },
  });
}

// ---- environment keys (the console API, plan 07)
//
// The organization segment is the platform's reserved `default`
// (internal/api/consoleapi.go:52-53): the segment exists because the
// reference's does, and v1 answers for no other value.

/** consoleapi.go:62 — both the default and the maximum page size. */
const ENVIRONMENT_KEY_LIMIT = 100;

export function useEnvironmentKeys(environmentId: string, enabled = true) {
  return useQuery({
    queryKey: ["environment-keys", environmentId],
    queryFn: () =>
      consoleGet<EnvironmentKeyPage>(
        `organizations/${CONSOLE_ORG}/environments/${environmentId}/tokens`,
        { limit: ENVIRONMENT_KEY_LIMIT },
      ),
    enabled,
  });
}

/**
 * Issue a key. The response carries the plaintext and nothing else — no id, no
 * name, no timestamps (consoleapi.go:74-79) — so the new row cannot be rendered
 * from it and the list is invalidated instead, which is the reference console's
 * own sequence.
 *
 * `errorToast: false`: the create dialog shows its own inline error, because a
 * global toast would fire behind a modal the operator is still looking at.
 *
 * `gcTime: 0`: this mutation's `data` **is** the plaintext key. A mutation's
 * result otherwise sits in the MutationCache for the default five minutes
 * after nothing is observing it, so the credential would outlive the dialog
 * that showed it by minutes, reachable from any devtools or error reporter
 * that walks the cache. Calling `reset()` on the observer is not enough — it
 * detaches the observer without removing the cached mutation, which the
 * adversarial probe in `environment-keys.test.tsx` demonstrates. With no
 * retention window the entry is removed as soon as it is unobserved.
 */
export function useCreateEnvironmentKey(environmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    gcTime: 0,
    mutationFn: (body: { name: string }) =>
      consolePost<EnvironmentKeyIssued>(
        `organizations/${CONSOLE_ORG}/environments/${environmentId}/tokens`,
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["environment-keys", environmentId],
      });
    },
  });
}

/**
 * Re-reads the environment, to tell the router catch-all from a deleted
 * environment when the console API answers 404.
 *
 * Both answer the same envelope, and `consoleEnvironment` 404s a missing
 * environment on the very route the keys section reads
 * (`consoleapi.go:127-142`). Having already loaded the environment does not
 * close that branch for good: an environment is mutable, and another operator
 * can delete it between the page's load and this request. Without the
 * re-read, that deletion would render as "this platform does not implement
 * environment keys" — a wrong and permanent-looking answer to a transient
 * fact (PR #89 review).
 *
 * `false` means the environment is gone and the 404 was about the id.
 * A network failure or a 5xx rejects, and the caller keeps showing the error
 * rather than hiding anything: only a confirmed *live* environment licenses
 * treating the first 404 as a missing endpoint. Runs only on that 404, so a
 * platform that serves the surface never pays for it.
 */
export function useEnvironmentStillExists(
  environmentId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["environment-exists", environmentId],
    enabled,
    retry: false,
    gcTime: 0,
    queryFn: async () => {
      try {
        await platformGet<unknown>(`v1/environments/${environmentId}`);
        return true;
      } catch (error) {
        if (error instanceof PlatformError && error.status === 404)
          return false;
        throw error;
      }
    },
  });
}

export function useRevokeEnvironmentKey(environmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Revoke failed" },
    mutationFn: (tokenId: string) =>
      consolePostNoContent(
        `organizations/${CONSOLE_ORG}/environments/${environmentId}/tokens/${tokenId}/revoke`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["environment-keys", environmentId],
      });
    },
  });
}

// ---- management keys (the other console namespace, plan 07 slice 4)

const KEYS_PATH = `organizations/${CONSOLE_ORG}/workspaces/${CONSOLE_WORKSPACE}/api_keys`;

/** The listing is a bare array: no envelope, no paging (consoleapikeys.go). */
export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () => consoleKeysGet<ApiKey[]>(KEYS_PATH),
  });
}

/**
 * Issue a management key.
 *
 * Unlike the environment-key issuance this response carries the **whole row**
 * plus the plaintext, so the list could in principle be rendered from it. It is
 * invalidated instead: the row the platform stored is the one worth showing,
 * and a list assembled from a create response drifts the moment the platform
 * derives a field the console did not send — `status`, here, which is computed
 * from `expires_at`.
 *
 * `errorToast: false` and `gcTime: 0` for the reasons plan 07 slice 3 wrote
 * down: the dialog shows its own error rather than a toast behind a modal, and
 * this mutation's `data` **is** the credential, so it must not outlive the
 * dialog in the mutation cache.
 */
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    gcTime: 0,
    mutationFn: (body: { name: string; expires_at?: string }) =>
      consoleKeysPost<ApiKeyIssued>(KEYS_PATH, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

/**
 * Change a key's status, its name, or both — a POST to the item, because this
 * dialect serves no PATCH and no DELETE. Retiring a key is `status: archived`,
 * which the platform treats as terminal.
 */
export function useUpdateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Update failed" },
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status?: string;
      name?: string;
    }) => consoleKeysPost<ApiKey>(`${KEYS_PATH}/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export function useAddCredential(vaultId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    gcTime: 0,
    mutationFn: (body: {
      display_name?: string;
      auth: unknown;
      metadata?: Record<string, string>;
    }) =>
      platformPost<VaultCredential>(`v1/vaults/${vaultId}/credentials`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["vault-credentials", vaultId],
      });
    },
  });
}

export interface VaultCredentialWriteBody {
  display_name?: string | null;
  auth?: unknown;
  metadata?: Record<string, string | null>;
}

export function useUpdateCredential(vaultId: string, credentialId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    gcTime: 0,
    mutationFn: (body: VaultCredentialWriteBody) =>
      platformPost<VaultCredential>(
        `v1/vaults/${vaultId}/credentials/${credentialId}`,
        body,
      ),
    onSuccess: (credential) => {
      client.setQueryData(
        ["vault-credential", vaultId, credentialId],
        credential,
      );
      void client.invalidateQueries({
        queryKey: ["vault-credentials", vaultId],
      });
    },
  });
}

export function useArchiveCredential(vaultId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Archive failed" },
    mutationFn: (credentialId: string) =>
      platformPost<VaultCredential>(
        `v1/vaults/${vaultId}/credentials/${credentialId}/archive`,
        {},
      ),
    onSuccess: (credential) => {
      queryClient.setQueryData(
        ["vault-credential", vaultId, credential.id],
        credential,
      );
      void queryClient.invalidateQueries({
        queryKey: ["vault-credentials", vaultId],
      });
    },
  });
}

export function useDeleteCredential(vaultId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: (credentialId: string) =>
      platformDelete<{ id: string; type: string }>(
        `v1/vaults/${vaultId}/credentials/${credentialId}`,
      ),
    onSuccess: (_, credentialId) => {
      queryClient.removeQueries({
        queryKey: ["vault-credential", vaultId, credentialId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["vault-credentials", vaultId],
      });
    },
  });
}

export function useValidateOAuthCredential(vaultId: string) {
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (credentialId: string) =>
      platformPost<Record<string, unknown>>(
        `v1/vaults/${vaultId}/credentials/${credentialId}/mcp_oauth_validate`,
        {},
      ),
  });
}

export function useUploadSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: ({
      files: skillFiles,
      displayName,
    }: {
      files: File[];
      displayName?: string;
    }) => {
      const form = new FormData();
      for (const file of skillFiles)
        form.append("files[]", file, file.webkitRelativePath || file.name);
      if (displayName) form.append("display_name", displayName);
      return platformPostForm<Skill>("v1/skills", form);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useUploadSkillVersion(skillId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Upload failed" },
    mutationFn: (skillFiles: File[]) => {
      const form = new FormData();
      for (const file of skillFiles)
        form.append("files[]", file, file.webkitRelativePath || file.name);
      return platformPostForm<SkillVersion>(
        `v1/skills/${encodeURIComponent(skillId)}/versions`,
        form,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skill", skillId] });
      void queryClient.invalidateQueries({
        queryKey: ["skill-versions", skillId],
      });
    },
  });
}

export function useDeleteSkillVersion(skillId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: (version: string) =>
      platformDelete<{ id: string; type: string }>(
        `v1/skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skill", skillId] });
      void queryClient.invalidateQueries({
        queryKey: ["skill-versions", skillId],
      });
    },
  });
}

export function useDeleteSkill(skillId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: () =>
      platformDelete<{ id: string; type: string }>(
        `v1/skills/${encodeURIComponent(skillId)}`,
      ),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["skill", skillId] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: (fileId: string) =>
      platformDelete<{ id: string; type: string }>(`v1/files/${fileId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files"] });
      void queryClient.invalidateQueries({ queryKey: ["file-options"] });
    },
  });
}
/** Apply the existing single-resource routes; retain each failure for retry. */
export function useBatchEnvironments() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: async ({
      ids,
      action,
    }: {
      ids: string[];
      action: "archive" | "delete";
    }) => {
      const succeeded: string[] = [];
      const failed: { id: string; error: unknown }[] = [];
      for (const id of ids) {
        try {
          const path = "v1/environments/" + encodeURIComponent(id);
          if (action === "archive") {
            const environment = await platformPost<Environment>(
              path + "/archive",
              {},
            );
            queryClient.setQueryData(["environment", id], environment);
          } else {
            await platformDelete<{ id: string; type: string }>(path);
            queryClient.removeQueries({ queryKey: ["environment", id] });
          }
          succeeded.push(id);
        } catch (error) {
          failed.push({ id, error });
        }
      }
      return { succeeded, failed };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
  });
}
