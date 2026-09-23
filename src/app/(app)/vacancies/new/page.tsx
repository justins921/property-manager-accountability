import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getMembers, getProperties, getUnits } from "@/lib/queries";
import { NewVacancyForm } from "@/components/forms/new-vacancy-form";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

export default async function NewVacancyPage({
  searchParams,
}: {
  searchParams: Promise<{
    property_id?: string;
    unit_id?: string;
    monthly_rent?: string;
    move_out_date?: string;
  }>;
}) {
  const params = await searchParams;
  const ctx = await requireOrgContext();
  const [properties, members, units] = await Promise.all([
    getProperties(ctx.org.id),
    getMembers(ctx.org.id),
    getUnits(ctx.org.id),
  ]);

  const managers = members.filter((m) => m.role === "manager" || m.role === "owner");

  return (
    <div>
      <PageHeader
        title="Create vacancy"
        description="As soon as a tenant gives notice or moves out, log the vacancy. The timer starts immediately."
      />
      {properties.length === 0 ? (
        <EmptyState
          title="Add a property first"
          description="You need at least one property before you can log a vacancy."
          action={<LinkButton href="/properties">Go to properties</LinkButton>}
        />
      ) : (
        <NewVacancyForm
          properties={properties}
          managers={managers}
          units={units.map((u) => ({
            id: u.id,
            property_id: u.property_id,
            label: u.building ? `${u.building.name} · Unit ${u.name}` : `Unit ${u.name}`,
          }))}
          defaults={{
            propertyId: params.property_id,
            unitId: params.unit_id,
            monthlyRent: params.monthly_rent,
            moveOutDate: params.move_out_date,
          }}
        />
      )}
      <p className="mt-4 text-sm text-slate-400">
        <Link href="/vacancies">← Back to vacancies</Link>
      </p>
    </div>
  );
}
