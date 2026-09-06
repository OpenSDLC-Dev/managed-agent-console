"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { platformDelete, platformPost } from "./http";
import type { SessionResource } from "./types";

// internal/api/sessionresources.go:parseResourceObject, addSessionResourceTx.
export type ResourceInput =
  | { type: "file"; file_id: string; mount_path?: string }
  | {
      type: "github_repository";
      url: string;
      authorization_token: string;
      mount_path?: string;
      checkout?:
        { type: "branch"; name: string } | { type: "commit"; sha: string };
    }
  | {
      type: "memory_store";
      memory_store_id: string;
      access?: "read_only" | "read_write";
      instructions?: string;
    };

export function useAddSessionFile(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: Extract<ResourceInput, { type: "file" }>) =>
      platformPost<SessionResource>(`v1/sessions/${sessionId}/resources`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });
}

export function useRemoveSessionResource(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Remove resource failed" },
    mutationFn: (resourceId: string) =>
      platformDelete(`v1/sessions/${sessionId}/resources/${resourceId}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });
}

export function useRotateRepositoryToken(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: ({
      resourceId,
      token,
    }: {
      resourceId: string;
      token: string;
    }) =>
      platformPost<SessionResource>(
        `v1/sessions/${sessionId}/resources/${resourceId}`,
        { authorization_token: token },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });
}
