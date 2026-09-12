import { redirect } from "next/navigation";

export default async function EditDeploymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/deployments/${encodeURIComponent(id)}`);
}
