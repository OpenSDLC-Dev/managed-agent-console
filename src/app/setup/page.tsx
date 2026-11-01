import { notFound } from "next/navigation";
import { consoleAuthMode } from "@/lib/identity/mode";
import { NativeAuth } from "@/components/console/native-auth";
export default function SetupPage() {
  if (consoleAuthMode().kind !== "platform") notFound();
  return <NativeAuth setup />;
}
