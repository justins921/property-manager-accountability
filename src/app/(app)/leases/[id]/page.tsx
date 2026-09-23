import Link from "next/link";
import { notFound } from "next/navigation";
import {
  depositCollected,
  ledgerBalance,
  occupancyLabel,
  pastDueBalance,
} from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { getLease, getLedgerEntries, getProfileMap, getVacancies } from "@/lib/queries";
import { BalanceText, LedgerTable, OccupancyBadge } from "@/components/leasing";
import {
  DeleteLeaseButton,
  EndLeaseForm,
  LedgerEntryForm,
} from "@/components/forms/lease-actions";
import { Card, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { formatCurrency, formatDate, tenantName, unitLabel } from "@/lib/utils";

export default async function LeaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const [lease, entries, profiles, vacancies] = await Promise.all([
    getLease(ctx.org.id, id),
    getLedgerEntries(ctx.org.id, [id]),
    getProfileMap(ctx.org.id),
    getVacancies(ctx.org.id),
  ]);
  if (!lease) notFound();

  const now = new Date();
  const open = lease.status === "active" || lease.status === "upcoming";
  const balance = ledgerBalance(entries, now);
  const scheduled = ledgerBalance(entries) - balance;
  const tenants = [...lease.lease_tenants].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );

  // After a lease ends, offer to open a vacancy — unless one already exists
  // for this unit starting on or after the move-out.
  const endedOn = lease.ended_on;
  const hasVacancy =
    !!endedOn &&
    vacancies.some((v) => v.unit_id === lease.unit_id && v.move_out_date >= endedOn);
  const vacancyHref = endedOn
    ? `/vacancies/new?${new URLSearchParams({
        property_id: lease.property_id,
        unit_id: lease.unit_id,
        monthly_rent: String(lease.monthly_rent),
        move_out_date: endedOn,
      })}`
    : null;
  const filledVacancy = lease.vacancy_id
    ? vacancies.find((v) => v.id === lease.vacancy_id)
    : null;

  return (
    <div>
      <p className="mb-2 text-sm text-slate-400">
        <Link href="/rent-roll">← Rent roll</Link>
        {lease.unit ? (
          <>
            {" · "}
            <Link href={`/units/${lease.unit_id}`}>Unit {lease.unit.name}</Link>
          </>
        ) : null}
      </p>
      <PageHeader
        title={unitLabel(lease.unit, lease.property)}
        description={`${formatDate(lease.start_date)} → ${
          lease.ended_on
            ? `${formatDate(lease.ended_on)} (${lease.status})`
            : lease.end_date
              ? formatDate(lease.end_date)
              : "month-to-month"
        }`}
        action={<OccupancyBadge label={occupancyLabel(lease, now)} />}
      />

      {!open && vacancyHref && !hasVacancy ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>This lease has ended. Open a vacancy to start the turn clock on this unit.</span>
          <LinkButton href={vacancyHref}>Open vacancy</LinkButton>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Balance" value={<BalanceText amount={balance} />} sub={`${formatCurrency(pastDueBalance(entries, now), true)} past due${
            scheduled > 0 ? ` · ${formatCurrency(scheduled, true)} scheduled` : ""
          }`}
        />
        <StatCard
          label="Rent"
          value={formatCurrency(lease.monthly_rent)}
          sub={`due day ${lease.rent_due_day} · auto from ${formatDate(lease.billing_start_date)}`}
        />
        <StatCard
          label="Late fee"
          value={lease.late_fee_amount > 0 ? formatCurrency(lease.late_fee_amount) : "None"}
          sub={lease.late_fee_amount > 0 ? `after ${lease.late_fee_grace_days}-day grace` : undefined}
        />
        <StatCard
          label="Deposit held"
          value={formatCurrency(depositCollected(entries))}
          sub={`of ${formatCurrency(lease.security_deposit)} required`}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Ledger</h2>
            <LedgerTable entries={entries} profiles={profiles} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Tenants</h2>
            <ul className="space-y-2 text-sm">
              {tenants.map((lt) => (
                <li key={lt.id}>
                  <Link href={`/tenants/${lt.tenant_id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {tenantName(lt.tenant)}
                  </Link>
                  {lt.is_primary ? <span className="ml-2 text-xs text-slate-400">primary</span> : null}
                  {lt.tenant?.email || lt.tenant?.phone ? (
                    <p className="text-xs text-slate-500">
                      {[lt.tenant?.email, lt.tenant?.phone].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {filledVacancy ? (
              <p className="mt-4 text-xs text-slate-500">
                Filled vacancy:{" "}
                <Link href={`/vacancies/${filledVacancy.id}`} className="text-brand-600">
                  moved out {formatDate(filledVacancy.move_out_date)}
                </Link>
              </p>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Record an entry</h2>
            <p className="mb-4 text-sm text-slate-500">
              Rent and late fees post automatically. Record payments, credits
              and one-off charges here.
            </p>
            <LedgerEntryForm leaseId={lease.id} />
          </Card>

          {open ? (
            <Card>
              <h2 className="mb-1 text-lg font-semibold text-slate-900">End lease</h2>
              <p className="mb-4 text-sm text-slate-500">
                Record the move-out. You&rsquo;ll be offered a vacancy for the unit.
              </p>
              <EndLeaseForm leaseId={lease.id} />
            </Card>
          ) : null}

          {ctx.role === "owner" ? (
            <Card>
              <DeleteLeaseButton leaseId={lease.id} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
