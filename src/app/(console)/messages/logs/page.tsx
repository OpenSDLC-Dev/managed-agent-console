import { Suspense } from "react";
import { MessageLogs } from "@/components/console/message-logs";

export default function MessageLogsPage() {
  return (
    <Suspense>
      <MessageLogs />
    </Suspense>
  );
}
