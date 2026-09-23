// ============================================================================
// Platform super-admin (operator) access.
//
// This is the ONLY place the tenant boundary is intentionally crossed. Admins
// are flagged with profiles.is_super_admin (plus the PLATFORM_ADMIN_EMAILS
// allowlist as a bootstrap fallback). Admins can browse any org read-only
// ("view as") and manage users + roles across orgs. Normal users remain fully
// isolated by RLS.
// ============================================================================

import { redirect } from "next/navigation";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type {
  MemberRole,
  Organization,
  PropertyInspection,
  Vacancy,
} from "./types";

/** Is this email on the env allowlist (bootstrap fallback)? Secure default: no. */
function isEnvAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * Is this user a platform super admin? True when `profiles.is_super_admin` is
 * set (the source of truth, only changeable with the service role) or the
 * email is on the PLATFORM_ADMIN_EMAILS allowlist.
 */
export async function isPlatformAdmin(
  user: { id: string; email?: string | null } | null | undefined,
): Promise<boolean> {
  if (!user) return false;
  if (isEnvAllowlisted(user.email)) return true;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const { data } = await createAdminClient()
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(data?.is_super_admin);
}

/** The signed-in user, if they're a platform admin; otherwise null. */
export async function getPlatformAdmin(): Promise<{
  userId: string;
  email: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isPlatformAdmin(user))) return null;
  return { userId: user.id, email: user.email ?? "" };
}

/** Guard for admin-only pages. Non-admins are bounced to their own dashboard. */
export async function requirePlatformAdmin() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");
  return admin;
}

export interface OrgSummary {
  org: Organization;
  members: number;
  activeVacancies: number;
  openInspections: number;
}

/** Every organization on the platform, with light activity counts. */
export async function adminListOrganizations(): Promise<OrgSummary[]> {
  const db = createAdminClient();
  const [{ data: orgs }, { data: members }, { data: vacancies }, { data: inspections }] =
    await Promise.all([
      db.from("organizations").select("*").order("created_at"),
      db.from("org_members").select("org_id"),
      db.from("vacancies").select("org_id, stage, closed_at"),
      db.from("property_inspections").select("org_id, completed_at"),
    ]);

  const countBy = (rows: { org_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.org_id, (m.get(r.org_id) ?? 0) + 1);
    return m;
  };

  const memberCounts = countBy(members as { org_id: string }[]);
  const vacancyCounts = new Map<string, number>();
  for (const v of (vacancies ?? []) as Pick<Vacancy, "org_id" | "stage" | "closed_at">[]) {
    if (v.stage !== "completed" && !v.closed_at) {
      vacancyCounts.set(v.org_id, (vacancyCounts.get(v.org_id) ?? 0) + 1);
    }
  }
  const inspectionCounts = new Map<string, number>();
  for (const i of (inspections ?? []) as Pick<
    PropertyInspection,
    "org_id" | "completed_at"
  >[]) {
    if (!i.completed_at) {
      inspectionCounts.set(i.org_id, (inspectionCounts.get(i.org_id) ?? 0) + 1);
    }
  }

  return ((orgs as Organization[]) ?? []).map((org) => ({
    org,
    members: memberCounts.get(org.id) ?? 0,
    activeVacancies: vacancyCounts.get(org.id) ?? 0,
    openInspections: inspectionCounts.get(org.id) ?? 0,
  }));
}

export interface PlatformUser {
  id: string;
  email: string | null;
  full_name: string | null;
  is_super_admin: boolean;
  created_at: string;
  memberships: { org_id: string; org_name: string; role: MemberRole }[];
}

/** Every user on the platform with their org memberships. */
export async function adminListUsers(): Promise<PlatformUser[]> {
  const db = createAdminClient();
  const [{ data: profiles }, { data: members }, { data: orgs }] =
    await Promise.all([
      db
        .from("profiles")
        .select("id, email, full_name, is_super_admin, created_at")
        .order("created_at"),
      db.from("org_members").select("org_id, user_id, role"),
      db.from("organizations").select("id, name"),
    ]);

  const orgName = new Map(
    ((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]),
  );
  const byUser = new Map<string, PlatformUser["memberships"]>();
  for (const m of (members ?? []) as {
    org_id: string;
    user_id: string;
    role: MemberRole;
  }[]) {
    const list = byUser.get(m.user_id) ?? [];
    list.push({
      org_id: m.org_id,
      org_name: orgName.get(m.org_id) ?? "Unknown org",
      role: m.role,
    });
    byUser.set(m.user_id, list);
  }

  return (
    (profiles ?? []) as Omit<PlatformUser, "memberships">[]
  ).map((p) => ({ ...p, memberships: byUser.get(p.id) ?? [] }));
}
