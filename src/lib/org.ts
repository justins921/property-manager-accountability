import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { MemberRole, Organization } from "./types";

export interface OrgContext {
  userId: string;
  email: string;
  fullName: string | null;
  org: Organization;
  role: MemberRole;
}

/**
 * Resolve the signed-in user's active organization and role.
 *
 * v1 assumes one organization per user (the first membership). Users with no
 * membership are sent to onboarding to create or be invited to one. Pass
 * `optional: true` to get null instead of redirecting (used by onboarding).
 */
export async function getOrgContext(
  optional = false,
): Promise<OrgContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (optional) return null;
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("org_members")
    .select("role, organizations(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership || !membership.organizations) {
    if (optional) return null;
    redirect("/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    org: membership.organizations as unknown as Organization,
    role: membership.role as MemberRole,
  };
}

/** Like getOrgContext but never returns null. */
export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getOrgContext(false);
  return ctx!;
}
