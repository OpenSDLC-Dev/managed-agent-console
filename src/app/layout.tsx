import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import "./globals.css";
import { UnsavedChangesProvider } from "@/components/shell/unsaved-changes";

export const metadata: Metadata = {
  title: "Managed Agents Console",
  description:
    "Web console for managed-agent-platform — self-hosted long-horizon AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
      </body>
    </html>
  );
}
