"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { WORK_ORDER_STATUSES, type WorkOrderStatus } from "@/lib/types";

// Work orders: New → Assigned → In progress → Done. The database enforces the
// order and stamps the time of each step (see supabase/work-orders.sql).

const createSchema = z.object({
  property_id: z.string().uuid("Pick a property."),
  unit_id: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(1, "Say what needs fixing.").max(200),
  description: z.string().trim().max(4000).optional(),
});

/** Create a work order. Owners and managers. Photos are attached after. */
export async function createWorkOrder(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_orders")
    .insert({
      org_id: ctx.org.id,
      property_id: input.property_id,
      unit_id: input.unit_id || null,
      title: input.title,
      description: input.description || null,
      source: "manager",
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the work order." };

  revalidatePath("/work-orders");
  revalidatePath(`/properties/${input.property_id}`);
  return { ok: true, id: data.id as string };
}

/** Attach photos already uploaded to the property-media bucket. */
export async function addWorkOrderMedia(workOrderId: string, paths: string[]) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const clean = paths.filter((p) => p.startsWith(`${ctx.org.id}/work-orders/`));
  if (clean.length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("work_order_media").insert(
    clean.map((storage_path) => ({
      org_id: ctx.org.id,
      work_order_id: workOrderId,
      storage_path,
    })),
  );
  if (error) return { error: error.message };
  revalidatePath(`/work-orders/${workOrderId}`);
  return { ok: true };
}

const advanceSchema = z.object({
  work_order_id: z.string().uuid(),
  vendor_name: z.string().trim().max(200).optional(),
  vendor_phone: z.string().trim().max(50).optional(),
  cost: z
    .union([z.literal(""), z.coerce.number().nonnegative().multipleOf(0.01)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  completed_on: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .optional()
    .transform((v) => v || null),
});

/**
 * Move a work order one step forward. Assigning needs a vendor; finishing can
 * record the cost and completion date (defaults to today).
 */
export async function advanceWorkOrder(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = advanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { data: wo } = await supabase
    .from("work_orders")
    .select("id, status, property_id, vendor_name")
    .eq("org_id", ctx.org.id)
    .eq("id", input.work_order_id)
    .maybeSingle();
  if (!wo) return { error: "Work order not found." };

  const current = wo.status as WorkOrderStatus;
  const next = WORK_ORDER_STATUSES[WORK_ORDER_STATUSES.indexOf(current) + 1];
  if (!next) return { error: "This work order is already done." };

  const update: Record<string, unknown> = { status: next };
  if (next === "assigned") {
    if (!input.vendor_name) return { error: "Enter the vendor's name." };
    update.vendor_name = input.vendor_name;
    update.vendor_phone = input.vendor_phone || null;
  }
  if (next === "done") {
    if (input.cost !== null) update.cost = input.cost;
    if (input.completed_on) update.completed_on = input.completed_on;
  }

  const { error } = await supabase
    .from("work_orders")
    .update(update)
    .eq("org_id", ctx.org.id)
    .eq("id", wo.id)
    .eq("status", current);
  if (error) return { error: error.message };

  revalidatePath(`/work-orders/${wo.id}`);
  revalidatePath("/work-orders");
  revalidatePath(`/properties/${wo.property_id}`);
  return { ok: true };
}

const detailsSchema = z.object({
  work_order_id: z.string().uuid(),
  vendor_name: z.string().trim().max(200).optional(),
  vendor_phone: z.string().trim().max(50).optional(),
  cost: z
    .union([z.literal(""), z.coerce.number().nonnegative().multipleOf(0.01)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

/** Fix the vendor or cost after the fact (doesn't change the status). */
export async function updateWorkOrderDetails(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { work_order_id, vendor_name, vendor_phone, cost } = parsed.data;

  const supabase = await createClient();
  const update: Record<string, unknown> = { cost };
  if (vendor_name) update.vendor_name = vendor_name;
  if (vendor_phone !== undefined) update.vendor_phone = vendor_phone || null;
  const { data, error } = await supabase
    .from("work_orders")
    .update(update)
    .eq("org_id", ctx.org.id)
    .eq("id", work_order_id)
    .select("property_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Work order not found." };
  revalidatePath(`/work-orders/${work_order_id}`);
  revalidatePath(`/properties/${data.property_id}`);
  return { ok: true, message: "Saved." };
}

/** Delete a work order and its photos. Owners only. */
export async function deleteWorkOrder(workOrderId: string) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") return { error: "Only owners can delete work orders." };

  const supabase = await createClient();
  const { data: media } = await supabase
    .from("work_order_media")
    .select("storage_path")
    .eq("work_order_id", workOrderId);
  const { error } = await supabase
    .from("work_orders")
    .delete()
    .eq("org_id", ctx.org.id)
    .eq("id", workOrderId);
  if (error) return { error: error.message };
  const paths = ((media ?? []) as { storage_path: string }[]).map((m) => m.storage_path);
  if (paths.length) await supabase.storage.from("property-media").remove(paths);

  revalidatePath("/work-orders");
  redirect("/work-orders");
}

/** Replace a unit's repair-request link (the old link stops working). */
export async function resetRepairLink(unitId: string) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .update({ maintenance_token: token })
    .eq("org_id", ctx.org.id)
    .eq("id", unitId);
  if (error) return { error: error.message };
  revalidatePath(`/units/${unitId}`);
  return { ok: true, message: "New link created. The old one no longer works." };
}
