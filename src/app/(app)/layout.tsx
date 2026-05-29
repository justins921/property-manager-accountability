import { requireOrgContext } from "@/lib/org";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireOrgContext();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        orgName={ctx.org.name}
        userName={ctx.fullName || ctx.email}
        role={ctx.role}
      />
      <main className="flex-1 overflow-y-auto bg-slate-50 px-8 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
