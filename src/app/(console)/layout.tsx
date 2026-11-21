import { ConsoleSessionBoundary } from "@/components/shell/console-session";
import { ConsoleShell } from "@/components/shell/console-shell";
import { Providers } from "@/components/shell/providers";
import { SidebarFooter } from "@/components/shell/sidebar-footer";
import { SurfaceGuard } from "@/components/shell/surface-guard";
import pkg from "../../../package.json";

export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Providers>
      <ConsoleSessionBoundary>
        <ConsoleShell footer={<SidebarFooter consoleVersion={pkg.version} />}>
          <SurfaceGuard>{children}</SurfaceGuard>
        </ConsoleShell>
      </ConsoleSessionBoundary>
    </Providers>
  );
}
