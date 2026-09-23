import { startViewingOrg } from "@/app/actions/admin-view";
import {
  adminListOrganizations,
  adminListUsers,
  requirePlatformAdmin,
} from "@/lib/admin";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import {
  AdminAddUserForm,
  MembershipControls,
} from "@/components/forms/admin-users";
import { formatDate } from "@/lib/utils";

export default async function AdminPage() {
  await requirePlatformAdmin();
  const [orgs, users] = await Promise.all([
    adminListOrganizations(),
    adminListUsers(),
  ]);

  return (
    <div>
      <PageHeader
        title="Platform Admin"
        description="Every organization and user on the platform · super admin"
      />

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        &ldquo;View as&rdquo; opens a customer&rsquo;s account in read-only mode —
        you can browse every page they see, but changes are disabled. A banner
        stays up while you&rsquo;re viewing, with an exit button.
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
                    <form action={startViewingOrg}>
                      <input type="hidden" name="org_id" value={o.org.id} />
                      <button
                        type="submit"
                        className="font-semibold text-brand-600 hover:text-brand-700"
                      >
                        View as →
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-1 mt-10 text-lg font-semibold text-slate-900">
        Users &amp; access
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Owners run their organization, including its team. Property managers
        handle day-to-day work and can&rsquo;t manage the team.
      </p>

      <div className="mb-6">
        <AdminAddUserForm
          orgs={orgs.map((o) => ({ id: o.org.id, name: o.org.name }))}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Organizations &amp; roles</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {u.full_name || u.email}
                    {u.is_super_admin ? (
                      <Badge className="ml-2 bg-brand-50 text-brand-700">
                        super admin
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  {u.memberships.length === 0 ? (
                    <span className="text-slate-400">No organization</span>
                  ) : (
                    <ul className="space-y-1.5">
                      {u.memberships.map((m) => (
                        <li
                          key={m.org_id}
                          className="flex flex-wrap items-center gap-3"
                        >
                          <span className="text-slate-700">{m.org_name}</span>
                          <MembershipControls
                            orgId={m.org_id}
                            userId={u.id}
                            role={m.role}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {formatDate(u.created_at.slice(0, 10))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
