import Link from "next/link";
import { daysVacant, vacancyCost, vacancyStatus } from "@/lib/calculations";
import { requireOrgContext } from "@/lib/org";
import { getMembers, getProfileMap, getProperties, getVacancies } from "@/lib/queries";
import { PropertyForm } from "@/components/forms/property-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

export default async function PropertiesPage() {
  const ctx = await requireOrgContext();
  const [properties, vacancies, members, profiles] = await Promise.all([
    getProperties(ctx.org.id),
    getVacancies(ctx.org.id),
    getMembers(ctx.org.id),
    getProfileMap(ctx.org.id),
  ]);
  const now = new Date();
  const managers = members.filter((m) => m.role === "manager" || m.role === "owner");

  return (
    <div>
      <PageHeader
        title="Properties"
        description="Your portfolio and per-property vacancy performance"
      />

      <div className="mb-6">
        <PropertyForm managers={managers} />
      </div>

      {properties.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Add your first property to start tracking its vacancies."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => {
            const propVacancies = vacancies.filter((v) => v.property_id === p.id);
            const active = propVacancies.filter(
              (v) => v.stage !== "completed" && !v.closed_at,
            );
            const overdue = active.filter((v) => vacancyStatus(v, now) === "red");
            const cost = propVacancies.reduce(
              (s, v) => s + vacancyCost(v, now),
              0,
            );
            const managerName =
              (p.manager_id && profiles.get(p.manager_id)?.full_name) ||
              "Unassigned";
            return (
              <Link
                key={p.id}
                href={`/properties/${p.id}`}
                className="card p-5 transition hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{p.name}</h3>
                    {p.address ? (
                      <p className="text-sm text-slate-500">{p.address}</p>
                    ) : null}
                  </div>
                  {overdue.length > 0 ? (
                    <Badge className="bg-red-50 text-red-700">
                      {overdue.length} overdue
                    </Badge>
                  ) : null}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-400">Active vacancies</dt>
                    <dd className="font-semibold text-slate-900">
                      {active.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Vacancy cost</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatCurrency(cost)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-slate-400">
                  Manager: {managerName}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
