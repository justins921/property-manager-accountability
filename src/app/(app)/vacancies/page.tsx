import Link from "next/link";
import {
  daysVacant,
  nextDeadline,
  vacancyCost,
  vacancyStatus,
} from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { getProfileMap, getVacancies } from "@/lib/queries";
import {
  EmptyState,
  LinkButton,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { DEADLINE_LABELS, STAGE_LABELS } from "@/lib/types";
import { formatCurrency, formatDate, formatDays } from "@/lib/utils";

export default async function VacanciesPage() {
  const ctx = await requireOrgContext();
  const [vacancies, profiles] = await Promise.all([
    getVacancies(ctx.org.id),
    getProfileMap(ctx.org.id),
  ]);
  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Vacancies"
        description="Every vacancy from move-out to move-in"
        action={<LinkButton href="/vacancies/new">+ New vacancy</LinkButton>}
      />

      {vacancies.length === 0 ? (
        <EmptyState
          title="No vacancies yet"
          description="When a tenant gives notice, log the vacancy here to start the accountability timer."
          action={<LinkButton href="/vacancies/new">Create vacancy</LinkButton>}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Days vacant</th>
                <th className="px-4 py-3">Next deadline</th>
                <th className="px-4 py-3">Manager</th>
                <th className="px-4 py-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vacancies.map((v) => {
                const status = vacancyStatus(v, now);
                const next = nextDeadline(v, now);
                const manager =
                  (v.manager_id && profiles.get(v.manager_id)?.full_name) ||
                  "Unassigned";
                return (
                  <tr key={v.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/vacancies/${v.id}`}
                        className="font-medium text-slate-900 hover:text-brand-600"
                      >
                        {v.property?.name} · Unit {v.unit_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} showLabel={false} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {STAGE_LABELS[v.stage]}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDays(daysVacant(v, now))}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {next ? (
                        <>
                          {DEADLINE_LABELS[next.type]}
                          <span className="block text-xs text-slate-400">
                            {formatDate(next.date)}
                            {next.daysUntil < 0
                              ? ` · ${-next.daysUntil}d overdue`
                              : ` · in ${next.daysUntil}d`}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{manager}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCurrency(vacancyCost(v, now))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
