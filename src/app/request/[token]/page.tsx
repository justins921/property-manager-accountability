import { TenantRepairForm } from "@/components/forms/work-order-forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { unitLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request a repair", robots: { index: false } };

/** Public repair request form for one unit (no tenant login). */
export default async function RepairRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{64}$/.test(token);
  const { data } = valid
    ? await createAdminClient()
        .from("units")
        .select("name, building:buildings(name), property:properties(name), org:organizations(name)")
        .eq("maintenance_token", token)
        .maybeSingle()
    : { data: null };
  const unit = data as unknown as {
    name: string;
    building: { name: string } | null;
    property: { name: string } | null;
    org: { name: string } | null;
  } | null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
            {unit?.org?.name ?? "Repair request"}
          </p>
          {unit ? <p className="mt-1 text-slate-600">{unitLabel(unit, unit.property)}</p> : null}
        </div>
        <div className="card p-6">
          {unit ? (
            <TenantRepairForm token={token} />
          ) : (
            <div className="text-center">
              <h1 className="text-xl font-bold text-slate-900">This link isn&rsquo;t active</h1>
              <p className="mt-2 text-sm text-slate-600">Ask your property manager for a new repair request link.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
