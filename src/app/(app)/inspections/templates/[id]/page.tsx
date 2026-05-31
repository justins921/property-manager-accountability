import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getTemplate } from "@/lib/queries";
import { TemplateBuilder } from "@/components/forms/template-builder";
import { DeleteTemplateButton } from "@/components/forms/delete-template-button";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  if (ctx.role !== "owner") {
    return (
      <EmptyState
        title="Owners only"
        description="Only owners can edit inspection templates."
      />
    );
  }

  const template = await getTemplate(ctx.org.id, id);
  if (!template) notFound();

  return (
    <div>
      <p className="mb-2 text-sm text-slate-400">
        <Link href="/inspections/templates">← Templates</Link>
      </p>
      <PageHeader
        title="Edit template"
        description="Changes apply to future inspections; completed ones keep their original checklist."
        action={<DeleteTemplateButton id={template.id} />}
      />
      <TemplateBuilder
        template={{
          id: template.id,
          name: template.name,
          frequency: template.frequency,
          description: template.description,
          items: template.items.map((i) => ({ label: i.label, hint: i.hint })),
        }}
      />
    </div>
  );
}
