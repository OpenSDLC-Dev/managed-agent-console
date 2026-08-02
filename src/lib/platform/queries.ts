"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  platformDelete,
  platformGet,
  platformPost,
  platformPostForm,
  type ClassicPage,
  type Page,
} from "./http";
import type {
  Agent,
  Environment,
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
}) {
  return useQuery({
    queryKey: ["agents", params],
    queryFn: () =>
      platformGet<Page<Agent>>("v1/agents", { limit: 20, ...params }),
    placeholderData: keepPreviousData,
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
    meta: { errorToast: false },
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
      displayTitle,
    }: {
      files: File[];
      displayTitle?: string;
    }) => {
      const form = new FormData();
      for (const file of skillFiles) form.append("files[]", file);
      if (displayTitle) form.append("display_title", displayTitle);
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
    meta: { errorToast: false },
    mutationFn: (skillFiles: File[]) => {
      const form = new FormData();
      for (const file of skillFiles) form.append("files[]", file);
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
    meta: { errorToast: false },
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
    meta: { errorToast: false },
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
    meta: { errorToast: false },
    mutationFn: (fileId: string) =>
      platformDelete<{ id: string; type: string }>(`v1/files/${fileId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });
}
