"use client";

import { use } from "react";
import { SkillDetail } from "@/components/console/skill-detail";

export default function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <SkillDetail id={id} />;
}
