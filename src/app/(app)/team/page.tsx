import { requireOrgContext } from "@/lib/org";
import { getMembers } from "@/lib/queries";
import { InviteForm } from "@/components/forms/invite-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function TeamPage() {
  const ctx = await requireOrgContext();
  const members = await getMembers(ctx.org.id);
  const isOwner = ctx.role === "owner";

  return (
    <div>
      <PageHeader
        title="Team"
        description="Owners and property managers in your organization"
      />

      {isOwner ? (
        <div className="mb-6">
          <InviteForm />
        </div>
      ) : (
        <p className="mb-6 text-sm text-slate-500">
          Only owners can invite new members.
        </p>
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {m.profile?.full_name || "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">{m.profile?.email}</td>
                <td className="px-4 py-3">
                  <Badge
                    className={
                      m.role === "owner"
                        ? "bg-brand-50 text-brand-700"
                        : undefined
                    }
                  >
                    {m.role}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {formatDate(m.created_at.slice(0, 10))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
