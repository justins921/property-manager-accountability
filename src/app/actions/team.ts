"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { addUserToOrg } from "@/lib/membership";

const schema = z.object({
  email: z.string().email(),
  full_name: z.string().optional(),
  role: z.enum(["owner", "manager"]).default("manager"),
});

/**
 * Add a property manager (or co-owner) to the organization. Only owners may do
 * this. Account creation / invite logic lives in `addUserToOrg`.
 */
export async function inviteManager(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") {
    return { error: "Only owners can invite team members." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { email, full_name, role } = parsed.data;

  const result = await addUserToOrg({
    orgId: ctx.org.id,
    email,
    fullName: full_name,
    role,
  });
  if ("error" in result) return { error: result.error };
  const message = result.message;

  revalidatePath("/team");
  return { ok: true, message };
}
