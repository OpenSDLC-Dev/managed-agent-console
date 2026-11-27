import { notFound, redirect } from "next/navigation";
import { WorkspaceDetails } from "@/components/console/workspace-settings";
import { validWorkspace } from "@/lib/platform/tenancy";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { id } = await params;
  if (!validWorkspace(id)) notFound();
  if ((await searchParams).workspace !== id)
    redirect("/settings/workspaces/" + id + "?workspace=" + id);
  return <WorkspaceDetails id={id} />;
}
