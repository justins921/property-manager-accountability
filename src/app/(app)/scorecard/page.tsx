import { buildScorecards } from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { getProfileMap, getVacancies } from "@/lib/queries";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatCurrency, formatDays, formatPercent } from "@/lib/utils";

export default async function ScorecardPage() {
  const ctx = await requireOrgContext();
  const [vacancies, profiles] = await Promise.all([
    getVacancies(ctx.org.id),
    getProfileMap(ctx.org.id),
  ]);
  const now = new Date();

  const cards = buildScorecards(vacancies, now)
    .filter((s) => s.totalVacancies > 0)
    .sort((a, b) => (b.onTimeCompletionPct ?? -1) - (a.onTimeCompletionPct ?? -1));

  return (
    <div>
      <PageHeader
        title="Property Manager Scorecard"
        description="Measurable performance across every manager in your portfolio"
      />

      {cards.length === 0 ? (
        <EmptyState
          title="No performance data yet"
          description="Once vacancies are logged and milestones recorded, manager scorecards appear here."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Manager</th>
                <th className="px-4 py-3">Avg turn time</th>
                <th className="px-4 py-3">Avg days vacant</th>
                <th className="px-4 py-3">On-time %</th>
                <th className="px-4 py-3">Deadlines missed</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Avg leasing</th>
                <th className="px-4 py-3 text-right">Vacancy cost created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cards.map((s) => {
                const name =
                  (s.managerId && profiles.get(s.managerId)?.full_name) ||
                  "Unassigned";
                const onTime = s.onTimeCompletionPct;
                return (
                  <tr key={s.managerId ?? "none"}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDays(s.avgTurnTime)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDays(s.avgDaysVacant)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          onTime === null
                            ? "text-slate-400"
                            : onTime >= 85
                              ? "font-semibold text-status-green"
                              : onTime >= 70
                                ? "font-semibold text-status-yellow"
                                : "font-semibold text-status-red"
                        }
                      >
                        {formatPercent(onTime)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.deadlinesMissed}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.activeVacancies}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDays(s.avgLeasingTime)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCurrency(s.vacancyCostCreated)}
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
