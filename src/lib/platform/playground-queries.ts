"use client";

import { useQuery } from "@tanstack/react-query";
import { playgroundModels } from "./playground";

/** The session-owned chat alias list is shared by Playground and its entry links. */
export function usePlaygroundModels(principalId: string | undefined) {
  return useQuery({
    queryKey: ["playground-models", principalId],
    queryFn: ({ signal }) => playgroundModels(signal),
    enabled: Boolean(principalId),
    retry: false,
  });
}
