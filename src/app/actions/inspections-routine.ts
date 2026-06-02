"use server";

import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstDueOnOrAfter } from "@/lib/inspections-calc";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import type {
  InspectionFrequency,
  InspectionItemResult,
} from "@/lib/types";

const scheduleSchema = z.object({
  property_id: z.string().uuid(),
  template_id: z.string().uuid(),
  building_id: z.string().uuid().optional().or(z.literal("")),
  unit_id: z.string().uuid().optional().or(z.literal("")),
  manager_id: z.string().uuid().optional().or(z.literal("")),
  anchor_date: z.string().min(1),
  active: z.union([z.literal("on"), z.literal("")]).optional(),
});

/**
 * Add (or update) a schedule that applies a template to a property on its
 * cadence. A property can have several schedules — one per template. Owner only.
 */
export async function addSchedule(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") {
    return { error: "Only owners can manage inspection schedules." };
  }

  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const {
    property_id,
    template_id,
    building_id,
    unit_id,
    manager_id,
    anchor_date,
    active,
  } = parsed.data;

  const supabase = await createClient();

  // The cadence comes from the chosen template.
  const { data: template } = await supabase
    .from("inspection_templates")
    .select("frequency")
    .eq("org_id", ctx.org.id)
    .eq("id", template_id)
    .maybeSingle();
  if (!template) return { error: "Template not found." };

  const frequency = template.frequency as InspectionFrequency;
  const nextDue = format(
    firstDueOnOrAfter(anchor_date, frequency),
    "yyyy-MM-dd",
  );

  const row = {
    org_id: ctx.org.id,
    property_id,
    template_id,
    building_id: building_id || null,
    unit_id: unit_id || null,
    manager_id: manager_id || null,
    frequency,
    anchor_date,
    next_due_date: nextDue,
    active: active === "on",
    created_by: ctx.userId,
  };

  // Upsert on the (property, building, unit, template) target so re-adding the
  // same template to the same target updates rather than duplicates.
  const { error } = await supabase
    .from("inspection_schedules")
    .upsert(row, { onConflict: "property_id,building_id,unit_id,template_id" });

  if (error) return { error: error.message };
  revalidatePath(`/properties/${property_id}`);
  revalidatePath("/inspections");
  return { ok: true };
}

export async function removeSchedule(scheduleId: string, propertyId: string) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") {
    return { error: "Only owners can manage inspection schedules." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("inspection_schedules")
    .delete()
    .eq("org_id", ctx.org.id)
    .eq("id", scheduleId);
  if (error) return { error: error.message };
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

const adhocSchema = z.object({
  property_id: z.string().uuid(),
  template_id: z.string().uuid(),
  building_id: z.string().uuid().optional().or(z.literal("")),
  unit_id: z.string().uuid().optional().or(z.literal("")),
  manager_id: z.string().uuid().optional().or(z.literal("")),
  due_date: z.string().optional(),
});

/** Create a one-off inspection from a template, due now (or on a given date). */
export async function createAdHocInspection(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = adhocSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { property_id, template_id, building_id, unit_id, manager_id, due_date } =
    parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_inspections")
    .insert({
      org_id: ctx.org.id,
      property_id,
      template_id,
      building_id: building_id || null,
      unit_id: unit_id || null,
      manager_id: manager_id || null,
      due_date: due_date || format(new Date(), "yyyy-MM-dd"),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create inspection." };
  }
  revalidatePath("/inspections");
  revalidatePath(`/properties/${property_id}`);
  return { ok: true, id: data.id };
}

interface ItemInput {
  area_key: string;
  area_label: string;
  result: InspectionItemResult;
  notes?: string;
  media: { storage_path: string; caption?: string }[];
}

/**
 * Record a completed routine inspection: writes one row per checklist item
 * (snapshotting the label), attaches the uploaded photos, and stamps the
 * inspection complete. Re-running replaces prior items/media so a re-submit is
 * idempotent.
 */
export async function completeInspection(params: {
  inspection_id: string;
  overall_notes?: string;
  items: ItemInput[];
}) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("property_inspections")
    .select("id, template_id")
    .eq("org_id", ctx.org.id)
    .eq("id", params.inspection_id)
    .maybeSingle();
  if (!existing) return { error: "Inspection not found." };

  // Build the photo requirement per checklist item from the template (or a
  // sensible default when there's no template). Enforced server-side so the
  // requirement can't be bypassed by a tampered client.
  const requirement = new Map<string, { required: boolean; min: number }>();
  if (existing.template_id) {
    const { data: templateItems } = await supabase
      .from("inspection_template_items")
      .select("id, photo_required, min_photos")
      .eq("template_id", existing.template_id);
    for (const t of templateItems ?? []) {
      requirement.set(t.id as string, {
        required: !!t.photo_required,
        min: (t.min_photos as number) ?? 0,
      });
    }
  }

  for (const item of params.items) {
    const req =
      requirement.get(item.area_key) ??
      // No template → default: at least one photo unless marked N/A.
      { required: !existing.template_id, min: existing.template_id ? 0 : 1 };
    const needed = req.required ? Math.max(1, req.min) : 0;
    if (item.result !== "na" && needed > 0 && item.media.length < needed) {
      return {
        error: `“${item.area_label}” needs ${needed} photo${
          needed === 1 ? "" : "s"
        } before it can be completed.`,
      };
    }
  }

  await supabase
    .from("property_inspection_items")
    .delete()
    .eq("inspection_id", params.inspection_id);

  for (const item of params.items) {
    const req = requirement.get(item.area_key) ?? {
      required: !existing.template_id,
      min: existing.template_id ? 0 : 1,
    };
    const { data: itemRow, error: itemError } = await supabase
      .from("property_inspection_items")
      .insert({
        org_id: ctx.org.id,
        inspection_id: params.inspection_id,
        area_key: item.area_key,
        area_label: item.area_label,
        result: item.result,
        notes: item.notes || null,
        photo_required: req.required,
        min_photos: req.required ? Math.max(1, req.min) : 0,
      })
      .select("id")
      .single();
    if (itemError || !itemRow) {
      return { error: itemError?.message ?? "Could not save checklist item." };
    }

    if (item.media.length > 0) {
      const { error: mediaError } = await supabase
        .from("property_inspection_media")
        .insert(
          item.media.map((m) => ({
            org_id: ctx.org.id,
            inspection_id: params.inspection_id,
            item_id: itemRow.id,
            storage_path: m.storage_path,
            caption: m.caption || null,
          })),
        );
      if (mediaError) return { error: mediaError.message };
    }
  }

  const { error: completeError } = await supabase
    .from("property_inspections")
    .update({
      completed_at: new Date().toISOString(),
      completed_by: ctx.userId,
      overall_notes: params.overall_notes || null,
    })
    .eq("org_id", ctx.org.id)
    .eq("id", params.inspection_id);

  if (completeError) return { error: completeError.message };

  revalidatePath(`/inspections/${params.inspection_id}`);
  revalidatePath("/inspections");
  revalidatePath("/dashboard");
  return { ok: true };
}
