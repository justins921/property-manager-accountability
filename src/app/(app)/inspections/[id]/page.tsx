import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getRoutineInspectionDetail } from "@/lib/queries";
import { routineInspectionStatus } from "@/lib/inspections-calc";
import { CHECKLIST_LABELS } from "@/lib/inspection-checklist";
import { ITEM_RESULT_LABELS } from "@/lib/types";
import { CompleteInspectionForm } from "@/components/forms/complete-inspection-form";
import { MediaGallery } from "@/components/media-gallery";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const RESULT_STYLES: Record<string, string> = {
  pass: "text-status-green",
  needs_attention: "text-status-red",
  na: "text-slate-400",
};

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const detail = await getRoutineInspectionDetail(ctx.org.id, id);
  if (!detail) notFound();

  const { inspection, manager, items, media } = detail;
  const now = new Date();
  const isComplete = !!inspection.completed_at;

  return (
    <div>
      <p className="mb-2 text-sm text-slate-400">
        <Link href="/inspections">← Inspections</Link>
      </p>
      <PageHeader
        title={`${inspection.property?.name ?? "Property"} — Routine inspection`}
        description={`Due ${formatDate(inspection.due_date)} · Manager: ${
          manager?.full_name || manager?.email || "Unassigned"
        }`}
        action={<StatusBadge status={routineInspectionStatus(inspection, now)} />}
      />

      {isComplete ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Completed {formatDate(inspection.completed_at!.slice(0, 10))}.
          </p>
          {items.map((item) => {
            const itemMedia = media.filter((m) => m.item_id === item.id);
            return (
              <Card key={item.id}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">
                    {CHECKLIST_LABELS[item.area_key] ?? item.area_key}
                  </h3>
                  <span
                    className={`text-sm font-semibold ${RESULT_STYLES[item.result]}`}
                  >
                    {ITEM_RESULT_LABELS[item.result]}
                  </span>
                </div>
                {item.notes ? (
                  <p className="mt-1 text-sm text-slate-600">{item.notes}</p>
                ) : null}
                <div className="mt-3">
                  <MediaGallery media={itemMedia} bucket="property-media" />
                </div>
              </Card>
            );
          })}
          {inspection.overall_notes ? (
            <Card>
              <h3 className="font-semibold text-slate-900">Overall notes</h3>
              <p className="mt-1 text-sm text-slate-600">
                {inspection.overall_notes}
              </p>
            </Card>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500">
            Walk the property and document each area below. A photo is required
            for every area unless you mark it N/A.
          </p>
          <CompleteInspectionForm orgId={ctx.org.id} inspectionId={inspection.id} />
        </>
      )}
    </div>
  );
}
