import { stopViewingOrg } from "@/app/actions/admin-view";
import { requireOrgContext } from "@/lib/org";
import { isPlatformAdmin } from "@/lib/admin";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireOrgContext();
  const isAdmin = await isPlatformAdmin({ id: ctx.userId, email: ctx.email });

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        orgName={ctx.org.name}
        userName={ctx.fullName || ctx.email}
        role={ctx.role}
        isAdmin={isAdmin}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {ctx.isAdminView ? (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white lg:px-6">
            <span>
              👁️ Viewing <strong>{ctx.org.name}</strong> as platform admin —
              read-only. Changes are disabled.
            </span>
            <form action={stopViewingOrg}>
              <button
                type="submit"
                className="rounded-md bg-white/20 px-3 py-1 font-semibold transition hover:bg-white/30"
              >
                Exit admin view
              </button>
            </form>
          </div>
        ) : null}
        <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
