"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates a new organization (an owner's portfolio) and makes the current
 * user its owner. This is the entry point for a brand-new customer.
 */
export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Organization name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name, created_by: user.id })
    .select()
    .single();

  if (orgError || !org) {
    return { error: orgError?.message ?? "Could not create organization." };
  }

  const { error: memberError } = await supabase.from("org_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    return { error: memberError.message };
  }

  redirect("/dashboard");
}
