import Link from "next/link";
import { answeredOnTime, dateKey, responseHours } from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { getOwnerRequests, getProfileMap, getProperties } from "@/lib/queries";
import {
  NewOwnerRequestForm,
  RespondToRequest,
  WithdrawRequestButton,
} from "@/components/forms/owner-request-forms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import {
  OWNER_REQUEST_STATUS_LABELS,
  OWNER_REQUEST_TYPE_LABELS,
  type OwnerRequestStatus,
} from "@/lib/types";
import { cn, formatCurrency, formatDate, formatHours } from "@/lib/utils";

const STATUS_STYLES: Record<OwnerRequestStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  declined: "bg-red-50 text-red-700",
  withdrawn: "bg-slate-100 text-slate-500",
};

export default async function OwnerRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ vacancy_id?: string; property_id?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireOrgContext();
  const [requests, profiles, properties] = await Promise.all([
    getOwnerRequests(ctx.org.id),
    getProfileMap(ctx.org.id),
    getProperties(ctx.org.id),
  ]);
  const now = new Date();
  const today = dateKey(now);
  const isOwner = ctx.role === "owner";
  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");
  const name = (id: string | null) =>
    (id && (profiles.get(id)?.full_name || profiles.get(id)?.email)) || "Former member";

  return (
    <div>
      <PageHeader
        title="Owner requests"
        description="Spending approvals, decisions and reimbursements that need the owner. Response times feed the Owner Scorecard."
        action={
          <Link href="/scorecard/owners" className="text-sm font-semibold text-brand-600">
            Owner Scorecard →
          </Link>
        }
      />

      <div className="mb-8">
        <NewOwnerRequestForm
          properties={properties.map((p) => ({ id: p.id, name: p.name }))}
          defaults={{ propertyId: params.property_id, vacancyId: params.vacancy_id }}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Waiting on the owner ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <EmptyState title="Nothing waiting" description="No open requests right now." />
      ) : (
        <div className="space-y-3">
          {pending.map((r) => {
            const overdue = r.due_by < today;
            return (
              <Card key={r.id} className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {r.title}
                    {r.amount !== null ? (
                      <span className="ml-2 font-normal text-slate-600">{formatCurrency(r.amount, true)}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {OWNER_REQUEST_TYPE_LABELS[r.type]} · {r.property?.name ?? "Portfolio-wide"} · from{" "}
                    {name(r.requested_by)} on {formatDate(dateKey(new Date(r.created_at)))}
                  </p>
                  {r.details ? <p className="mt-2 text-sm text-slate-600">{r.details}</p> : null}
                  <p className={cn("mt-2 text-sm font-medium", overdue ? "text-status-red" : "text-slate-600")}>
                    {overdue ? "Overdue: was due " : "Due "}
                    {formatDate(r.due_by)}
                    <span className="font-normal text-slate-400">
                      {" "}· waiting {formatHours(responseHours({ ...r, responded_at: now.toISOString() }))}
                    </span>
                  </p>
                  {r.vacancy_id ? (
                    <Link href={`/vacancies/${r.vacancy_id}`} className="mt-1 inline-block text-xs text-brand-600">
                      Related vacancy →
                    </Link>
                  ) : null}
                </div>
                <div className="w-full sm:w-72">
                  {isOwner && !ctx.isAdminView ? <RespondToRequest requestId={r.id} /> : null}
                  {r.requested_by === ctx.userId && !ctx.isAdminView ? (
                    <div className={isOwner ? "mt-2" : ""}>
                      <WithdrawRequestButton requestId={r.id} />
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
        History
      </h2>
      {done.length === 0 ? (
        <p className="text-sm text-slate-500">No answered requests yet.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Answered by</th>
                <th className="px-4 py-3">Response time</th>
                <th className="px-4 py-3">On time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {done.map((r) => {
                const onTime = answeredOnTime(r, now);
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {r.title}
                        {r.amount !== null ? (
                          <span className="ml-2 font-normal text-slate-500">{formatCurrency(r.amount, true)}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        {OWNER_REQUEST_TYPE_LABELS[r.type]} · from {name(r.requested_by)} · due {formatDate(r.due_by)}
                      </p>
                      {r.response_note ? <p className="mt-1 text-xs text-slate-600">&ldquo;{r.response_note}&rdquo;</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_STYLES[r.status]}>{OWNER_REQUEST_STATUS_LABELS[r.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.responded_by ? name(r.responded_by) : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{formatHours(responseHours(r))}</td>
                    <td className="px-4 py-3">
                      {onTime === null ? (
                        <span className="text-slate-400">—</span>
                      ) : onTime ? (
                        <span className="font-medium text-status-green">Yes</span>
                      ) : (
                        <span className="font-medium text-status-red">Late</span>
                      )}
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
