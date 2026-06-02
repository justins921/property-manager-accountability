import Link from "next/link";
import {
  daysUntilDue,
  routineInspectionStatus,
} from "@/lib/inspections-calc";
import { requireOrgContext } from "@/lib/org";
import {
  getProfileMap,
  getProperties,
  getRoutineInspections,
  getTemplates,
} from "@/lib/queries";
import { StartInspectionButton } from "@/components/forms/start-inspection-button";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function InspectionsPage() {
  const ctx = await requireOrgContext();
  const [inspections, profiles, properties, templates] = await Promise.all([
    getRoutineInspections(ctx.org.id),
    getProfileMap(ctx.org.id),
    getProperties(ctx.org.id),
    getTemplates(ctx.org.id),
  ]);
  const now = new Date();

  const open = inspections
    .filter((i) => !i.completed_at)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const completed = inspections.filter((i) => i.completed_at);

  const managerName = (id: string | null) =>
    (id && profiles.get(id)?.full_name) || "Unassigned";

  const targetText = (i: (typeof inspections)[number]) => {
    const base = i.property?.name ?? "—";
    if (i.unit) return `${base} · ${i.unit.name}`;
    if (i.building) return `${base} · ${i.building.name}`;
    return base;
  };

  return (
    <div>
      <PageHeader
        title="Routine Inspections"
        description="Recurring property condition checks — proof of upkeep on a schedule"
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/inspections/templates"
              className="text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              Templates
            </Link>
            <StartInspectionButton properties={properties} templates={templates} />
          </div>
        }
      />

      {inspections.length === 0 ? (
        <EmptyState
          title="No inspections yet"
          description="Set up a recurring inspection schedule on a property and the system will generate the inspections automatically. You can also add a one-off inspection from a property's page."
        />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Open ({open.length})
            </h2>
            {open.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nothing open right now. 🎉
              </p>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Property</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Due</th>
                      <th className="px-4 py-3">Manager</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {open.map((i) => {
                      const days = daysUntilDue(i, now);
                      return (
                        <tr key={i.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {targetText(i)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              status={routineInspectionStatus(i, now)}
                              showLabel={false}
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDate(i.due_date)}
                            <span className="block text-xs text-slate-400">
                              {days < 0
                                ? `${-days}d overdue`
                                : days === 0
                                  ? "due today"
                                  : `in ${days}d`}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {managerName(i.manager_id)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/inspections/${i.id}`}
                              className="font-semibold text-brand-600 hover:text-brand-700"
                            >
                              Complete →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {completed.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Completed ({completed.length})
              </h2>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Property</th>
                      <th className="px-4 py-3">Due</th>
                      <th className="px-4 py-3">Completed</th>
                      <th className="px-4 py-3">Manager</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completed.map((i) => (
                      <tr key={i.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/inspections/${i.id}`}
                            className="font-medium text-slate-900 hover:text-brand-600"
                          >
                            {targetText(i)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(i.due_date)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(i.completed_at!.slice(0, 10))}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {managerName(i.manager_id)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
