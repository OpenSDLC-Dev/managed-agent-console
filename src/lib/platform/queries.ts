"use client";

import {
  useMutation,
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
  type ClassicPage,
  type Page,
} from "./http";
import { CONSOLE_ORG, CONSOLE_WORKSPACE } from "./surfaces";
import type {
  Agent,
  ApiKey,
  ApiKeyIssued,
  Environment,
  EnvironmentKeyIssued,
  EnvironmentKeyPage,
  PlatformFile,
  Session,
  SessionEvent,
  SessionStatus,
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
    queryFn: () => platformGet<Agent>(`v1/agents/${id}`),
  });
}

export function useAgentVersions(id: string, page?: string) {
  return useQuery({
    queryKey: ["agent-versions", id, page],
    queryFn: () =>
      platformGet<Page<Agent>>(`v1/agents/${id}/versions`, {
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
    queryFn: () => platformGet<Environment>(`v1/environments/${id}`),
  });
}

export function useSessions(params: {
  page?: string;
  statuses?: SessionStatus[];
  agent_id?: string;
  order?: "asc" | "desc";
  include_archived?: boolean;
  "created_at[gte]"?: string;
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
    queryFn: () => platformGet<Session>(`v1/sessions/${id}`),
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

export function useVaultCredentials(vaultId: string, page?: string) {
  return useQuery({
    queryKey: ["vault-credentials", vaultId, page],
    queryFn: () =>
      platformGet<Page<VaultCredential>>(`v1/vaults/${vaultId}/credentials`, {
        limit: 20,
        page,
        include_archived: true,
      }),
    placeholderData: keepPreviousData,
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

export function useSkill(id: string) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => platformGet<Skill>(`v1/skills/${id}`),
  });
}

export function useSkillVersions(id: string, page?: string) {
  return useQuery({
    queryKey: ["skill-versions", id, page],
    queryFn: () =>
      platformGet<Page<SkillVersion>>(`v1/skills/${id}/versions`, {
        limit: 20,
        page,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useFiles(afterId?: string) {
  return useQuery({
    queryKey: ["files", afterId],
    queryFn: () =>
      platformGet<ClassicPage<PlatformFile>>("v1/files", {
        limit: 20,
        after_id: afterId,
      }),
    placeholderData: keepPreviousData,
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
      platformPost<Agent>(`v1/agents/${id}`, body),
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
    mutationFn: () => platformPost<Agent>(`v1/agents/${id}/archive`, {}),
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
      platformPost<Environment>(`v1/environments/${id}`, body),
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
      platformPost<Environment>(`v1/environments/${id}/archive`, {}),
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
      platformDelete<{ id: string; type: string }>(`v1/environments/${id}`),
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
  resources?: { type: "file"; file_id: string; mount_path?: string }[];
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
    },
  });
}

export function useCreateVault() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: { display_name: string }) =>
      platformPost<Vault>("v1/vaults", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vaults"] });
    },
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
    mutationFn: (body: { display_name?: string; auth: unknown }) =>
      platformPost<VaultCredential>(`v1/vaults/${vaultId}/credentials`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
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
    onSuccess: () => {
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
    onSuccess: () => {
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
        `v1/skills/${skillId}/versions`,
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
        `v1/skills/${skillId}/versions/${version}`,
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
      platformDelete<{ id: string; type: string }>(`v1/skills/${skillId}`),
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
    },
  });
}
