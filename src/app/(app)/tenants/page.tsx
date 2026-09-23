import Link from "next/link";
import { ledgerBalance } from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { entriesByLease, getLeases, getLedgerEntries, getTenants } from "@/lib/queries";
import { BalanceText } from "@/components/leasing";
import { TenantForm } from "@/components/forms/tenant-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import type { LeaseWithRelations } from "@/lib/types";
import { tenantName, unitLabel } from "@/lib/utils";

export default async function TenantsPage() {
  const ctx = await requireOrgContext();
  const [tenants, leases, entries] = await Promise.all([
    getTenants(ctx.org.id),
    getLeases(ctx.org.id),
    getLedgerEntries(ctx.org.id),
  ]);
  const ledger = entriesByLease(entries);
  const now = new Date();

  // Each tenant's current lease: active first, else upcoming.
  const currentLease = new Map<string, LeaseWithRelations>();
  for (const status of ["upcoming", "active"] as const) {
    for (const lease of leases.filter((l) => l.status === status)) {
      for (const lt of lease.lease_tenants) currentLease.set(lt.tenant_id, lease);
    }
  }

  return (
    <div>
      <PageHeader title="Tenants" description="Everyone renting from you, with their current lease and balance" />

      <Card className="mb-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Add a tenant</h2>
        <TenantForm />
      </Card>

      {tenants.length === 0 ? (
        <EmptyState
          title="No tenants yet"
          description="Add a tenant here, or create a lease and add the tenant as part of it."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Current unit</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => {
                const lease = currentLease.get(t.id);
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <Link href={`/tenants/${t.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {tenantName(t)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {[t.email, t.phone].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {lease ? (
                        <Link href={`/leases/${lease.id}`} className="hover:text-brand-700">
                          {unitLabel(lease.unit, lease.property)}
                          {lease.status === "upcoming" ? " (upcoming)" : ""}
                        </Link>
                      ) : (
                        <span className="text-slate-400">No current lease</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {lease ? <BalanceText amount={ledgerBalance(ledger.get(lease.id) ?? [], now)} /> : "—"}
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
