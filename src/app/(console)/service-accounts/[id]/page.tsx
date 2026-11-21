import { ServiceAccountDetail } from "@/components/console/service-account-detail";

export default async function ServiceAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams();
  if (filters.status === "archived") query.set("status", "archived");
  if (typeof filters.q === "string" && filters.q) query.set("q", filters.q);
  const listHref = "/service-accounts" + (query.size ? "?" + query : "");
  return <ServiceAccountDetail key={id} id={id} listHref={listHref} />;
}
