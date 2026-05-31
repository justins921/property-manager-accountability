import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "./admin";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { MemberRole, Organization } from "./types";

/** Cookie that holds the org a platform admin is currently viewing as. */
export const ADMIN_VIEW_COOKIE = "admin_view_org";

/** Error returned by mutations attempted while in read-only admin-view mode. */
export const ADMIN_VIEW_READONLY =
  "You're viewing as a platform admin (read-only). Exit admin view to make changes.";

export interface OrgContext {
  userId: string;
  email: string;
  fullName: string | null;
  org: Organization;
  role: MemberRole;
  /** True when a platform admin is viewing this org read-only (not a member). */
  isAdminView: boolean;
}

/**
 * Resolve the active organization and role for the signed-in user.
 *
 * Normally this is the user's own org (first membership). If the user is a
 * platform admin and has an active "view as" cookie, it resolves to that org
 * instead (loaded with the service-role client, since the admin isn't a member)
 * and flags `isAdminView` so the UI can show a banner and block writes.
 *
 * Pass `optional: true` to get null instead of redirecting (used by onboarding).
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

  // Platform-admin "view as" override.
  const cookieStore = await cookies();
  const viewOrgId = cookieStore.get(ADMIN_VIEW_COOKIE)?.value;
  if (viewOrgId && isPlatformAdmin(user.email)) {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("*")
      .eq("id", viewOrgId)
      .maybeSingle();
    if (org) {
      return {
        userId: user.id,
        email: user.email ?? "",
        fullName: user.email ?? null,
        org: org as Organization,
        role: "owner",
        isAdminView: true,
      };
    }
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
    isAdminView: false,
  };
}

/** Like getOrgContext but never returns null. */
export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getOrgContext(false);
  return ctx!;
}
