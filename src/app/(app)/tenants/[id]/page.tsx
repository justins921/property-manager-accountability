import Link from "next/link";
import { notFound } from "next/navigation";
import { depositCollected, ledgerBalance, occupancyLabel } from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import {
  entriesByLease,
  getLedgerEntries,
  getProfileMap,
  getTenant,
  getTenantLeases,
} from "@/lib/queries";
import { BalanceText, LedgerTable, OccupancyBadge } from "@/components/leasing";
import { DeleteTenantButton, TenantForm } from "@/components/forms/tenant-form";
import { Card, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { formatCurrency, formatDate, leaseTenantNames, tenantName, unitLabel } from "@/lib/utils";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const [tenant, leases, profiles] = await Promise.all([
    getTenant(ctx.org.id, id),
    getTenantLeases(ctx.org.id, id),
    getProfileMap(ctx.org.id),
  ]);
  if (!tenant) notFound();

  const entries = await getLedgerEntries(ctx.org.id, leases.map((l) => l.id));
  const ledger = entriesByLease(entries);
  const now = new Date();
  const current =
    leases.find((l) => l.status === "active") ?? leases.find((l) => l.status === "upcoming");
  const past = leases.filter((l) => l !== current);
  const currentEntries = current ? ledger.get(current.id) ?? [] : [];

  return (
    <div>
      <p className="mb-2 text-sm text-slate-400">
        <Link href="/tenants">← Tenants</Link>
      </p>
      <PageHeader
        title={tenantName(tenant)}
        description={[tenant.email, tenant.phone].filter(Boolean).join(" · ") || undefined}
        action={
          current ? undefined : (
            <LinkButton href={`/leases/new?tenant_id=${tenant.id}`}>+ New lease</LinkButton>
          )
        }
      />

      {current ? (
        <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Balance" value={<BalanceText amount={ledgerBalance(currentEntries, now)} />} />
          <StatCard label="Rent" value={formatCurrency(current.monthly_rent)} sub={`due on day ${current.rent_due_day}`} />
          <StatCard
            label="Lease end"
            value={current.end_date ? formatDate(current.end_date) : "Month-to-month"}
          />
          <StatCard
            label="Deposit held"
            value={formatCurrency(depositCollected(currentEntries))}
            sub={`of ${formatCurrency(current.security_deposit)} required`}
          />
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Current lease</h2>
              {current ? (
                <Link href={`/leases/${current.id}`} className="text-sm font-semibold text-brand-600">
                  Open lease →
                </Link>
              ) : null}
            </div>
            {current ? (
              <>
                <p className="mb-4 text-sm text-slate-600">
                  {unitLabel(current.unit, current.property)} · {leaseTenantNames(current)} ·{" "}
                  <OccupancyBadge label={occupancyLabel(current, now)} />
                </p>
                <LedgerTable entries={currentEntries} profiles={profiles} />
              </>
            ) : (
              <p className="text-sm text-slate-500">No active or upcoming lease.</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Past leases</h2>
            {past.length === 0 ? (
              <p className="text-sm text-slate-500">None.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {past.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/leases/${l.id}`}
                      className="flex items-center justify-between py-3 text-sm transition hover:opacity-75"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{unitLabel(l.unit, l.property)}</p>
                        <p className="text-xs text-slate-500">
                          {formatDate(l.start_date)} → {formatDate(l.ended_on ?? l.end_date)}
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
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Details</h2>
            <TenantForm tenant={tenant} />
          </Card>
          {ctx.role === "owner" ? (
            <Card>
              <DeleteTenantButton tenantId={tenant.id} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
