"use client";
import { use } from "react";
import { EnvironmentDetail } from "@/components/console/environment-detail";
export default function EnvironmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EnvironmentDetail key={id} id={id} />;
}
