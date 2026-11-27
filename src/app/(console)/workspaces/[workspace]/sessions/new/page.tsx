"use client";

import { PageHeader } from "@/components/shell/page-header";
import { SessionCreateForm } from "@/components/console/session-create-form";

export default function NewSessionPage() {
  return (
    <div>
      <PageHeader
        title="Create session"
        subtitle="Set up an instance of your agent in its environment."
      />
      <div className="max-w-2xl">
        <SessionCreateForm />
      </div>
    </div>
  );
}
