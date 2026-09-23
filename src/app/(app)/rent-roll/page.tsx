import Link from "next/link";
import {
  leaseEndsWithin,
  ledgerBalance,
  occupancyLabel,
  pastDueBalance,
  toCents,
} from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { entriesByLease, getLeases, getLedgerEntries, getUnits } from "@/lib/queries";
import { BalanceText, OccupancyBadge } from "@/components/leasing";
import { EmptyState, LinkButton, PageHeader, StatCard } from "@/components/ui";
import type { LeaseWithRelations } from "@/lib/types";
import { cn, formatCurrency, formatDate, leaseTenantNames } from "@/lib/utils";

const ENDING_WINDOW_DAYS = 60;

export default async function RentRollPage({
  searchParams,
}: {
  searchParams: Promise<{ ending?: string }>;
}) {
  const { ending } = await searchParams;
  const endingOnly = ending === "60";
  const ctx = await requireOrgContext();
  const [units, leases, entries] = await Promise.all([
    getUnits(ctx.org.id),
    getLeases(ctx.org.id),
    getLedgerEntries(ctx.org.id),
  ]);
  const ledger = entriesByLease(entries);
  const now = new Date();

  // The lease that "occupies" each unit on the rent roll: active, else upcoming.
  const byUnit = new Map<string, LeaseWithRelations>();
  for (const status of ["upcoming", "active"] as const) {
    for (const l of leases.filter((x) => x.status === status)) byUnit.set(l.unit_id, l);
  }

  const allRows = units.map((unit) => {
      const lease = byUnit.get(unit.id) ?? null;
      const unitEntries = lease ? ledger.get(lease.id) ?? [] : [];
      return {
        unit,
        lease,
        balance: lease ? ledgerBalance(unitEntries, now) : 0,
      };
    });
  const rows = allRows.filter(
    (r) => !endingOnly || (r.lease && leaseEndsWithin(r.lease, ENDING_WINDOW_DAYS, now)),
  );

  const all = units.map((u) => byUnit.get(u.id));
  const occupied = all.filter((l) => l?.status === "active").length;
  const scheduledRent = all
    .filter((l): l is LeaseWithRelations => l?.status === "active")
    .reduce((sum, l) => sum + toCents(l.monthly_rent), 0) / 100;
  // Past due counts every lease, so a former tenant's unpaid balance doesn't
  // disappear once the unit is re-leased.
  const totalPastDue =
    leases.reduce(
      (s, l) => s + toCents(pastDueBalance(ledger.get(l.id) ?? [], now)),
      0,
    ) / 100;
  const endingSoon = all.filter(
    (l): l is LeaseWithRelations => !!l && leaseEndsWithin(l, ENDING_WINDOW_DAYS, now),
  ).length;

  return (
    <div>
      <PageHeader
        title="Rent roll"
        description="Every unit with its tenant, rent, balance and lease end"
        action={<LinkButton href="/leases/new">+ New lease</LinkButton>}
      />

      <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Occupancy"
          value={units.length ? `${Math.round((occupied / units.length) * 100)}%` : "—"}
          sub={`${occupied} of ${units.length} units`}
        />
        <StatCard label="Monthly rent (occupied)" value={formatCurrency(scheduledRent)} />
        <StatCard
          label="Past due (incl. former tenants)"
          value={formatCurrency(totalPastDue)}
          accent={totalPastDue > 0 ? "red" : "green"}
        />
        <StatCard label={`Leases ending in ${ENDING_WINDOW_DAYS} days`} value={endingSoon} />
      </div>

      <div className="mb-3 mt-8 flex gap-2 text-sm">
        <Link
          href="/rent-roll"
          className={cn("rounded-full px-3 py-1 font-medium", !endingOnly ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-900")}
        >
          All units
        </Link>
        <Link
          href="/rent-roll?ending=60"
          className={cn("rounded-full px-3 py-1 font-medium", endingOnly ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-900")}
        >
          Ending in {ENDING_WINDOW_DAYS} days
        </Link>
      </div>

      {units.length === 0 ? (
        <EmptyState
          title="No units yet"
          description="Add buildings and units to a property, then create leases for them."
          action={<LinkButton href="/properties">Go to properties</LinkButton>}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing here" description={`No leases end in the next ${ENDING_WINDOW_DAYS} days.`} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Rent</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Lease end</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ unit, lease, balance }) => (
                <tr key={unit.id}>
                  <td className="px-4 py-3">
                    <Link href={`/units/${unit.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {unit.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {[unit.property?.name, unit.building?.name].filter(Boolean).join(" · ")}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {lease ? (
                      <Link href={`/leases/${lease.id}`} className="hover:text-brand-700">
                        {leaseTenantNames(lease)}
                      </Link>
                    ) : (
                      <Link href={`/leases/new?unit_id=${unit.id}`} className="text-brand-600">
                        + Add lease
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <OccupancyBadge label={lease ? occupancyLabel(lease, now) : "Vacant"} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {lease ? formatCurrency(lease.monthly_rent) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{lease ? <BalanceText amount={balance} /> : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {lease ? (lease.end_date ? formatDate(lease.end_date) : "Month-to-month") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
