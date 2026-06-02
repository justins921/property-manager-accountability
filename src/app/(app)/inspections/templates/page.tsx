import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getTemplatesWithItems } from "@/lib/queries";
import { StarterTemplates } from "@/components/forms/starter-templates";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { CATEGORY_LABELS, FREQUENCY_LABELS } from "@/lib/types";

const CATEGORY_BADGE: Record<string, string> = {
  interior: "bg-violet-50 text-violet-700",
  exterior: "bg-emerald-50 text-emerald-700",
  general: "bg-slate-100 text-slate-600",
};

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
            <LinkButton href="/inspections/templates/new">
              + New template
            </LinkButton>
          ) : null
        }
      />

      <p className="mb-6 text-sm text-slate-400">
        <Link href="/inspections">← Back to inspections</Link>
      </p>

      {isOwner ? <StarterTemplates /> : null}

      {templates.length === 0 ? (
        <EmptyState
          title="No templates of your own yet"
          description={
            isOwner
              ? "Add a starter above, or build your own from scratch with “New template”."
              : "An owner hasn't created any inspection templates yet."
          }
        />
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your templates
          </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const inner = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{t.name}</h3>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge className={CATEGORY_BADGE[t.category]}>
                      {CATEGORY_LABELS[t.category]}
                    </Badge>
                    <Badge>{FREQUENCY_LABELS[t.frequency]}</Badge>
                  </div>
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
        </>
      )}
    </div>
  );
}
