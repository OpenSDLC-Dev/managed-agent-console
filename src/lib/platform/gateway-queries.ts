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
  GatewayCredential,
  GatewayDeployment,
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

export function useUpdateGatewayProvider(id: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Update failed" },
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
