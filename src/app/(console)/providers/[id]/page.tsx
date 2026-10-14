"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSection, Field, FieldList } from "@/components/console/detail";
import { Day, DetailSkeleton, ErrorState } from "@/components/console/bits";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { IdCell } from "@/components/console/copy-id";
import { ResourceActions } from "@/components/console/resource-actions";
import {
  EnabledBadge,
  PlainHttpBadge,
  ProtocolBadge,
  endpointEntries,
  isPlainHttp,
  vendorLabel,
} from "@/components/console/gateway-bits";
import { Button } from "@/components/ui/button";
import {
  useDeleteGatewayProvider,
  useGatewayProfiles,
  useGatewayProvider,
  useUpdateGatewayProvider,
} from "@/lib/platform/gateway-queries";

export default function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: provider, error, isPending } = useGatewayProvider(id);
  const profiles = useGatewayProfiles();
  const update = useUpdateGatewayProvider(id);
  const remove = useDeleteGatewayProvider(id);

  if (error) return <ErrorState error={error} />;
  if (isPending || !provider) return <DetailSkeleton />;

  const headers = Object.entries(provider.headers);
  return (
    <div>
      <Breadcrumb
        parent={{ href: "/providers", label: "Providers" }}
        current={provider.name}
      />
      <PageHeader
        title={provider.name}
        actions={
          <div className="flex items-center gap-2">
            <EnabledBadge enabled={provider.enabled} />
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={update.isPending}
              onClick={() => update.mutate({ enabled: !provider.enabled })}
            >
              {provider.enabled ? "Disable" : "Enable"}
            </Button>
            <ResourceActions
              resource="provider"
              deleteDescription="Deleting removes the provider and its keys. The gateway refuses while the provider has upstream models."
              onDelete={() =>
                remove.mutate(undefined, {
                  onSuccess: () => router.push("/providers"),
                })
              }
              deletePending={remove.isPending}
            />
          </div>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={provider.id} />
          </Field>
          <Field label="Vendor">
            {vendorLabel(provider, profiles.data?.data)}{" "}
            <span className="font-mono text-[13px] text-muted-foreground">
              {provider.profile}
            </span>
          </Field>
          <Field label="Endpoints">
            <div className="grid gap-1">
              {endpointEntries(provider).map((e) => (
                <span key={e.protocol} className="flex items-center gap-2">
                  <ProtocolBadge protocol={e.protocol} />
                  <span className="font-mono text-[13px]">{e.url}</span>
                  {isPlainHttp(e.url) && <PlainHttpBadge />}
                </span>
              ))}
              <span className="text-[13px] text-muted-foreground">
                Fixed at creation. Another host or account is another provider.
              </span>
            </div>
          </Field>
          <Field label="Extra headers">
            {headers.length === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              <div className="grid gap-0.5 font-mono text-[13px]">
                {headers.map(([name, value]) => (
                  <span key={name}>
                    {name}: {value}
                  </span>
                ))}
              </div>
            )}
          </Field>
          <Field label="Stall timeout">
            <span data-stall-timeout-ms={provider.stall_timeout_ms ?? ""}>
              {provider.stall_timeout_ms === null
                ? "Gateway default"
                : `${provider.stall_timeout_ms.toLocaleString("en-US")} ms`}
            </span>
          </Field>
          <Field label="Trace context">
            {provider.propagate_trace ? "Sent" : "Not sent"}
          </Field>
          <Field label="Created">
            <Day iso={provider.created_at} />
          </Field>
          <Field label="Updated">
            <Day iso={provider.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
    </div>
  );
}
