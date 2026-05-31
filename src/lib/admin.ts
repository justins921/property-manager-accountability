// ============================================================================
// Platform super-admin (operator) access.
//
// This is the ONLY place the tenant boundary is intentionally crossed. Admins
// are an explicit email allowlist (PLATFORM_ADMIN_EMAILS, server-only). All
// reads here use the service-role client and are READ-ONLY — no mutations are
// exposed through the admin surface. Normal users remain fully isolated by RLS.
// ============================================================================

import { redirect } from "next/navigation";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { Organization, PropertyInspection, Vacancy } from "./types";

/** Is this email on the platform-admin allowlist? Secure default: no. */
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
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
  if (!user || !isPlatformAdmin(user.email)) return null;
  return { userId: user.id, email: user.email! };
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
