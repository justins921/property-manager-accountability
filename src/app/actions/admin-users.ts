"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPlatformAdmin } from "@/lib/admin";
import { addUserToOrg } from "@/lib/membership";
import { createAdminClient } from "@/lib/supabase/admin";

// Platform super-admin user management: add anyone to any org, change roles,
// remove memberships. Every action re-checks super-admin status server-side.

const NOT_ADMIN = { error: "Only the platform super admin can do this." };

const addSchema = z.object({
  org_id: z.string().uuid("Pick an organization."),
  email: z.string().email("Enter a valid email."),
  full_name: z.string().optional(),
  role: z.enum(["owner", "manager"]).default("manager"),
});

export async function adminAddUserToOrg(formData: FormData) {
  if (!(await getPlatformAdmin())) return NOT_ADMIN;

  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { org_id, email, full_name, role } = parsed.data;

  const result = await addUserToOrg({
    orgId: org_id,
    email,
    fullName: full_name,
    role,
  });
  revalidatePath("/admin");
  return result;
}

const membershipSchema = z.object({
  org_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

/** Would this change leave the org with zero owners? */
async function isLastOwner(orgId: string, userId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner");
  const owners = (data ?? []) as { user_id: string }[];
  return owners.length === 1 && owners[0].user_id === userId;
}

export async function adminChangeRole(formData: FormData) {
  if (!(await getPlatformAdmin())) return NOT_ADMIN;

  const parsed = membershipSchema
    .extend({ role: z.enum(["owner", "manager"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const { org_id, user_id, role } = parsed.data;

  if (role === "manager" && (await isLastOwner(org_id, user_id))) {
    return { error: "Every organization needs at least one owner." };
  }

  const { error } = await createAdminClient()
    .from("org_members")
    .update({ role })
    .eq("org_id", org_id)
    .eq("user_id", user_id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}

export async function adminRemoveFromOrg(formData: FormData) {
  if (!(await getPlatformAdmin())) return NOT_ADMIN;

  const parsed = membershipSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const { org_id, user_id } = parsed.data;

  if (await isLastOwner(org_id, user_id)) {
    return { error: "Every organization needs at least one owner." };
  }

  const { error } = await createAdminClient()
    .from("org_members")
    .delete()
    .eq("org_id", org_id)
    .eq("user_id", user_id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
