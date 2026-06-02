import { getReadClient } from "./data-client";
import type {
  Building,
  DelayExplanation,
  Inspection,
  InspectionMedia,
  InspectionSchedule,
  InspectionTemplate,
  InspectionTemplateItem,
  OrgMember,
  Profile,
  Property,
  PropertyInspection,
  PropertyInspectionItem,
  PropertyInspectionMedia,
  Reminder,
  Unit,
  Vacancy,
} from "./types";

/** Buildings of a property, each with its units, ordered. */
export async function getBuildingsWithUnits(
  orgId: string,
  propertyId: string,
): Promise<(Building & { units: Unit[] })[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("buildings")
    .select("*, units(*)")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .order("position");
  const buildings = (data as (Building & { units: Unit[] })[]) ?? [];
  for (const b of buildings) b.units.sort((a, c) => a.position - c.position);
  return buildings;
}

/** All vacancies in an org, newest first, with their property attached. */
export async function getVacancies(
  orgId: string,
): Promise<(Vacancy & { property: Property | null })[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("vacancies")
    .select("*, property:properties(*)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data as (Vacancy & { property: Property | null })[]) ?? [];
}

export async function getProperties(orgId: string): Promise<Property[]> {
  const supabase = await getReadClient();
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
  const supabase = await getReadClient();
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
  const supabase = await getReadClient();
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
  const supabase = await getReadClient();
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

// ── Routine inspections ────────────────────────────────────────────────────

export type InspectionRow = PropertyInspection & {
  property: Property | null;
  building: { name: string } | null;
  unit: { name: string } | null;
};

/** All routine inspections in an org, with property + target, newest due first. */
export async function getRoutineInspections(
  orgId: string,
): Promise<InspectionRow[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("property_inspections")
    .select(
      "*, property:properties(*), building:buildings(name), unit:units(name)",
    )
    .eq("org_id", orgId)
    .order("due_date", { ascending: false });
  return (data as InspectionRow[]) ?? [];
}

/** All routine-inspection items in an org (used for scorecard issue counts). */
export async function getInspectionItems(
  orgId: string,
): Promise<PropertyInspectionItem[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("property_inspection_items")
    .select("*")
    .eq("org_id", orgId);
  return (data as PropertyInspectionItem[]) ?? [];
}

export type ScheduleRow = InspectionSchedule & {
  template: InspectionTemplate | null;
  building: { name: string } | null;
  unit: { name: string } | null;
};

/** All schedules for a property, with their template + target attached. */
export async function getInspectionSchedules(
  orgId: string,
  propertyId: string,
): Promise<ScheduleRow[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("inspection_schedules")
    .select(
      "*, template:inspection_templates(*), building:buildings(name), unit:units(name)",
    )
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .order("created_at");
  return (data as ScheduleRow[]) ?? [];
}

/** All inspection templates in an org. */
export async function getTemplates(
  orgId: string,
): Promise<InspectionTemplate[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("inspection_templates")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at");
  return (data as InspectionTemplate[]) ?? [];
}

/** Templates with their checklist items, ordered. */
export async function getTemplatesWithItems(
  orgId: string,
): Promise<(InspectionTemplate & { items: InspectionTemplateItem[] })[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("inspection_templates")
    .select("*, items:inspection_template_items(*)")
    .eq("org_id", orgId)
    .order("created_at");
  const templates =
    (data as (InspectionTemplate & { items: InspectionTemplateItem[] })[]) ?? [];
  for (const t of templates) {
    t.items.sort((a, b) => a.position - b.position);
  }
  return templates;
}

/** A single template with its items. */
export async function getTemplate(
  orgId: string,
  id: string,
): Promise<(InspectionTemplate & { items: InspectionTemplateItem[] }) | null> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("inspection_templates")
    .select("*, items:inspection_template_items(*)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const template = data as InspectionTemplate & {
    items: InspectionTemplateItem[];
  };
  template.items.sort((a, b) => a.position - b.position);
  return template;
}

export interface RoutineInspectionDetail {
  inspection: PropertyInspection & {
    property: Property | null;
    building: { name: string } | null;
    unit: { name: string } | null;
  };
  manager: Profile | null;
  items: PropertyInspectionItem[];
  media: PropertyInspectionMedia[];
  /** Checklist areas to fill in (from the inspection's template, if any). */
  templateItems: InspectionTemplateItem[];
}

export async function getRoutineInspectionDetail(
  orgId: string,
  id: string,
): Promise<RoutineInspectionDetail | null> {
  const supabase = await getReadClient();
  const { data: inspection } = await supabase
    .from("property_inspections")
    .select(
      "*, property:properties(*), building:buildings(name), unit:units(name)",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!inspection) return null;

  const [{ data: items }, { data: media }] = await Promise.all([
    supabase
      .from("property_inspection_items")
      .select("*")
      .eq("inspection_id", id)
      .order("created_at"),
    supabase
      .from("property_inspection_media")
      .select("*")
      .eq("inspection_id", id),
  ]);

  const ins = inspection as PropertyInspection;

  let manager: Profile | null = null;
  if (ins.manager_id) {
    const { data: m } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", ins.manager_id)
      .maybeSingle();
    manager = (m as Profile) ?? null;
  }

  let templateItems: InspectionTemplateItem[] = [];
  if (ins.template_id) {
    const { data: ti } = await supabase
      .from("inspection_template_items")
      .select("*")
      .eq("template_id", ins.template_id)
      .order("position");
    templateItems = (ti as InspectionTemplateItem[]) ?? [];
  }

  return {
    inspection: inspection as RoutineInspectionDetail["inspection"],
    manager,
    items: (items as PropertyInspectionItem[]) ?? [],
    media: (media as PropertyInspectionMedia[]) ?? [],
    templateItems,
  };
}
