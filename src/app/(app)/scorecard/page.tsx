import { buildScorecards } from "@/lib/calculations";
import { buildInspectionScorecard } from "@/lib/inspections-calc";
import { requireOrgContext } from "@/lib/org";
import {
  getInspectionItems,
  getProfileMap,
  getRoutineInspections,
  getVacancies,
} from "@/lib/queries";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatCurrency, formatDays, formatPercent } from "@/lib/utils";
import type { PropertyInspection } from "@/lib/types";

export default async function ScorecardPage() {
  const ctx = await requireOrgContext();
  const [vacancies, profiles, inspections, items] = await Promise.all([
    getVacancies(ctx.org.id),
    getProfileMap(ctx.org.id),
    getRoutineInspections(ctx.org.id),
    getInspectionItems(ctx.org.id),
  ]);
  const now = new Date();

  const cards = buildScorecards(vacancies, now)
    .filter((s) => s.totalVacancies > 0)
    .sort((a, b) => (b.onTimeCompletionPct ?? -1) - (a.onTimeCompletionPct ?? -1));

  // Group routine inspections by manager for the upkeep scorecard.
  const byManager = new Map<string | null, PropertyInspection[]>();
  for (const i of inspections) {
    const list = byManager.get(i.manager_id) ?? [];
    list.push(i);
    byManager.set(i.manager_id, list);
  }
  const inspectionCards = Array.from(byManager.entries())
    .map(([managerId, list]) =>
      buildInspectionScorecard(managerId, list, items, now),
    )
    .filter((s) => s.total > 0)
    .sort((a, b) => (b.onTimePct ?? -1) - (a.onTimePct ?? -1));

  return (
    <div>
      <PageHeader
        title="Property Manager Scorecard"
        description="Measurable performance across every manager in your portfolio"
      />

      {cards.length === 0 && inspectionCards.length === 0 ? (
        <EmptyState
          title="No performance data yet"
          description="Once vacancies and routine inspections are recorded, manager scorecards appear here."
        />
      ) : null}

      {cards.length > 0 ? (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Turn accountability (vacancies)
          </h2>
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
        </>
      ) : null}

      {inspectionCards.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Upkeep accountability (routine inspections)
          </h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Manager</th>
                  <th className="px-4 py-3">Inspections</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Overdue</th>
                  <th className="px-4 py-3">On-time %</th>
                  <th className="px-4 py-3 text-right">Open issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inspectionCards.map((s) => {
                  const name =
                    (s.managerId && profiles.get(s.managerId)?.full_name) ||
                    "Unassigned";
                  return (
                    <tr key={s.managerId ?? "none"}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.total}</td>
                      <td className="px-4 py-3 text-slate-600">{s.completed}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            s.overdue > 0
                              ? "font-semibold text-status-red"
                              : "text-slate-600"
                          }
                        >
                          {s.overdue}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            s.onTimePct === null
                              ? "text-slate-400"
                              : s.onTimePct >= 85
                                ? "font-semibold text-status-green"
                                : s.onTimePct >= 70
                                  ? "font-semibold text-status-yellow"
                                  : "font-semibold text-status-red"
                          }
                        >
                          {formatPercent(s.onTimePct)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {s.openIssues}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
