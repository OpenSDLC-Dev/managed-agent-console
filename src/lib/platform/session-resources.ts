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
      // The mount mints the session's own copy (sessionresources.go
      // mountFileCopy); the rubric picker reads the same list.
      void client.invalidateQueries({
        queryKey: ["session-files", sessionId],
      });
    },
  });
}

/**
 * Deletes one of the session's own files: an output, or a copy no resource
 * mounts any more. files.go deleteFile takes either as it takes an upload; a
 * copy's upload keeps its bytes. Only the session's list ever carried them.
 */
export function useDeleteSessionFile(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Delete failed" },
    mutationFn: (fileId: string) =>
      platformDelete<{ id: string; type: string }>(
        `v1/files/${encodeURIComponent(fileId)}`,
      ),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["session-files", sessionId],
      });
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
