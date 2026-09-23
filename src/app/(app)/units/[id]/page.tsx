import Link from "next/link";
import { notFound } from "next/navigation";
import {
  daysVacant,
  ledgerBalance,
  occupancyLabel,
  vacancyStatus,
} from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { entriesByLease, getLeases, getLedgerEntries, getUnit, getVacancies } from "@/lib/queries";
import { BalanceText, OccupancyBadge } from "@/components/leasing";
import { Card, LinkButton, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { STAGE_LABELS } from "@/lib/types";
import { formatCurrency, formatDate, formatDays, leaseTenantNames, unitLabel } from "@/lib/utils";

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const [unit, leases, allVacancies] = await Promise.all([
    getUnit(ctx.org.id, id),
    getLeases(ctx.org.id, { unitId: id }),
    getVacancies(ctx.org.id),
  ]);
  if (!unit) notFound();

  const entries = await getLedgerEntries(ctx.org.id, leases.map((l) => l.id));
  const ledger = entriesByLease(entries);
  const now = new Date();
  const active = leases.find((l) => l.status === "active");
  const upcoming = leases.find((l) => l.status === "upcoming");
  const vacancies = allVacancies.filter((v) => v.unit_id === id);
  const openVacancy = vacancies.find((v) => v.stage !== "completed" && !v.closed_at);

  return (
    <div>
      <p className="mb-2 text-sm text-slate-400">
        <Link href={`/properties/${unit.property_id}`}>← {unit.property?.name ?? "Property"}</Link>
      </p>
      <PageHeader
        title={unitLabel(unit, unit.property)}
        description={active ? leaseTenantNames(active) : "Vacant"}
        action={
          active ? (
            <OccupancyBadge label={occupancyLabel(active, now)} />
          ) : (
            <LinkButton href={`/leases/new?unit_id=${unit.id}`}>+ New lease</LinkButton>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Occupancy" value={active ? "Occupied" : "Vacant"} accent={active ? "green" : "red"} />
        <StatCard label="Rent" value={active ? formatCurrency(active.monthly_rent) : "—"} />
        <StatCard
          label="Balance"
          value={active ? <BalanceText amount={ledgerBalance(ledger.get(active.id) ?? [], now)} /> : "—"}
        />
        <StatCard
          label="Lease end"
          value={active ? (active.end_date ? formatDate(active.end_date) : "Month-to-month") : "—"}
          sub={upcoming ? `Next lease starts ${formatDate(upcoming.start_date)}` : undefined}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Leases</h2>
          {leases.length === 0 ? (
            <p className="text-sm text-slate-500">No leases on this unit yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {leases.map((l) => (
                <li key={l.id}>
                  <Link href={`/leases/${l.id}`} className="flex items-center justify-between py-3 text-sm transition hover:opacity-75">
                    <div>
                      <p className="font-medium text-slate-900">{leaseTenantNames(l)}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(l.start_date)} → {formatDate(l.ended_on ?? l.end_date)} ·{" "}
                        {formatCurrency(l.monthly_rent)}/mo
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <BalanceText amount={ledgerBalance(ledger.get(l.id) ?? [], now)} />
                      <OccupancyBadge label={occupancyLabel(l, now)} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Vacancies</h2>
            {!active && !openVacancy ? (
              <Link
                href={`/vacancies/new?${new URLSearchParams({ property_id: unit.property_id, unit_id: unit.id })}`}
                className="text-sm font-semibold text-brand-600"
              >
                + Open vacancy
              </Link>
            ) : null}
          </div>
          {vacancies.length === 0 ? (
            <p className="text-sm text-slate-500">No vacancies recorded for this unit.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {vacancies.map((v) => (
                <li key={v.id}>
                  <Link href={`/vacancies/${v.id}`} className="flex items-center justify-between py-3 text-sm transition hover:opacity-75">
                    <div>
                      <p className="font-medium text-slate-900">Moved out {formatDate(v.move_out_date)}</p>
                      <p className="text-xs text-slate-500">
                        {STAGE_LABELS[v.stage]} · {formatDays(daysVacant(v, now))} vacant
                      </p>
                    </div>
                    <StatusBadge status={vacancyStatus(v, now)} showLabel={false} />
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
