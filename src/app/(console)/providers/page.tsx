"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  EmptyState,
  ErrorState,
  UnavailableSurface,
} from "@/components/console/bits";
import { IdCell } from "@/components/console/copy-id";
import { AddProviderButton } from "@/components/console/add-provider-dialog";
import {
  EnabledBadge,
  PlainHttpBadge,
  ProtocolBadge,
  endpointEntries,
  isPlainHttp,
  vendorLabel,
} from "@/components/console/gateway-bits";
import {
  useGatewayCredentialLists,
  useGatewayDeployments,
  useGatewayProfiles,
  useGatewayProviders,
} from "@/lib/platform/gateway-queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import type { GatewayProvider } from "@/lib/platform/types";

/** A count, or a dash while its own read is pending or failed. */
function Count({ value }: { value: number | undefined }) {
  return (
    <span className="tabular-nums" data-count={value ?? ""}>
      {value ?? "—"}
    </span>
  );
}

export default function ProvidersPage() {
  const router = useRouter();
  const { data, error, isPending } = useGatewayProviders();
  const profiles = useGatewayProfiles();
  const deployments = useGatewayDeployments();
  const providers = data?.data ?? [];
  const credentials = useGatewayCredentialLists(providers.map((p) => p.id));

  if (isUnimplemented(error)) return <UnavailableSurface surface="providers" />;

  const keyCount = (index: number) => credentials[index]?.data?.data.length;
  const modelCount = (id: string) =>
    deployments.data?.data.filter((d) => d.provider_id === id).length;

  const columns: Column<GatewayProvider>[] = [
    { key: "id", header: "ID", cell: (p) => <IdCell id={p.id} /> },
    { key: "name", header: "Name", className: "w-full", cell: (p) => p.name },
    {
      key: "vendor",
      header: "Vendor",
      cell: (p) => (
        <span className="whitespace-nowrap" data-profile={p.profile}>
          {vendorLabel(p, profiles.data?.data)}
        </span>
      ),
    },
    {
      key: "endpoints",
      header: "Endpoints",
      cell: (p) => {
        const entries = endpointEntries(p);
        return (
          <span className="flex gap-1 whitespace-nowrap">
            {entries.map((e) => (
              <ProtocolBadge key={e.protocol} protocol={e.protocol} />
            ))}
            {entries.some((e) => isPlainHttp(e.url)) && <PlainHttpBadge />}
          </span>
        );
      },
    },
    {
      key: "keys",
      header: "Keys",
      className: "text-right",
      cell: (p) => <Count value={keyCount(providers.indexOf(p))} />,
    },
    {
      key: "models",
      header: "Upstream models",
      className: "text-right whitespace-nowrap",
      cell: (p) => <Count value={modelCount(p.id)} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => <EnabledBadge enabled={p.enabled} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Providers"
        subtitle={SURFACES.providers.blurb}
        actions={<AddProviderButton />}
      />
      {error ? (
        <ErrorState error={error} />
      ) : (
        <DataTable
          columns={columns}
          rows={providers}
          rowKey={(p) => p.id}
          loading={isPending}
          onRowClick={(p) => router.push(`/providers/${p.id}`)}
          empty={
            <EmptyState
              title="No providers yet"
              hint="Add a vendor account, then its keys and upstream models."
              action={<AddProviderButton />}
            />
          }
        />
      )}
    </div>
  );
}
