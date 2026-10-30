"use client";
import {
  downloadResource,
  isNativeConsole,
  resourceURL,
} from "@/lib/platform/http";
import { toastPlatformError } from "@/lib/platform/toast-error";

/** Native downloads inspect admission before saving bytes. Legacy links stay unchanged. */
export function ResourceDownload({
  path,
  filename,
  children,
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
        if (!isNativeConsole()) return;
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
