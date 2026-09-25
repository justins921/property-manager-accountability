import Link from "next/link";
import { notFound } from "next/navigation";
import {
  autopayState,
  currentRentPeriod,
  depositCollected,
  ledgerBalance,
  occupancyLabel,
  pastDueBalance,
} from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import {
  getAutopayAttempts,
  getLease,
  getLedgerEntries,
  getPaymentLinks,
  getProfileMap,
  getVacancies,
} from "@/lib/queries";
import { stripeConfigured } from "@/lib/stripe";
import { BalanceText, LedgerTable, OccupancyBadge } from "@/components/leasing";
import {
  DeleteLeaseButton,
  EndLeaseForm,
  LedgerEntryForm,
} from "@/components/forms/lease-actions";
import {
  ConnectStripeButton,
  SendPayLinkForm,
  TurnOffAutopayButton,
  VoidLinkButton,
} from "@/components/forms/payment-forms";
import { Badge, Card, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { PAYMENT_LINK_STATUS_LABELS } from "@/lib/types";
import { formatCurrency, formatDate, tenantName, unitLabel } from "@/lib/utils";

export default async function LeaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const [lease, entries, profiles, vacancies, links, attempts] = await Promise.all([
    getLease(ctx.org.id, id),
    getLedgerEntries(ctx.org.id, [id]),
    getProfileMap(ctx.org.id),
    getVacancies(ctx.org.id),
    getPaymentLinks(ctx.org.id, [id]),
    getAutopayAttempts(ctx.org.id, [id]),
  ]);
  if (!lease) notFound();

  const now = new Date();
  const open = lease.status === "active" || lease.status === "upcoming";
  const balance = ledgerBalance(entries, now);
  const scheduled = ledgerBalance(entries) - balance;
  const paymentsOn = stripeConfigured() && !!ctx.org.stripe_charges_enabled;
  const period = currentRentPeriod(lease, now)?.period ?? null;
  const autopayNow = autopayState(attempts, period);
  const lastAttempt = attempts.find((a) => a.period === period);
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

          {/* Hidden entirely until Stripe is configured for the platform. */}
          {open && stripeConfigured() ? (
            <Card>
              <h2 className="mb-1 text-lg font-semibold text-slate-900">Online payments</h2>
              {!paymentsOn ? (
                <div className="space-y-3 text-sm text-slate-500">
                  <p>
                    Let tenants pay by bank account or card from a link, and turn on
                    autopay. Payments post to this ledger automatically.
                  </p>
                  {ctx.role === "owner" && stripeConfigured() && !ctx.isAdminView ? (
                    <ConnectStripeButton />
                  ) : (
                    <p>An owner can turn this on from the Rent Roll page.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    {lease.autopay_enabled ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="font-medium text-slate-900">Autopay on</span>
                          <span className="text-slate-500"> · {lease.autopay_method_label}</span>
                        </span>
                        {!ctx.isAdminView ? <TurnOffAutopayButton leaseId={lease.id} /> : null}
                      </div>
                    ) : (
                      <span className="text-slate-500">Autopay off</span>
                    )}
                    {autopayNow === "failed" && lastAttempt ? (
                      <p className="mt-1 text-xs font-medium text-status-red">
                        This month&rsquo;s charge failed ({lastAttempt.failure_message ?? "declined"}).{" "}
                        {attempts.filter((a) => a.period === period).length < 3
                          ? "It retries automatically."
                          : "No retries left. Send a payment link."}
                      </p>
                    ) : null}
                    {autopayNow === "processing" ? (
                      <p className="mt-1 text-xs text-slate-500">This month&rsquo;s bank payment is processing.</p>
                    ) : null}
                  </div>
                  {!ctx.isAdminView ? (
                    <SendPayLinkForm leaseId={lease.id} balance={balance} autopayOn={lease.autopay_enabled} />
                  ) : null}
                  {links.length > 0 ? (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {links.slice(0, 5).map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                          <span>
                            <span className="text-slate-700">
                              {l.kind === "autopay" ? "Autopay setup" : formatCurrency(Number(l.amount), true)}
                            </span>
                            <span className="block text-xs text-slate-400">
                              {formatDate(l.created_at.slice(0, 10))}
                              {l.created_by ? "" : " · automatic reminder"}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge
                              className={
                                l.status === "paid"
                                  ? "bg-green-50 text-green-700"
                                  : l.status === "failed"
                                    ? "bg-red-50 text-red-700"
                                    : l.status === "processing"
                                      ? "bg-blue-50 text-blue-700"
                                      : undefined
                              }
                            >
                              {PAYMENT_LINK_STATUS_LABELS[l.status]}
                            </Badge>
                            {l.status === "open" && !ctx.isAdminView ? <VoidLinkButton linkId={l.id} /> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </Card>
          ) : null}

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
