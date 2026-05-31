import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getTemplatesWithItems } from "@/lib/queries";
import { SeedTemplateButton } from "@/components/forms/seed-template-button";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { FREQUENCY_LABELS } from "@/lib/types";

export default async function TemplatesPage() {
  const ctx = await requireOrgContext();
  const templates = await getTemplatesWithItems(ctx.org.id);
  const isOwner = ctx.role === "owner";

  return (
    <div>
      <PageHeader
        title="Inspection templates"
        description="Reusable checklists, each tied to a cadence — apply them to any property"
        action={
          isOwner ? (
            <div className="flex gap-2">
              <SeedTemplateButton />
              <LinkButton href="/inspections/templates/new">
                + New template
              </LinkButton>
            </div>
          ) : null
        }
      />

      <p className="mb-6 text-sm text-slate-400">
        <Link href="/inspections">← Back to inspections</Link>
      </p>

      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description={
            isOwner
              ? "Create a checklist template (e.g. a quick monthly drive-by and a thorough annual review), then apply it to your properties from each property's page."
              : "An owner hasn't created any inspection templates yet."
          }
          action={isOwner ? <SeedTemplateButton /> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const inner = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{t.name}</h3>
                  <Badge>{FREQUENCY_LABELS[t.frequency]}</Badge>
                </div>
                {t.description ? (
                  <p className="mt-1 text-sm text-slate-500">{t.description}</p>
                ) : null}
                <p className="mt-3 text-xs text-slate-400">
                  {t.items.length} checklist item
                  {t.items.length === 1 ? "" : "s"}
                </p>
              </>
            );
            return isOwner ? (
              <Link
                key={t.id}
                href={`/inspections/templates/${t.id}`}
                className="card p-5 transition hover:shadow-md"
              >
                {inner}
              </Link>
            ) : (
              <div key={t.id} className="card p-5">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
