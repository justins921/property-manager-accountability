import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buildScorecards,
  daysVacant,
  ledgerBalance,
  occupancyLabel,
  turnTime,
  vacancyCost,
  vacancyStatus,
} from "@/lib/calculations";
import { routineInspectionStatus } from "@/lib/inspections-calc";
import { requireOrgContext } from "@/lib/org";
import {
  entriesByLease,
  getBuildingsWithUnits,
  getInspectionSchedules,
  getLeases,
  getLedgerEntries,
  getMembers,
  getProfileMap,
  getProperty,
  getRoutineInspections,
  getTemplates,
  getVacancies,
} from "@/lib/queries";
import { PropertySchedules } from "@/components/forms/property-schedules";
import { PropertyStructure } from "@/components/forms/property-structure";
import { BalanceText, OccupancyBadge } from "@/components/leasing";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { STAGE_LABELS } from "@/lib/types";
import type { LeaseWithRelations } from "@/lib/types";
import {
  formatCurrency,
  formatDate,
  formatDays,
  leaseTenantNames,
} from "@/lib/utils";

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
    allLeases,
  ] = await Promise.all([
    getProperty(ctx.org.id, id),
    getVacancies(ctx.org.id),
    getProfileMap(ctx.org.id),
    getInspectionSchedules(ctx.org.id, id),
    getMembers(ctx.org.id),
    getRoutineInspections(ctx.org.id),
    getTemplates(ctx.org.id),
    getBuildingsWithUnits(ctx.org.id, id),
    getLeases(ctx.org.id),
  ]);
  if (!property) notFound();

  // Occupancy: the active (else upcoming) lease on each unit.
  const leases = allLeases.filter((l) => l.property_id === id);
  const leaseByUnit = new Map<string, LeaseWithRelations>();
  for (const status of ["upcoming", "active"] as const) {
    for (const l of leases.filter((x) => x.status === status)) leaseByUnit.set(l.unit_id, l);
  }
  const ledger = entriesByLease(
    await getLedgerEntries(
      ctx.org.id,
      Array.from(leaseByUnit.values()).map((l) => l.id),
    ),
  );
  const unitCount = buildings.reduce((n, b) => n + b.units.length, 0);

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

      <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-4">
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Units</h2>
            <Link href="/rent-roll" className="text-sm font-semibold text-brand-600">
              Rent roll →
            </Link>
          </div>
          {unitCount === 0 ? (
            <p className="text-sm text-slate-500">
              {isOwner
                ? "No units yet. Add buildings and units under Structure below to start leasing."
                : "No units yet. Ask an owner to add buildings and units so you can create leases."}
            </p>
          ) : (
            <div className="space-y-4">
              {buildings
                .filter((b) => b.units.length > 0)
                .map((b) => (
                  <div key={b.id}>
                    {buildings.length > 1 ? (
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {b.name}
                      </p>
                    ) : null}
                    <ul className="divide-y divide-slate-100">
                      {b.units.map((u) => {
                        const lease = leaseByUnit.get(u.id);
                        return (
                          <li key={u.id}>
                            <Link
                              href={`/units/${u.id}`}
                              className="flex items-center justify-between py-3 transition hover:opacity-75"
                            >
                              <div>
                                <p className="font-medium text-slate-900">Unit {u.name}</p>
                                <p className="text-xs text-slate-500">
                                  {lease
                                    ? `${leaseTenantNames(lease)} · ${formatCurrency(lease.monthly_rent)}/mo · ${
                                        lease.end_date ? `ends ${formatDate(lease.end_date)}` : "month-to-month"
                                      }`
                                    : "No current lease"}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                {lease ? (
                                  <BalanceText amount={ledgerBalance(ledger.get(lease.id) ?? [], now)} />
                                ) : null}
                                <OccupancyBadge label={lease ? occupancyLabel(lease, now) : "Vacant"} />
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
            </div>
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

      <div className="mt-6">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Vacancies</h2>
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
