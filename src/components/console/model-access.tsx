import type { ApiKey } from "@/lib/platform/types";

/** The key list does not carry its owner's current role or status. */
export function ModelAccessCell({ apiKey }: { apiKey: ApiKey }) {
  return (
    <span
      className="text-muted-foreground"
      data-models={apiKey.principal ? "owner" : "unowned"}
    >
      {apiKey.principal ? "Owner's role · organization limits" : "No owner"}
    </span>
  );
}
