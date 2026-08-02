"use client";

import { useState } from "react";

/**
 * Pager state for the platform's unidirectional keyset cursors: the response
 * only carries next_page, so "previous" is a client-side stack of the tokens
 * we came through. Reset whenever filters change (pass a key).
 */
export function useCursorPage(resetKey: string) {
  const [state, setState] = useState({
    key: resetKey,
    page: undefined as string | undefined,
    stack: [] as (string | undefined)[],
  });

  // Filters changed since last render — start over from the first page.
  const current =
    state.key === resetKey
      ? state
      : { key: resetKey, page: undefined, stack: [] };

  return {
    page: current.page,
    hasPrev: current.stack.length > 0,
    goNext: (nextToken: string) =>
      setState({
        key: resetKey,
        page: nextToken,
        stack: [...current.stack, current.page],
      }),
    goPrev: () => {
      if (current.stack.length === 0) return;
      setState({
        key: resetKey,
        page: current.stack[current.stack.length - 1],
        stack: current.stack.slice(0, -1),
      });
    },
  };
}
