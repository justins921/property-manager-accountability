import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getMembers, getProperties } from "@/lib/queries";
import { NewVacancyForm } from "@/components/forms/new-vacancy-form";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

export default async function NewVacancyPage() {
  const ctx = await requireOrgContext();
  const [properties, members] = await Promise.all([
    getProperties(ctx.org.id),
    getMembers(ctx.org.id),
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
        <NewVacancyForm properties={properties} managers={managers} />
      )}
      <p className="mt-4 text-sm text-slate-400">
        <Link href="/vacancies">← Back to vacancies</Link>
      </p>
    </div>
  );
}
