import { requireOrgContext } from "@/lib/org";
import { getProperties, getUnits, getWorkOrders } from "@/lib/queries";
import { NewWorkOrderForm } from "@/components/forms/work-order-forms";
import { WorkOrderList } from "@/components/work-orders";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { WORK_ORDER_STATUS_LABELS, type WorkOrderStatus } from "@/lib/types";

const OPEN: WorkOrderStatus[] = ["new", "assigned", "in_progress"];

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string; unit_id?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireOrgContext();
  const [orders, properties, units] = await Promise.all([
    getWorkOrders(ctx.org.id),
    getProperties(ctx.org.id),
    getUnits(ctx.org.id),
  ]);
  const done = orders.filter((w) => w.status === "done").slice(0, 20);

  return (
    <div>
      <PageHeader
        title="Work orders"
        description="Repairs from request to done: New → Assigned → In progress → Done"
      />

      {properties.length === 0 ? (
        <EmptyState
          title="Add a property first"
          description="Work orders belong to a property (and usually a unit)."
          action={<LinkButton href="/properties">Go to properties</LinkButton>}
        />
      ) : (
        <>
          {!ctx.isAdminView ? (
            <div className="mb-6">
              <NewWorkOrderForm
                orgId={ctx.org.id}
                properties={properties.map((p) => ({ id: p.id, name: p.name }))}
                units={units.map((u) => ({
                  id: u.id,
                  property_id: u.property_id,
                  label: u.building ? `${u.building.name} · Unit ${u.name}` : `Unit ${u.name}`,
                }))}
                defaults={{ propertyId: params.property_id, unitId: params.unit_id }}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {OPEN.map((status) => {
              const list = orders.filter((w) => w.status === status);
              return (
                <Card key={status}>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {WORK_ORDER_STATUS_LABELS[status]} ({list.length})
                  </h2>
                  <WorkOrderList orders={list} empty="Nothing here." />
                </Card>
              );
            })}
          </div>

          <Card className="mt-6">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Recently done</h2>
            <WorkOrderList orders={done} empty="No completed work orders yet." />
          </Card>

          <p className="mt-4 text-sm text-slate-500">
            Tenants can send repair requests without logging in: copy a unit&rsquo;s
            request link from its unit page and share it with them.
          </p>
        </>
      )}
    </div>
  );
}
