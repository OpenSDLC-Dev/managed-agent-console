import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as gateway from "./playground";
import { usePlaygroundModels } from "./playground-queries";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shares the current principal's chat list and stays idle without an admitted principal", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  const fetchModels = vi
    .spyOn(gateway, "playgroundModels")
    .mockResolvedValueOnce([{ id: "alpha", display_name: "Alpha" }])
    .mockResolvedValueOnce([{ id: "beta", display_name: "Beta" }]);
  const { result, rerender } = renderHook(
    ({ principalId }: { principalId?: string }) =>
      usePlaygroundModels(principalId),
    {
      initialProps: {},
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  expect(result.current.fetchStatus).toBe("idle");
  expect(fetchModels).not.toHaveBeenCalled();
  rerender({ principalId: "first" });
  await waitFor(() => expect(result.current.data?.[0].id).toBe("alpha"));
  rerender({ principalId: "second" });
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.data?.[0].id).toBe("beta"));
  rerender({ principalId: undefined });
  expect(result.current.data).toBeUndefined();
  expect(result.current.fetchStatus).toBe("idle");
  rerender({ principalId: "first" });
  expect(result.current.data?.[0].id).toBe("alpha");
  expect(fetchModels).toHaveBeenCalledTimes(2);
});
