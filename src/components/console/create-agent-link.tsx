import { surfacePaths } from "@/lib/routes";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CreateAgentLink({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) {
  return (
    <Link
      className={cn(buttonVariants({ variant }), "h-8")}
      href={`${surfacePaths.agents}/new`}
    >
      {variant === "default" && <Plus className="size-4" />}Create agent
    </Link>
  );
}
