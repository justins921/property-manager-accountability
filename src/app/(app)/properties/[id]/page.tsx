import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buildScorecards,
  daysVacant,
  turnTime,
  vacancyCost,
  vacancyStatus,
} from "@/lib/calculations";
import { routineInspectionStatus } from "@/lib/inspections-calc";
import { requireOrgContext } from "@/lib/org";
import {
  getBuildingsWithUnits,
  getInspectionSchedules,
  getMembers,
  getProfileMap,
  getProperty,
  getRoutineInspections,
  getTemplates,
  getVacancies,
} from "@/lib/queries";
import { PropertySchedules } from "@/components/forms/property-schedules";
import { PropertyStructure } from "@/components/forms/property-structure";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { STAGE_LABELS } from "@/lib/types";
import { formatCurrency, formatDate, formatDays } from "@/lib/utils";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const [
    property,
    allVacancies,
    profiles,
    schedules,
    members,
    allInspections,
    templates,
    buildings,
  ] = await Promise.all([
    getProperty(ctx.org.id, id),
    getVacancies(ctx.org.id),
    getProfileMap(ctx.org.id),
    getInspectionSchedules(ctx.org.id, id),
    getMembers(ctx.org.id),
    getRoutineInspections(ctx.org.id),
    getTemplates(ctx.org.id),
    getBuildingsWithUnits(ctx.org.id, id),
  ]);
  if (!property) notFound();

  const now = new Date();
  const vacancies = allVacancies.filter((v) => v.property_id === id);
  const inspections = allInspections.filter((i) => i.property_id === id);
  const managers = members.filter(
    (m) => m.role === "manager" || m.role === "owner",
  );
  const isOwner = ctx.role === "owner";
  const active = vacancies.filter((v) => v.stage !== "completed" && !v.closed_at);

  const turnTimes = vacancies
    .map((v) => turnTime(v))
    .filter((n): n is number => n !== null);
  const avgTurn =
    turnTimes.length > 0
      ? turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length
      : null;

  const completed = vacancies.filter((v) => v.actual_move_in_date);
  const avgVacancy =
    completed.length > 0
      ? completed.reduce((s, v) => s + daysVacant(v, now), 0) / completed.length
      : null;

  const cost = vacancies.reduce((s, v) => s + vacancyCost(v, now), 0);
  const scorecards = buildScorecards(vacancies, now).filter(
    (s) => s.totalVacancies > 0,
  );

  return (
    <div>
      <p className="mb-2 text-sm text-slate-400">
        <Link href="/properties">← Properties</Link>
      </p>
      <PageHeader title={property.name} description={property.address ?? undefined} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active vacancies" value={active.length} />
        <StatCard label="Avg turn time" value={formatDays(avgTurn)} />
        <StatCard label="Avg vacancy length" value={formatDays(avgVacancy)} />
        <StatCard
          label="Vacancy cost"
          value={formatCurrency(cost)}
          accent="red"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Units</h2>
          {vacancies.length === 0 ? (
            <p className="text-sm text-slate-500">
              No vacancies recorded for this property.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {vacancies.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/vacancies/${v.id}`}
                    className="flex items-center justify-between py-3 transition hover:opacity-75"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        Unit {v.unit_number}
                      </p>
                      <p className="text-xs text-slate-500">
                        {STAGE_LABELS[v.stage]} ·{" "}
                        {formatDays(daysVacant(v, now))} vacant
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-700">
                        {formatCurrency(vacancyCost(v, now))}
                      </span>
                      <StatusBadge
                        status={vacancyStatus(v, now)}
                        showLabel={false}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Manager performance
          </h2>
          {scorecards.length === 0 ? (
            <p className="text-sm text-slate-500">No data yet.</p>
          ) : (
            <ul className="space-y-3">
              {scorecards.map((s) => {
                const name =
                  (s.managerId && profiles.get(s.managerId)?.full_name) ||
                  "Unassigned";
                return (
                  <li key={s.managerId ?? "none"} className="text-sm">
                    <p className="font-medium text-slate-900">{name}</p>
                    <p className="text-slate-500">
                      {formatDays(s.avgTurnTime)} avg turn ·{" "}
                      {s.onTimeCompletionPct === null
                        ? "—"
                        : `${Math.round(s.onTimeCompletionPct)}% on time`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Property structure: buildings + units */}
      {isOwner ? (
        <div className="mt-6">
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-900">
              Structure
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Buildings and units at this address. Exterior inspections target
              buildings; interior inspections target units.
            </p>
            <PropertyStructure propertyId={id} buildings={buildings} />
          </Card>
        </div>
      ) : null}

      {/* Routine inspection schedule + history */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Inspection schedules
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Recurring condition checks for this property.
          </p>
          {isOwner ? (
            <PropertySchedules
              propertyId={id}
              managers={managers}
              templates={templates}
              schedules={schedules}
              buildings={buildings}
            />
          ) : schedules.length > 0 ? (
            <ul className="space-y-2 text-sm text-slate-600">
              {schedules.map((s) => (
                <li key={s.id}>
                  {s.template?.name ?? "Inspection"} · next due{" "}
                  {formatDate(s.next_due_date)}
                  {s.active ? "" : " (paused)"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No schedules set. Ask an owner to configure one.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Recent inspections
          </h2>
          {inspections.length === 0 ? (
            <p className="text-sm text-slate-500">No inspections yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {inspections.slice(0, 8).map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/inspections/${i.id}`}
                    className="flex items-center justify-between py-3 transition hover:opacity-75"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        Due {formatDate(i.due_date)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {i.completed_at
                          ? `Completed ${formatDate(i.completed_at.slice(0, 10))}`
                          : "Not completed"}
                      </p>
                    </div>
                    <StatusBadge
                      status={routineInspectionStatus(i, now)}
                      showLabel={false}
                    />
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
