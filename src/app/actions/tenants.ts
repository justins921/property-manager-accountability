"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

const tenantSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required."),
  last_name: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().email("Enter a valid email.").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function clean(data: z.infer<typeof tenantSchema>) {
  return {
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email || null,
    phone: data.phone || null,
    notes: data.notes || null,
  };
}

/** Add a tenant. Owners and managers. */
export async function createTenant(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = tenantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .insert({ org_id: ctx.org.id, created_by: ctx.userId, ...clean(parsed.data) })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not add tenant." };

  revalidatePath("/tenants");
  return { ok: true, id: data.id as string };
}

/** Edit a tenant's contact details. Owners and managers. */
export async function updateTenant(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const id = String(formData.get("tenant_id") ?? "");
  const parsed = tenantSchema.safeParse(Object.fromEntries(formData));
  if (!id || !parsed.success) {
    return { error: parsed.error?.errors[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update(clean(parsed.data))
    .eq("org_id", ctx.org.id)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/tenants/${id}`);
  revalidatePath("/tenants");
  return { ok: true };
}

/**
 * Delete a tenant. Owners only, and only when they aren't on any lease —
 * delete the lease first so no ledger history is orphaned.
 */
export async function deleteTenant(tenantId: string) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") return { error: "Only owners can delete tenants." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("lease_tenants")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.org.id)
    .eq("tenant_id", tenantId);
  if (count && count > 0) {
    return {
      error: "This tenant is on a lease. Delete the lease first, then the tenant.",
    };
  }

  const { error } = await supabase
    .from("tenants")
    .delete()
    .eq("org_id", ctx.org.id)
    .eq("id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/tenants");
  redirect("/tenants");
}
