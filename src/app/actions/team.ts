"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  full_name: z.string().optional(),
  role: z.enum(["owner", "manager"]).default("manager"),
});

/**
 * Add a property manager (or co-owner) to the organization. Only owners may do
 * this. Three paths:
 *   1. The email already has an account → just link it to the org.
 *   2. New email + SMTP configured → send a proper Supabase invite email so the
 *      person can set a password and log in.
 *   3. New email + no SMTP (fresh project) → create a confirmed account with a
 *      random password and link it, so the member shows up immediately for
 *      tracking/assignment. They can set a password later via "forgot password"
 *      (once SMTP is configured).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY.
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

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "Adding members requires SUPABASE_SERVICE_ROLE_KEY to be set in your environment.",
    };
  }

  const admin = createAdminClient();

  // 1. Already has an account?
  let userId: string | null = null;
  let message = "Member added.";
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    userId = existing.id as string;
    message = "Existing user linked to your organization.";
  } else {
    // 2. Try a real invite email (works once SMTP is configured).
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`;
    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name },
        redirectTo,
      });

    if (!inviteError && invited?.user) {
      userId = invited.user.id;
      message = "Invitation email sent.";
    } else {
      // 3. No SMTP — create a confirmed account directly so they're usable now.
      const tempPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const { data: created, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name },
        });

      if (createError || !created?.user) {
        return {
          error:
            createError?.message ??
            inviteError?.message ??
            "Could not add member.",
        };
      }
      userId = created.user.id;
      message =
        "Member added. (No email was sent — configure SMTP in Supabase to send real invites; until then they can sign in via password reset.)";
    }
  }

  // Link to the org.
  const { error: linkError } = await admin
    .from("org_members")
    .upsert(
      { org_id: ctx.org.id, user_id: userId, role },
      { onConflict: "org_id,user_id" },
    );

  if (linkError) return { error: linkError.message };

  // Ensure a profile row exists (the auth trigger normally handles this, but
  // be defensive so the member renders with a name/email immediately).
  await admin
    .from("profiles")
    .upsert(
      { id: userId, email, full_name: full_name || email },
      { onConflict: "id" },
    );

  await createClient();
  revalidatePath("/team");
  return { ok: true, message };
}
