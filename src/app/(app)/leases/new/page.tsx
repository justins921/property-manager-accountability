import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getLeases, getTenants, getUnits, getVacancyDetail } from "@/lib/queries";
import { LeaseForm, type LeaseFormDefaults } from "@/components/forms/lease-form";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { unitLabel } from "@/lib/utils";

export default async function NewLeasePage({
  searchParams,
}: {
  searchParams: Promise<{ unit_id?: string; vacancy_id?: string; tenant_id?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireOrgContext();
  const [units, leases, tenants, vacancyDetail] = await Promise.all([
    getUnits(ctx.org.id),
    getLeases(ctx.org.id),
    getTenants(ctx.org.id),
    params.vacancy_id ? getVacancyDetail(ctx.org.id, params.vacancy_id) : null,
  ]);

  const occupied = new Set(leases.filter((l) => l.status === "active").map((l) => l.unit_id));
  const vacancy = vacancyDetail?.vacancy;
  const defaults: LeaseFormDefaults = {
    unitId: params.unit_id ?? vacancy?.unit_id ?? undefined,
    vacancyId: vacancy?.id,
    tenantId: params.tenant_id,
    monthlyRent: vacancy?.monthly_rent,
    startDate: vacancy ? vacancy.actual_move_in_date ?? vacancy.expected_move_in_date : undefined,
  };

  return (
    <div>
      <PageHeader
        title="New lease"
        description={
          vacancy
            ? `Filling the vacancy at ${vacancy.property?.name ?? "the property"} · Unit ${vacancy.unit_number}`
            : "Rent a unit to one or more tenants"
        }
      />
      {units.length === 0 ? (
        <EmptyState
          title="Set up units first"
          description={
            ctx.role === "owner"
              ? "A lease belongs to a unit. Open a property and add its buildings and units (a single-family home is one click)."
              : "A lease belongs to a unit, and this portfolio has no units yet. Ask an owner to add buildings and units on the property page."
          }
          action={<LinkButton href="/properties">Go to properties</LinkButton>}
        />
      ) : (
        <LeaseForm
          units={units.map((u) => ({
            id: u.id,
            label: unitLabel(u, u.property),
            occupied: occupied.has(u.id),
          }))}
          tenants={tenants}
          defaults={defaults}
        />
      )}
      <p className="mt-4 text-sm text-slate-400">
        <Link href="/rent-roll">← Back to rent roll</Link>
      </p>
    </div>
  );
}
