import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getVendorSuggestions, getWorkOrder } from "@/lib/queries";
import {
  AddPhotosForm,
  AdvanceWorkOrderForm,
  DeleteWorkOrderButton,
  WorkOrderDetailsForm,
} from "@/components/forms/work-order-forms";
import { MediaGallery } from "@/components/media-gallery";
import { WorkOrderStatusBadge, WorkOrderSteps, workOrderPlace } from "@/components/work-orders";
import { Card, PageHeader } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const [wo, vendors] = await Promise.all([
    getWorkOrder(ctx.org.id, id),
    getVendorSuggestions(ctx.org.id),
  ]);
  if (!wo) notFound();
  const canEdit = !ctx.isAdminView;

  return (
    <div>
      <p className="mb-2 text-sm text-slate-400">
        <Link href="/work-orders">← Work orders</Link>
        {" · "}
        <Link href={`/properties/${wo.property_id}`}>{wo.property?.name ?? "Property"}</Link>
      </p>
      <PageHeader
        title={wo.title}
        description={workOrderPlace(wo)}
        action={<WorkOrderStatusBadge status={wo.status} />}
      />

      <Card className="mb-6">
        <WorkOrderSteps
          status={wo.status}
          dates={{ new: wo.created_at, assigned: wo.assigned_at, in_progress: wo.started_at, done: wo.completed_on ?? wo.done_at }}
        />
        {wo.status !== "done" && canEdit ? (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <AdvanceWorkOrderForm workOrderId={wo.id} status={wo.status} vendors={vendors} />
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Details</h2>
            {wo.description ? (
              <p className="whitespace-pre-line text-sm text-slate-700">{wo.description}</p>
            ) : (
              <p className="text-sm text-slate-400">No details added.</p>
            )}
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Reported</dt>
                <dd className="text-slate-900">
                  {formatDate(wo.created_at.slice(0, 10))}
                  {wo.source === "tenant"
                    ? ` by ${wo.reporter_name ?? "tenant"}${wo.reporter_contact ? ` (${wo.reporter_contact})` : ""}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Vendor</dt>
                <dd className="text-slate-900">
                  {wo.vendor_name ? (
                    <>
                      {wo.vendor_name}
                      {wo.vendor_phone ? (
                        <a href={`tel:${wo.vendor_phone}`} className="ml-2 text-brand-600">
                          {wo.vendor_phone}
                        </a>
                      ) : null}
                    </>
                  ) : (
                    "Not assigned"
                  )}
                </dd>
              </div>
              {wo.status === "done" ? (
                <>
                  <div>
                    <dt className="text-slate-500">Completed</dt>
                    <dd className="text-slate-900">{formatDate(wo.completed_on)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Cost</dt>
                    <dd className="text-slate-900">{wo.cost !== null ? formatCurrency(Number(wo.cost), true) : "Not entered"}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Photos</h2>
            {wo.media.length ? (
              <MediaGallery media={wo.media} bucket="property-media" />
            ) : (
              <p className="mb-3 text-sm text-slate-400">No photos yet.</p>
            )}
            {canEdit ? (
              <div className="mt-4">
                <AddPhotosForm orgId={ctx.org.id} workOrderId={wo.id} />
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          {wo.vendor_name && canEdit ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Vendor &amp; cost</h2>
              <WorkOrderDetailsForm
                workOrderId={wo.id}
                vendorName={wo.vendor_name}
                vendorPhone={wo.vendor_phone}
                cost={wo.cost !== null ? Number(wo.cost) : null}
              />
            </Card>
          ) : null}
          <Card>
            <p className="text-sm text-slate-500">
              Needs the owner&rsquo;s OK first?{" "}
              <Link href={`/requests?property_id=${wo.property_id}`} className="font-medium text-brand-600">
                Send an owner request
              </Link>
              .
            </p>
          </Card>
          {ctx.role === "owner" && canEdit ? (
            <Card>
              <DeleteWorkOrderButton workOrderId={wo.id} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
