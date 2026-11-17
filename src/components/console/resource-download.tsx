"use client";
import { downloadResource, resourceURL } from "@/lib/platform/http";
import { toastPlatformError } from "@/lib/platform/toast-error";

/** Downloads inspect session admission before saving bytes. */
export function ResourceDownload({
  path,
  filename,
  children,
  onClick,
  ...props
}: { path: string; filename: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "download"
>) {
  return (
    <a
      {...props}
      href={resourceURL(path)}
      download={filename}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        void downloadResource(path, filename).catch((error) =>
          toastPlatformError(error, "Download failed"),
        );
      }}
    >
      {children}
    </a>
  );
}
