import { surfacePaths } from "@/lib/routes";
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
  const status = Array.isArray(filters.status)
    ? filters.status[0]
    : filters.status;
  const search = Array.isArray(filters.q) ? filters.q[0] : filters.q;
  if (status === "archived") query.set("status", status);
  if (search) query.set("q", search);
  const listHref =
    surfacePaths["service-accounts"] + (query.size ? "?" + query : "");
  return <ServiceAccountDetail key={id} id={id} listHref={listHref} />;
}
