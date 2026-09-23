import Link from "next/link";
import { buildOwnerScorecard, buildOwnerScorecards, dateKey } from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { getOwnerRequests, getProfileMap } from "@/lib/queries";
import { ScorecardTabs } from "@/components/scorecard-tabs";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { OWNER_REQUEST_TYPE_LABELS } from "@/lib/types";
import { formatCurrency, formatDate, formatHours, formatPercent } from "@/lib/utils";

function pctClass(pct: number | null) {
  if (pct === null) return "text-slate-400";
  if (pct >= 85) return "font-semibold text-status-green";
  if (pct >= 70) return "font-semibold text-status-yellow";
  return "font-semibold text-status-red";
}

export default async function OwnerScorecardPage() {
  const ctx = await requireOrgContext();
  const [requests, profiles] = await Promise.all([
    getOwnerRequests(ctx.org.id),
    getProfileMap(ctx.org.id),
  ]);
  const now = new Date();
  const today = dateKey(now);
  const org = buildOwnerScorecard(null, requests, now);
  const owners = buildOwnerScorecards(requests, now).sort(
    (a, b) => (a.avgResponseHours ?? Infinity) - (b.avgResponseHours ?? Infinity),
  );
  const overdue = requests.filter((r) => r.status === "pending" && r.due_by < today);

  return (
    <div>
      <PageHeader
        title="Scorecards"
        description="Two-way accountability: is each side doing its part?"
      />
      <ScorecardTabs active="/scorecard/owners" />

      {org.total === 0 ? (
        <EmptyState
          title="No owner requests yet"
          description="When a manager sends the owner a spending approval, decision or reimbursement, the owner's response time shows up here."
          action={
            <Link href="/requests" className="btn-primary">
              Send a request
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Avg response time" value={formatHours(org.avgResponseHours)} sub={`${org.answered} answered`} />
            <StatCard
              label="Answered by due date"
              value={<span className={pctClass(org.onTimePct)}>{formatPercent(org.onTimePct)}</span>}
            />
            <StatCard label="Waiting on owner" value={org.pending} />
            <StatCard label="Overdue" value={org.overdue} accent={org.overdue > 0 ? "red" : "green"} />
          </div>

          {owners.length > 0 ? (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">By owner</h2>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Answered</th>
                      <th className="px-4 py-3">Approved</th>
                      <th className="px-4 py-3">Declined</th>
                      <th className="px-4 py-3">Avg response</th>
                      <th className="px-4 py-3">On time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {owners.map((s) => (
                      <tr key={s.ownerId}>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {(s.ownerId && (profiles.get(s.ownerId)?.full_name || profiles.get(s.ownerId)?.email)) || "Former member"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{s.answered}</td>
                        <td className="px-4 py-3 text-slate-600">{s.approved}</td>
                        <td className="px-4 py-3 text-slate-600">{s.declined}</td>
                        <td className="px-4 py-3 text-slate-600">{formatHours(s.avgResponseHours)}</td>
                        <td className="px-4 py-3">
                          <span className={pctClass(s.onTimePct)}>{formatPercent(s.onTimePct)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="mt-8">
            <Card>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Overdue requests</h2>
              {overdue.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing overdue.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {overdue.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{r.title}</p>
                        <p className="text-xs text-slate-500">
                          {OWNER_REQUEST_TYPE_LABELS[r.type]}
                          {r.amount !== null ? ` · ${formatCurrency(r.amount, true)}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-status-red">was due {formatDate(r.due_by)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
