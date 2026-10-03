"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { platformDelete, platformPost } from "./http";
import type { PlatformFile, SessionResource } from "./types";

/**
 * Whether a file's content is gone: store.FileLiveSQL holds a row whose
 * `expires_at` has passed to have none, so nothing downloads, mounts or
 * grades it, though its metadata still lists. A rendering derivation against
 * a caller-supplied clock (environmentKeyState's precedent); a null or
 * unparseable expiry is not evidence of one.
 */
export function fileExpired(
  file: Pick<PlatformFile, "expires_at">,
  now: number,
): boolean {
  const at = file.expires_at ? Date.parse(file.expires_at) : NaN;
  return !Number.isNaN(at) && at <= now;
}

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
    // The mount mints the session's own copy (sessionresources.go
    // mountFileCopy), which the session's file list (and the rubric picker,
    // reading the same list) then carries. The session is read first: until
    // it names the new mount, its copy would list as a leftover
    // (SessionResources). Both reads settle before the mutation does.
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["session", sessionId] });
      await client.invalidateQueries({
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
