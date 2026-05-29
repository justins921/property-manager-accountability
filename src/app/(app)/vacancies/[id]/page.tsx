import Link from "next/link";
import { notFound } from "next/navigation";
import {
  daysVacant,
  deadlineMetOnTime,
  deadlineSlots,
  leasingTime,
  nextDeadline,
  turnTime,
  vacancyCost,
  vacancyStatus,
} from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { getVacancyDetail } from "@/lib/queries";
import {
  DEADLINE_LABELS,
  DELAY_REASON_LABELS,
  STAGE_LABELS,
} from "@/lib/types";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { DelayForm } from "@/components/forms/delay-form";
import { InspectionForm } from "@/components/forms/inspection-form";
import { MilestoneForm } from "@/components/forms/milestone-form";
import { MediaGallery } from "@/components/media-gallery";
import { formatCurrency, formatDate, formatDays } from "@/lib/utils";

export default async function VacancyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const detail = await getVacancyDetail(ctx.org.id, id);
  if (!detail) notFound();

  const { vacancy, manager, inspections, delays, reminders } = detail;
  const now = new Date();
  const status = vacancyStatus(vacancy, now);
  const next = nextDeadline(vacancy, now);

  const moveOutInspections = inspections.filter((i) => i.type === "move_out");
  const readyInspections = inspections.filter(
    (i) => i.type === "ready_for_market",
  );

  return (
    <div>
      <p className="mb-2 text-sm text-slate-400">
        <Link href="/vacancies">← Vacancies</Link>
      </p>
      <PageHeader
        title={`${vacancy.property?.name ?? "Property"} · Unit ${vacancy.unit_number}`}
        description={`${STAGE_LABELS[vacancy.stage]} · Manager: ${
          manager?.full_name || manager?.email || "Unassigned"
        }`}
        action={<StatusBadge status={status} />}
      />

      {/* Step 3: vacancy tracking stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Days vacant"
          value={formatDays(daysVacant(vacancy, now))}
        />
        <StatCard
          label="Vacancy cost"
          value={formatCurrency(vacancyCost(vacancy, now))}
          sub={`${formatCurrency(vacancy.monthly_rent)}/mo`}
          accent="red"
        />
        <StatCard label="Turn time" value={formatDays(turnTime(vacancy))} />
        <StatCard
          label="Next deadline"
          value={next ? DEADLINE_LABELS[next.type] : "Complete"}
          sub={
            next
              ? next.daysUntil < 0
                ? `${-next.daysUntil} days overdue`
                : `in ${next.daysUntil} days`
              : "All milestones met"
          }
          accent={next && next.daysUntil < 0 ? "red" : "default"}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Commitments vs actuals */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Timeline: committed vs actual
            </h2>
            <div className="overflow-hidden rounded-lg border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Milestone</th>
                    <th className="px-4 py-2">Committed</th>
                    <th className="px-4 py-2">Actual</th>
                    <th className="px-4 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700">
                      Move-out
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {formatDate(vacancy.move_out_date)}
                    </td>
                    <td className="px-4 py-2 text-slate-400">—</td>
                    <td className="px-4 py-2 text-slate-400">Start</td>
                  </tr>
                  {deadlineSlots(vacancy).map((slot) => {
                    const onTime = deadlineMetOnTime(slot);
                    return (
                      <tr key={slot.type}>
                        <td className="px-4 py-2 font-medium text-slate-700">
                          {DEADLINE_LABELS[slot.type]}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {formatDate(slot.expected)}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {formatDate(slot.actual)}
                        </td>
                        <td className="px-4 py-2">
                          {onTime === null ? (
                            <span className="text-slate-400">Pending</span>
                          ) : onTime ? (
                            <span className="font-medium text-status-green">
                              On time
                            </span>
                          ) : (
                            <span className="font-medium text-status-red">
                              Late
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {leasingTime(vacancy) !== null ? (
              <p className="mt-3 text-sm text-slate-500">
                Leasing time (listed → signed):{" "}
                <span className="font-medium text-slate-700">
                  {formatDays(leasingTime(vacancy))}
                </span>
              </p>
            ) : null}
          </Card>

          {/* Step 2: move-out inspection */}
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-900">
              Move-out inspection
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Document condition with a walkthrough video, photos, damage notes,
              and an estimated turn cost.
            </p>
            {moveOutInspections.map((ins) => (
              <div key={ins.id} className="mb-4 space-y-3">
                {ins.damage_notes ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Damage notes: </span>
                    {ins.damage_notes}
                  </p>
                ) : null}
                {ins.estimated_turn_cost != null ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Estimated turn cost: </span>
                    {formatCurrency(ins.estimated_turn_cost)}
                  </p>
                ) : null}
                <MediaGallery media={ins.media} />
                <p className="text-xs text-slate-400">
                  Uploaded {formatDate(ins.created_at.slice(0, 10))}
                </p>
              </div>
            ))}
            <InspectionForm
              orgId={ctx.org.id}
              vacancyId={vacancy.id}
              type="move_out"
            />
          </Card>

          {/* Step 6: ready-for-market verification */}
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-900">
              Ready-for-market verification
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Confirm the unit is actually ready to lease with a final
              walkthrough video, photos, and completion notes.
            </p>
            {readyInspections.map((ins) => (
              <div key={ins.id} className="mb-4 space-y-3">
                {ins.completion_notes ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Completion notes: </span>
                    {ins.completion_notes}
                  </p>
                ) : null}
                <MediaGallery media={ins.media} />
                <p className="text-xs text-slate-400">
                  Uploaded {formatDate(ins.created_at.slice(0, 10))}
                </p>
              </div>
            ))}
            <InspectionForm
              orgId={ctx.org.id}
              vacancyId={vacancy.id}
              type="ready_for_market"
            />
          </Card>
        </div>

        <div className="space-y-6">
          {/* Step 7: record actual milestone dates */}
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-900">
              Update milestones
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Record actual dates as the turn and lease-up progress.
            </p>
            <MilestoneForm vacancy={vacancy} />
          </Card>

          {/* Step 5: delay explanations */}
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-900">
              Delay explanations
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              When a deadline is missed, record why.
            </p>
            {delays.length > 0 ? (
              <ul className="mb-4 space-y-2">
                {delays.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-slate-700">
                      {DELAY_REASON_LABELS[d.reason]}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {DEADLINE_LABELS[d.deadline_type]} ·{" "}
                        {formatDate(d.created_at.slice(0, 10))}
                      </span>
                    </p>
                    {d.notes ? (
                      <p className="mt-1 text-slate-600">{d.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <DelayForm vacancyId={vacancy.id} />
          </Card>

          {/* Reminder log */}
          <Card>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              Reminder history
            </h2>
            {reminders.length === 0 ? (
              <p className="text-sm text-slate-500">
                No reminders sent yet. The system emails the responsible manager
                automatically as deadlines approach and pass.
              </p>
            ) : (
              <ul className="space-y-2">
                {reminders.map((r) => (
                  <li key={r.id} className="text-sm text-slate-600">
                    <span className="text-slate-400">
                      {formatDate(r.sent_at.slice(0, 10))}:
                    </span>{" "}
                    {r.message}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
