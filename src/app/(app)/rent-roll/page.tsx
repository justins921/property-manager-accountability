import Link from "next/link";
import {
  autopayState,
  currentRentPeriod,
  dateKey,
  leaseEndsWithin,
  ledgerBalance,
  monthStatus,
  occupancyLabel,
  pastDueBalance,
  toCents,
} from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import {
  byLease,
  entriesByLease,
  getAutopayAttempts,
  getLeases,
  getLedgerEntries,
  getPaymentLinks,
  getUnits,
} from "@/lib/queries";
import { refreshStripeAccount, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { BalanceText, OccupancyBadge } from "@/components/leasing";
import { ConnectStripeButton } from "@/components/forms/payment-forms";
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatCard } from "@/components/ui";
import type {
  AutopayAttempt,
  LeaseWithRelations,
  LedgerEntry,
  PaymentLink,
} from "@/lib/types";
import { cn, formatCurrency, formatDate, leaseTenantNames } from "@/lib/utils";

const ENDING_WINDOW_DAYS = 60;

export default async function RentRollPage({
  searchParams,
}: {
  searchParams: Promise<{ ending?: string; stripe?: string }>;
}) {
  const { ending, stripe } = await searchParams;
  const endingOnly = ending === "60";
  const ctx = await requireOrgContext();
  const [units, leases, entries, links, attempts] = await Promise.all([
    getUnits(ctx.org.id),
    getLeases(ctx.org.id),
    getLedgerEntries(ctx.org.id),
    getPaymentLinks(ctx.org.id),
    getAutopayAttempts(ctx.org.id),
  ]);
  const ledger = entriesByLease(entries);
  const linksByLease = byLease(links);
  const attemptsByLease = byLease(attempts);
  const now = new Date();

  // Online payments: returning from Stripe onboarding refreshes the status.
  let paymentsOn = stripeConfigured() && !!ctx.org.stripe_charges_enabled;
  if (stripe === "return" && stripeConfigured() && ctx.org.stripe_account_id && !ctx.isAdminView) {
    try {
      paymentsOn = await refreshStripeAccount(createAdminClient(), ctx.org.id, ctx.org.stripe_account_id);
    } catch (err) {
      console.error("[rent-roll] refreshing Stripe account", err);
    }
  }

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
  const month = dateKey(now).slice(0, 7);
  const collectedThisMonth =
    entries
      .filter((e) => e.type === "payment" && e.entry_date.startsWith(month))
      .reduce((sum, e) => sum + toCents(e.amount), 0) / 100;
  const outstandingNow =
    all
      .filter((l): l is LeaseWithRelations => l?.status === "active")
      .reduce((sum, l) => sum + Math.max(0, toCents(ledgerBalance(ledger.get(l.id) ?? [], now))), 0) / 100;
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

      {stripeConfigured() && !paymentsOn ? (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-base font-semibold text-slate-900">Collect rent online</h2>
            <p className="mt-1 text-sm text-slate-500">
              Connect a Stripe account and rent goes straight to your bank. Tenants
              pay by bank account or card from a link, with no login, and can turn
              on autopay. Payments post to the ledger automatically.
            </p>
          </div>
          {ctx.role === "owner" && !ctx.isAdminView ? (
            <ConnectStripeButton
              label={ctx.org.stripe_account_id ? "Finish Stripe setup" : "Set up online payments"}
            />
          ) : (
            <p className="text-sm text-slate-500">An owner can set this up.</p>
          )}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Occupancy"
          value={units.length ? `${Math.round((occupied / units.length) * 100)}%` : "—"}
          sub={`${occupied} of ${units.length} units`}
        />
        <StatCard
          label="Collected this month"
          value={formatCurrency(collectedThisMonth)}
          sub={`of ${formatCurrency(scheduledRent)} monthly rent`}
          accent="green"
        />
        <StatCard
          label="Outstanding now"
          value={formatCurrency(outstandingNow)}
          accent={outstandingNow > 0 ? "red" : "default"}
        />
        <StatCard
          label="Past due (incl. former tenants)"
          value={formatCurrency(totalPastDue)}
          accent={totalPastDue > 0 ? "red" : "green"}
        />
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
          Ending in {ENDING_WINDOW_DAYS} days ({endingSoon})
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
                <th className="px-4 py-3">This month</th>
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
                  <td className="px-4 py-3">
                    {lease ? (
                      <ThisMonth
                        lease={lease}
                        entries={ledger.get(lease.id) ?? []}
                        links={linksByLease.get(lease.id) ?? []}
                        attempts={attemptsByLease.get(lease.id) ?? []}
                        now={now}
                      />
                    ) : (
                      "—"
                    )}
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

/** Paid / outstanding for the current month, plus online-payment flags. */
function ThisMonth({
  lease,
  entries,
  links,
  attempts,
  now,
}: {
  lease: LeaseWithRelations;
  entries: LedgerEntry[];
  links: PaymentLink[];
  attempts: AutopayAttempt[];
  now: Date;
}) {
  const status = monthStatus(lease, entries, now);
  const autopay = autopayState(attempts, currentRentPeriod(lease, now)?.period ?? null);
  const processing =
    autopay === "processing" || links.some((l) => l.status === "processing");
  const linkOpen = links.some((l) => l.status === "open" && l.kind === "payment");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status.state === "paid" ? (
        <Badge className="bg-green-50 text-green-700">Paid</Badge>
      ) : status.state === "outstanding" ? (
        <Badge className="bg-red-50 text-red-700">Outstanding {formatCurrency(status.amount, true)}</Badge>
      ) : status.state === "not_due" ? (
        <span className="text-xs text-slate-500">Due {formatDate(status.dueDate)}</span>
      ) : (
        <span className="text-slate-400">—</span>
      )}
      {autopay === "failed" ? <Badge className="bg-red-50 text-red-700">Autopay failed</Badge> : null}
      {processing ? <Badge className="bg-blue-50 text-blue-700">Processing</Badge> : null}
      {lease.autopay_enabled && autopay !== "failed" ? <Badge>Autopay</Badge> : null}
      {linkOpen && status.state === "outstanding" ? <Badge>Link sent</Badge> : null}
    </div>
  );
}
