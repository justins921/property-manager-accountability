"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

function ownerGuard(ctx: { role: string; isAdminView: boolean }) {
  if (ctx.isAdminView) return ADMIN_VIEW_READONLY;
  if (ctx.role !== "owner") return "Only owners can edit property structure.";
  return null;
}

const buildingSchema = z.object({
  property_id: z.string().uuid(),
  name: z.string().min(1, "Building name is required."),
});

export async function addBuilding(formData: FormData) {
  const ctx = await requireOrgContext();
  const guard = ownerGuard(ctx);
  if (guard) return { error: guard };

  const parsed = buildingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { property_id, name } = parsed.data;

  const supabase = await createClient();
  const { count } = await supabase
    .from("buildings")
    .select("id", { count: "exact", head: true })
    .eq("property_id", property_id);

  const { error } = await supabase.from("buildings").insert({
    org_id: ctx.org.id,
    property_id,
    name: name.trim(),
    position: count ?? 0,
  });
  if (error) return { error: error.message };
  revalidatePath(`/properties/${property_id}`);
  return { ok: true };
}

const unitsSchema = z.object({
  property_id: z.string().uuid(),
  building_id: z.string().uuid(),
  prefix: z.string().optional(),
  start: z.coerce.number().int().min(0).default(1),
  count: z.coerce.number().int().min(1).max(200),
});

/** Bulk-add N units to a building, named `${prefix}${start..start+N-1}`. */
export async function addUnits(formData: FormData) {
  const ctx = await requireOrgContext();
  const guard = ownerGuard(ctx);
  if (guard) return { error: guard };

  const parsed = unitsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { property_id, building_id, prefix, start, count } = parsed.data;

  const supabase = await createClient();
  const { count: existing } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("building_id", building_id);

  const base = existing ?? 0;
  const label = (prefix ?? "").trim();
  const rows = Array.from({ length: count }, (_, i) => ({
    org_id: ctx.org.id,
    property_id,
    building_id,
    name: `${label ? `${label} ` : ""}${start + i}`.trim(),
    position: base + i,
  }));

  const { error } = await supabase.from("units").insert(rows);
  if (error) return { error: error.message };
  revalidatePath(`/properties/${property_id}`);
  return { ok: true };
}

/** One-click single-family setup: one building + one unit. */
export async function setupSingleFamily(formData: FormData) {
  const ctx = await requireOrgContext();
  const guard = ownerGuard(ctx);
  if (guard) return { error: guard };

  const property_id = String(formData.get("property_id") ?? "");
  if (!property_id) return { error: "Missing property." };

  const supabase = await createClient();
  const { data: building, error: bErr } = await supabase
    .from("buildings")
    .insert({ org_id: ctx.org.id, property_id, name: "Main building", position: 0 })
    .select("id")
    .single();
  if (bErr || !building) {
    return { error: bErr?.message ?? "Could not create building." };
  }

  const { error: uErr } = await supabase.from("units").insert({
    org_id: ctx.org.id,
    property_id,
    building_id: building.id,
    name: "Unit 1",
    position: 0,
  });
  if (uErr) return { error: uErr.message };

  revalidatePath(`/properties/${property_id}`);
  return { ok: true };
}

export async function deleteBuilding(id: string, propertyId: string) {
  const ctx = await requireOrgContext();
  const guard = ownerGuard(ctx);
  if (guard) return { error: guard };
  const supabase = await createClient();
  const { error } = await supabase
    .from("buildings")
    .delete()
    .eq("org_id", ctx.org.id)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

export async function deleteUnit(id: string, propertyId: string) {
  const ctx = await requireOrgContext();
  const guard = ownerGuard(ctx);
  if (guard) return { error: guard };
  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .delete()
    .eq("org_id", ctx.org.id)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}
