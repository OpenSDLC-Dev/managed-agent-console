import { Playground } from "@/components/console/playground";

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string | string[] }>;
}) {
  const { model } = await searchParams;
  const requestedAlias = Array.isArray(model) ? model[0] : model;
  return <Playground requestedAlias={requestedAlias || undefined} />;
}
