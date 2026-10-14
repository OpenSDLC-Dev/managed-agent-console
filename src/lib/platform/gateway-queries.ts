"use client";

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { gatewayDelete, gatewayGet, gatewayPost } from "./http";
import type {
  GatewayAlias,
  GatewayCredential,
  GatewayDeployment,
  GatewayKind,
  GatewayProfile,
  GatewayProtocol,
  GatewayProvider,
} from "./types";

/**
 * Query hooks for the model gateway's admin API (plan 10), apart from
 * `queries.ts` because they talk to another server through another BFF. Every
 * key starts with `gateway`, so one invalidation can refresh the whole surface.
 *
 * The admin API's lists are unpaged `{data}` envelopes
 * (`internal/modelgateway/admin/admin.go` listView): a gateway holds a handful
 * of providers, not a page of them.
 */

interface List<T> {
  data: T[];
}

export function useGatewayProfiles() {
  return useQuery({
    queryKey: ["gateway", "profiles"],
    queryFn: () => gatewayGet<List<GatewayProfile>>("profiles"),
    // Compiled into the gateway binary (profile/profile.go): they change only
    // with a gateway release.
    staleTime: Infinity,
  });
}

export function useGatewayProviders() {
  return useQuery({
    queryKey: ["gateway", "providers"],
    queryFn: () => gatewayGet<List<GatewayProvider>>("providers"),
  });
}

export function useGatewayProvider(id: string) {
  return useQuery({
    queryKey: ["gateway", "provider", id],
    queryFn: () => gatewayGet<GatewayProvider>(`providers/${id}`),
  });
}

const credentialsQuery = (providerId: string) => ({
  queryKey: ["gateway", "credentials", providerId],
  queryFn: () =>
    gatewayGet<List<GatewayCredential>>(`providers/${providerId}/credentials`),
});

export function useGatewayCredentials(providerId: string) {
  return useQuery(credentialsQuery(providerId));
}

/**
 * Each provider's keys, for the list's count column. The admin API has no
 * cross-provider credential list, so this is one read per provider — cached
 * under the key the provider's own page reads.
 */
export function useGatewayCredentialLists(providerIds: string[]) {
  return useQueries({ queries: providerIds.map(credentialsQuery) });
}

export function useGatewayDeployments() {
  return useQuery({
    queryKey: ["gateway", "deployments"],
    queryFn: () => gatewayGet<List<GatewayDeployment>>("deployments"),
  });
}

/** providers.go createProvider — the fields the console sends. */
export interface GatewayProviderCreate {
  name: string;
  profile: string;
  endpoints: Partial<Record<GatewayProtocol, string>>;
  stall_timeout_ms?: number;
  propagate_trace?: boolean;
}

/** providers.go updateProvider — named fields only; the rest stay unchanged. */
export type GatewayProviderUpdate = Partial<
  Pick<
    GatewayProvider,
    "name" | "headers" | "stall_timeout_ms" | "propagate_trace" | "enabled"
  >
>;

function providerChanged(client: QueryClient, provider: GatewayProvider) {
  client.setQueryData(["gateway", "provider", provider.id], provider);
  void client.invalidateQueries({ queryKey: ["gateway", "providers"] });
}

/** The dialog shows the gateway's refusal itself, so no toast behind it. */
export function useCreateGatewayProvider() {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: GatewayProviderCreate) =>
      gatewayPost<GatewayProvider>("providers", body),
    onSuccess: (provider) => providerChanged(client, provider),
  });
}

/** `errorToast: false` is for the Edit dialog, which shows the refusal itself. */
export function useUpdateGatewayProvider(
  id: string,
  { errorToast = true } = {},
) {
  const client = useQueryClient();
  return useMutation({
    meta: errorToast ? { errorTitle: "Update failed" } : { errorToast: false },
    mutationFn: (body: GatewayProviderUpdate) =>
      gatewayPost<GatewayProvider>(`providers/${id}`, body),
    onSuccess: (provider) => providerChanged(client, provider),
  });
}

/**
 * Refused with a 409 while the provider has upstream models
 * (store/providers.go). The toast carries the gateway's own message, which
 * names them.
 */
export function useDeleteGatewayProvider(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: () =>
      gatewayDelete<{ type: "provider_deleted"; id: string }>(
        `providers/${id}`,
      ),
    onSuccess: () => {
      client.removeQueries({ queryKey: ["gateway", "provider", id] });
      client.removeQueries({ queryKey: ["gateway", "credentials", id] });
      void client.invalidateQueries({ queryKey: ["gateway", "providers"] });
    },
  });
}

export function useGatewayAliases() {
  return useQuery({
    queryKey: ["gateway", "aliases"],
    queryFn: () => gatewayGet<List<GatewayAlias>>("aliases"),
  });
}

/**
 * providers.go createCredential. `protocols` left out is every protocol the
 * provider has an endpoint for (store/credentials.go).
 */
export interface GatewayCredentialCreate {
  key: string;
  protocols?: GatewayProtocol[];
  weight?: number;
}

export type GatewayCredentialUpdate = Partial<
  Pick<GatewayCredential, "protocols" | "weight" | "enabled">
>;

/**
 * Add a vendor key. Its variables **are** the key, so the mutation keeps
 * nothing once it settles (`gcTime: 0`), as the management-key issuance does:
 * the gateway seals the key and no one can read it back, and the console must
 * not be the place it survives.
 */
export function useCreateGatewayCredential(providerId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    gcTime: 0,
    mutationFn: (body: GatewayCredentialCreate) =>
      gatewayPost<GatewayCredential>(
        `providers/${providerId}/credentials`,
        body,
      ),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: ["gateway", "credentials", providerId],
      }),
  });
}

export function useUpdateGatewayCredential(providerId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Update failed" },
    mutationFn: ({ id, ...body }: GatewayCredentialUpdate & { id: string }) =>
      gatewayPost<GatewayCredential>(
        `providers/${providerId}/credentials/${id}`,
        body,
      ),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: ["gateway", "credentials", providerId],
      }),
  });
}

export function useDeleteGatewayCredential(providerId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: (id: string) =>
      gatewayDelete<{ type: "credential_deleted"; id: string }>(
        `providers/${providerId}/credentials/${id}`,
      ),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: ["gateway", "credentials", providerId],
      }),
  });
}

/** deployments.go createDeployment. A price left out is unpriced. */
export interface GatewayDeploymentCreate {
  provider_id: string;
  upstream_model: string;
  kind: GatewayKind;
  display_name?: string;
  capabilities: GatewayDeployment["capabilities"];
  prices: Partial<GatewayDeployment["prices"]>;
}

/** deployments.go updateDeployment: capabilities and prices are replaced whole. */
export type GatewayDeploymentUpdate = Partial<
  Pick<
    GatewayDeployment,
    "display_name" | "capabilities" | "prices" | "enabled"
  >
>;

export function useCreateGatewayDeployment() {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: GatewayDeploymentCreate) =>
      gatewayPost<GatewayDeployment>("deployments", body),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["gateway", "deployments"] }),
  });
}

/**
 * `errorToast: false` is for the edit dialog, which shows the gateway's
 * refusal itself; a row's Enable/Disable has nowhere else to show it.
 */
export function useUpdateGatewayDeployment({ errorToast = true } = {}) {
  const client = useQueryClient();
  return useMutation({
    meta: errorToast ? { errorTitle: "Update failed" } : { errorToast: false },
    mutationFn: ({ id, ...body }: GatewayDeploymentUpdate & { id: string }) =>
      gatewayPost<GatewayDeployment>(`deployments/${id}`, body),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["gateway", "deployments"] }),
  });
}

/**
 * Refused with a 409 while a model routes to it (store/deployments.go); the
 * toast carries the gateway's message, which names the models.
 */
export function useDeleteGatewayDeployment() {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: (id: string) =>
      gatewayDelete<{ type: "deployment_deleted"; id: string }>(
        `deployments/${id}`,
      ),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["gateway", "deployments"] }),
  });
}

/** aliases.go targetJSON — a weight left out is 1. */
export type GatewayTargetInput = GatewayAlias["targets"][number];

/**
 * A model's path. `gatewayGet` and friends encode each part, so a name may
 * hold any character the wire allows; its own slashes stay separators, which
 * the gateway's `{name...}` route joins back.
 */
export const aliasPath = (name: string) => `aliases/${name}`;

function aliasChanged(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ["gateway", "aliases"] });
  // "Used by" on a provider's page reads the aliases too.
  void client.invalidateQueries({ queryKey: ["gateway", "deployments"] });
}

/** aliases.go createAlias — the kind is the targets', so it is not sent. */
export function useCreateGatewayAlias() {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: {
      name: string;
      display_name?: string;
      targets: GatewayTargetInput[];
    }) => gatewayPost<GatewayAlias>("aliases", body),
    onSuccess: () => aliasChanged(client),
  });
}

/** aliases.go updateAlias — `targets`, when named, replaces them whole. */
export function useUpdateGatewayAlias(name: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: {
      display_name?: string;
      targets?: GatewayTargetInput[];
    }) => gatewayPost<GatewayAlias>(aliasPath(name), body),
    onSuccess: () => aliasChanged(client),
  });
}

/**
 * Refused with a 409 while a key policy grants the model (store/aliases.go);
 * the toast carries the gateway's message, which names the keys.
 */
export function useDeleteGatewayAlias(name: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: () =>
      gatewayDelete<{ type: "alias_deleted"; name: string }>(aliasPath(name)),
    onSuccess: () => aliasChanged(client),
  });
}
