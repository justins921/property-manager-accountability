"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates a new organization (an owner's portfolio) and makes the current
 * user its owner. This is the entry point for a brand-new customer.
 *
 * Bootstrapping a tenant is a chicken-and-egg under RLS — you can't pass the
 * `org_members` "is owner" check until the membership row exists. So we verify
 * the caller with getUser() (which validates their JWT) and then perform the
 * two inserts with the service-role client, exactly like the team-invite
 * action. Creating an org only ever for the *verified* caller, so there's no
 * privilege escalation.
 */
export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Organization name is required." };

  // Authenticate the caller against the auth server.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Prefer the service-role client for the bootstrap; fall back to the
  // user's RLS client if the key isn't configured (e.g. local dev).
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = hasServiceRole ? createAdminClient() : supabase;

  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();

  if (orgError || !org) {
    return {
      error:
        orgError?.message ??
        "Could not create organization. If this persists, confirm SUPABASE_SERVICE_ROLE_KEY is set.",
    };
  }

  const { error: memberError } = await db.from("org_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    // Roll back the orphaned org so the user can retry cleanly.
    await db.from("organizations").delete().eq("id", org.id);
    return { error: memberError.message };
  }

  redirect("/dashboard");
}
