import { createAdminClient } from "./supabase/admin";
import type { MemberRole } from "./types";

/**
 * Add a person to an organization with a role, creating their account if
 * needed. Callers MUST authorize first (org owner, or platform super admin).
 *
 * Three paths:
 *   1. The email already has an account → just link it to the org.
 *   2. New email + SMTP configured → send a Supabase invite email so the
 *      person can set a password and log in.
 *   3. New email + no SMTP → create a confirmed account with a random password
 *      and link it. They can set a password later via "forgot password".
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY.
 */
export async function addUserToOrg(input: {
  orgId: string;
  email: string;
  fullName?: string;
  role: MemberRole;
}): Promise<{ ok: true; message: string } | { error: string }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "Adding members requires SUPABASE_SERVICE_ROLE_KEY to be set in your environment.",
    };
  }

  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName?.trim() || undefined;

  let userId: string | null = null;
  let message = "Member added.";

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    userId = existing.id as string;
    message = "Existing user linked to the organization.";
  } else {
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`;
    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo,
      });

    if (!inviteError && invited?.user) {
      userId = invited.user.id;
      message = "Invitation email sent.";
    } else {
      const tempPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const { data: created, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
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

  const { error: linkError } = await admin
    .from("org_members")
    .upsert(
      { org_id: input.orgId, user_id: userId, role: input.role },
      { onConflict: "org_id,user_id" },
    );
  if (linkError) return { error: linkError.message };

  // Ensure a profile row exists (the auth trigger normally handles this).
  await admin
    .from("profiles")
    .upsert(
      { id: userId, email, full_name: fullName || email },
      { onConflict: "id", ignoreDuplicates: true },
    );

  return { ok: true, message };
}
