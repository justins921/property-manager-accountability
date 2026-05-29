"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  full_name: z.string().optional(),
  role: z.enum(["owner", "manager"]).default("manager"),
});

/**
 * Invite (or attach) a property manager to the owner's organization.
 * Only owners may do this. If the email is new, an invite email is sent via
 * Supabase Auth; if the user already exists they're simply linked.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to be configured.
 */
export async function inviteManager(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.role !== "owner") {
    return { error: "Only owners can invite team members." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { email, full_name, role } = parsed.data;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "Inviting users requires SUPABASE_SERVICE_ROLE_KEY to be configured.",
    };
  }

  const admin = createAdminClient();

  // Try to find an existing user by email.
  let userId: string | null = null;
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    userId = existing.id as string;
  } else {
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo,
    });
    if (error || !data.user) {
      return { error: error?.message ?? "Could not send invite." };
    }
    userId = data.user.id;
  }

  // Link to the org (RLS bypassed via admin, so re-check ownership above held).
  const { error: linkError } = await admin
    .from("org_members")
    .upsert(
      { org_id: ctx.org.id, user_id: userId, role },
      { onConflict: "org_id,user_id" },
    );

  if (linkError) return { error: linkError.message };

  // Touch the user's own server client so cache invalidation runs under RLS.
  await createClient();
  revalidatePath("/team");
  return { ok: true };
}
