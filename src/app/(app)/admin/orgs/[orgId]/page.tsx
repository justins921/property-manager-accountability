import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buildScorecards,
  daysVacant,
  vacancyCostInRange,
  vacancyStatus,
} from "@/lib/calculations";
import { daysUntilDue } from "@/lib/inspections-calc";
import { adminGetOrgData, requirePlatformAdmin } from "@/lib/admin";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { formatCurrency, formatDays } from "@/lib/utils";

export default async function AdminOrgDashboard({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  await requirePlatformAdmin();
  const { orgId } = await params;
  const data = await adminGetOrgData(orgId);
  if (!data) notFound();

  const { org, vacancies, inspections, inspectionItems, profiles } = data;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const active = vacancies.filter((v) => v.stage !== "completed" && !v.closed_at);
  const overdue = active.filter((v) => vacancyStatus(v, now) === "red");
  const openInspections = inspections.filter((i) => !i.completed_at);
  const overdueInspections = openInspections.filter(
    (i) => daysUntilDue(i, now) < 0,
  );

  const costThisMonth = vacancies.reduce(
    (s, v) => s + vacancyCostInRange(v, monthStart, now, now),
    0,
  );
  const costThisYear = vacancies.reduce(
    (s, v) => s + vacancyCostInRange(v, yearStart, now, now),
    0,
  );

  const rankings = buildScorecards(vacancies, now)
    .filter((s) => s.totalVacancies > 0)
    .sort((a, b) => (b.onTimeCompletionPct ?? -1) - (a.onTimeCompletionPct ?? -1));

  // Inspection issue count for context.
  const openIssues = inspectionItems.filter(
    (it) => it.result === "needs_attention",
  ).length;

  return (
    <div>
      <p className="mb-2 text-sm text-slate-400">
        <Link href="/admin">← All organizations</Link>
      </p>
      <PageHeader
        title={org.name}
        description="Read-only operator view of this customer's dashboard"
      />

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Viewing <strong>{org.name}</strong> as a platform admin. Read-only — you
        can&rsquo;t change this customer&rsquo;s data here.
      </div>

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
          sub={`${openInspections.length} open · ${openIssues} issues`}
          accent={overdueInspections.length > 0 ? "red" : "green"}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Property manager rankings
          </h2>
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
                          {s.activeVacancies} active · {s.deadlinesMissed} missed
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {s.onTimeCompletionPct === null
                        ? "—"
                        : `${Math.round(s.onTimeCompletionPct)}% on time`}
                    </p>
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
              Nothing overdue. Every active vacancy is on track.
            </p>
          ) : (
            <ul className="space-y-3">
              {overdue.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2"
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
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
