import Link from "next/link";
import {
  buildScorecards,
  daysVacant,
  vacancyCostInRange,
  vacancyStatus,
} from "@/lib/calculations";
import {
  daysUntilDue,
  routineInspectionStatus,
} from "@/lib/inspections-calc";
import { requireOrgContext } from "@/lib/org";
import {
  getProfileMap,
  getRoutineInspections,
  getVacancies,
} from "@/lib/queries";
import { Card, LinkButton, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { formatCurrency, formatDays } from "@/lib/utils";

export default async function DashboardPage() {
  const ctx = await requireOrgContext();
  const [vacancies, profiles, inspections] = await Promise.all([
    getVacancies(ctx.org.id),
    getProfileMap(ctx.org.id),
    getRoutineInspections(ctx.org.id),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const active = vacancies.filter((v) => v.stage !== "completed" && !v.closed_at);
  const overdue = active.filter((v) => vacancyStatus(v, now) === "red");

  const costThisMonth = vacancies.reduce(
    (s, v) => s + vacancyCostInRange(v, monthStart, now, now),
    0,
  );
  const costThisYear = vacancies.reduce(
    (s, v) => s + vacancyCostInRange(v, yearStart, now, now),
    0,
  );

  const openInspections = inspections.filter((i) => !i.completed_at);
  const overdueInspections = openInspections.filter(
    (i) => daysUntilDue(i, now) < 0,
  );

  const rankings = buildScorecards(vacancies, now)
    .filter((s) => s.totalVacancies > 0)
    .sort((a, b) => {
      // Rank by on-time completion desc, then avg days vacant asc.
      const aPct = a.onTimeCompletionPct ?? -1;
      const bPct = b.onTimeCompletionPct ?? -1;
      if (bPct !== aPct) return bPct - aPct;
      return (a.avgDaysVacant ?? Infinity) - (b.avgDaysVacant ?? Infinity);
    });

  return (
    <div>
      <PageHeader
        title="Owner Dashboard"
        description="Portfolio-wide vacancy accountability at a glance"
        action={<LinkButton href="/vacancies/new">+ New vacancy</LinkButton>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vacant units" value={active.length} />
        <StatCard
          label="Units overdue"
          value={overdue.length}
          accent={overdue.length > 0 ? "red" : "green"}
        />
        <StatCard
          label="Vacancy cost this month"
          value={formatCurrency(costThisMonth)}
          sub={`${formatCurrency(costThisYear)} this year`}
        />
        <StatCard
          label="Inspections overdue"
          value={overdueInspections.length}
          sub={`${openInspections.length} open`}
          accent={overdueInspections.length > 0 ? "red" : "green"}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Property manager rankings
            </h2>
            <Link
              href="/scorecard"
              className="text-sm font-semibold text-brand-600"
            >
              Full scorecard →
            </Link>
          </div>
          {rankings.length === 0 ? (
            <p className="text-sm text-slate-500">No vacancy data yet.</p>
          ) : (
            <ol className="space-y-3">
              {rankings.map((s, i) => {
                const name =
                  (s.managerId && profiles.get(s.managerId)?.full_name) ||
                  "Unassigned";
                return (
                  <li
                    key={s.managerId ?? "none"}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {s.activeVacancies} active · {s.deadlinesMissed}{" "}
                          missed
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {s.onTimeCompletionPct === null
                          ? "—"
                          : `${Math.round(s.onTimeCompletionPct)}% on time`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDays(s.avgDaysVacant)} avg vacancy
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Needs attention
          </h2>
          {overdue.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing overdue. Every active vacancy is on track. 🎉
            </p>
          ) : (
            <ul className="space-y-3">
              {overdue.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/vacancies/${v.id}`}
                    className="flex items-center justify-between gap-4 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 transition hover:bg-red-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {v.property?.name} · Unit {v.unit_number}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDays(daysVacant(v, now))} vacant
                      </p>
                    </div>
                    <StatusBadge status="red" showLabel={false} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
