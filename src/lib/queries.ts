import { createClient } from "./supabase/server";
import type {
  DelayExplanation,
  Inspection,
  InspectionMedia,
  OrgMember,
  Profile,
  Property,
  Reminder,
  Vacancy,
} from "./types";

/** All vacancies in an org, newest first, with their property attached. */
export async function getVacancies(
  orgId: string,
): Promise<(Vacancy & { property: Property | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vacancies")
    .select("*, property:properties(*)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data as (Vacancy & { property: Property | null })[]) ?? [];
}

export async function getProperties(orgId: string): Promise<Property[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("*")
    .eq("org_id", orgId)
    .order("name");
  return (data as Property[]) ?? [];
}

export async function getProperty(
  orgId: string,
  id: string,
): Promise<Property | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as Property) ?? null;
}

/** Members of an org with their profile (name/email) attached. */
export async function getMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members")
    .select("*, profile:profiles(*)")
    .eq("org_id", orgId)
    .order("created_at");
  return (data as OrgMember[]) ?? [];
}

/** A lookup of userId → profile for everyone in the org. */
export async function getProfileMap(
  orgId: string,
): Promise<Map<string, Profile>> {
  const members = await getMembers(orgId);
  const map = new Map<string, Profile>();
  for (const m of members) {
    if (m.profile) map.set(m.user_id, m.profile);
  }
  return map;
}

export interface VacancyDetail {
  vacancy: Vacancy & { property: Property | null };
  manager: Profile | null;
  inspections: (Inspection & { media: InspectionMedia[] })[];
  delays: DelayExplanation[];
  reminders: Reminder[];
}

export async function getVacancyDetail(
  orgId: string,
  id: string,
): Promise<VacancyDetail | null> {
  const supabase = await createClient();
  const { data: vacancy } = await supabase
    .from("vacancies")
    .select("*, property:properties(*)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (!vacancy) return null;

  const [{ data: inspections }, { data: delays }, { data: reminders }] =
    await Promise.all([
      supabase
        .from("inspections")
        .select("*, media:inspection_media(*)")
        .eq("vacancy_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("delay_explanations")
        .select("*")
        .eq("vacancy_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("reminders")
        .select("*")
        .eq("vacancy_id", id)
        .order("sent_at", { ascending: false }),
    ]);

  let manager: Profile | null = null;
  const v = vacancy as Vacancy;
  if (v.manager_id) {
    const { data: m } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", v.manager_id)
      .maybeSingle();
    manager = (m as Profile) ?? null;
  }

  return {
    vacancy: vacancy as Vacancy & { property: Property | null },
    manager,
    inspections:
      (inspections as (Inspection & { media: InspectionMedia[] })[]) ?? [],
    delays: (delays as DelayExplanation[]) ?? [],
    reminders: (reminders as Reminder[]) ?? [],
  };
}
