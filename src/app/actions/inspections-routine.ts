"use server";

import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstDueOnOrAfter } from "@/lib/inspections-calc";
import { requireOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import type { InspectionFrequency, InspectionItemResult } from "@/lib/types";

const FREQUENCIES = [
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;

const scheduleSchema = z.object({
  property_id: z.string().uuid(),
  manager_id: z.string().uuid().optional().or(z.literal("")),
  frequency: z.enum(FREQUENCIES),
  anchor_date: z.string().min(1),
  active: z.union([z.literal("on"), z.literal("")]).optional(),
});

/**
 * Create or update the recurring inspection schedule for a property (owner
 * only). Recomputes the next due date from the anchor + cadence.
 */
export async function upsertSchedule(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.role !== "owner") {
    return { error: "Only owners can manage inspection schedules." };
  }

  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { property_id, manager_id, frequency, anchor_date, active } =
    parsed.data;

  const nextDue = format(
    firstDueOnOrAfter(anchor_date, frequency as InspectionFrequency),
    "yyyy-MM-dd",
  );

  const supabase = await createClient();
  const { error } = await supabase.from("inspection_schedules").upsert(
    {
      org_id: ctx.org.id,
      property_id,
      manager_id: manager_id || null,
      frequency,
      anchor_date,
      next_due_date: nextDue,
      active: active === "on",
      created_by: ctx.userId,
    },
    { onConflict: "property_id" },
  );

  if (error) return { error: error.message };
  revalidatePath(`/properties/${property_id}`);
  revalidatePath("/inspections");
  return { ok: true };
}

const adhocSchema = z.object({
  property_id: z.string().uuid(),
  manager_id: z.string().uuid().optional().or(z.literal("")),
  due_date: z.string().optional(),
});

/** Create a one-off routine inspection due now (or on a given date). */
export async function createAdHocInspection(formData: FormData) {
  const ctx = await requireOrgContext();
  const parsed = adhocSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { property_id, manager_id, due_date } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_inspections")
    .insert({
      org_id: ctx.org.id,
      property_id,
      manager_id: manager_id || null,
      due_date: due_date || format(new Date(), "yyyy-MM-dd"),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create inspection." };
  }
  revalidatePath("/inspections");
  return { ok: true, id: data.id };
}

interface ItemInput {
  area_key: string;
  result: InspectionItemResult;
  notes?: string;
  media: { storage_path: string; caption?: string }[];
}

/**
 * Record a completed routine inspection: writes one row per checklist item,
 * attaches the uploaded photos, and stamps the inspection complete. Re-running
 * replaces prior items/media so a re-submit is idempotent.
 */
export async function completeInspection(params: {
  inspection_id: string;
  overall_notes?: string;
  items: ItemInput[];
}) {
  const ctx = await requireOrgContext();
  const supabase = await createClient();

  // Verify the inspection belongs to this org.
  const { data: existing } = await supabase
    .from("property_inspections")
    .select("id")
    .eq("org_id", ctx.org.id)
    .eq("id", params.inspection_id)
    .maybeSingle();
  if (!existing) return { error: "Inspection not found." };

  // Clear any prior items (media cascades) so completion is idempotent.
  await supabase
    .from("property_inspection_items")
    .delete()
    .eq("inspection_id", params.inspection_id);

  for (const item of params.items) {
    const { data: itemRow, error: itemError } = await supabase
      .from("property_inspection_items")
      .insert({
        org_id: ctx.org.id,
        inspection_id: params.inspection_id,
        area_key: item.area_key,
        result: item.result,
        notes: item.notes || null,
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
