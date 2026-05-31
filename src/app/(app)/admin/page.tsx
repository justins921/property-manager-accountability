import Link from "next/link";
import { adminListOrganizations, requirePlatformAdmin } from "@/lib/admin";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function AdminPage() {
  await requirePlatformAdmin();
  const orgs = await adminListOrganizations();

  return (
    <div>
      <PageHeader
        title="Platform Admin"
        description="Every organization on the platform · read-only operator view"
      />

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        You&rsquo;re viewing platform-wide data as an operator. This is read-only
        and crosses tenant boundaries — handle customer data with care.
      </div>

      {orgs.length === 0 ? (
        <EmptyState title="No organizations yet" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Active vacancies</th>
                <th className="px-4 py-3">Open inspections</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.map((o) => (
                <tr key={o.org.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {o.org.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.members}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {o.activeVacancies}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {o.openInspections}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(o.org.created_at.slice(0, 10))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/orgs/${o.org.id}`}
                      className="font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Dashboard →
                    </Link>
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
