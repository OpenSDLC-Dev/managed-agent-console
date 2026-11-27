"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, type ComponentProps } from "react";
import { workspaceHref } from "@/lib/platform/tenancy";

export const WorkspaceContext = createContext("default");

export default function WorkspaceLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const space = useContext(WorkspaceContext);
  return <Link {...props} href={workspaceHref(href, space)} />;
}

export function useWorkspaceRouter() {
  const router = useRouter();
  const space = useContext(WorkspaceContext);
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) =>
        options === undefined
          ? router.push(workspaceHref(href, space))
          : router.push(workspaceHref(href, space), options),
      replace: (
        href: string,
        options?: Parameters<typeof router.replace>[1],
      ) =>
        options === undefined
          ? router.replace(workspaceHref(href, space))
          : router.replace(workspaceHref(href, space), options),
      prefetch: (
        href: string,
        options?: Parameters<typeof router.prefetch>[1],
      ) =>
        options === undefined
          ? router.prefetch(workspaceHref(href, space))
          : router.prefetch(workspaceHref(href, space), options),
    }),
    [router, space],
  );
}
