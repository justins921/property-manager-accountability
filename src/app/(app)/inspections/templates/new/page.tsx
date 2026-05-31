import { requireOrgContext } from "@/lib/org";
import { TemplateBuilder } from "@/components/forms/template-builder";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function NewTemplatePage() {
  const ctx = await requireOrgContext();
  if (ctx.role !== "owner") {
    return (
      <EmptyState
        title="Owners only"
        description="Only owners can create inspection templates."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="New inspection template"
        description="Name it, pick a cadence, and list what gets checked"
      />
      <TemplateBuilder />
    </div>
  );
}
