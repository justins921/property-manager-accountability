import { getReadClient } from "./data-client";
import type {
  AutopayAttempt,
  Building,
  DelayExplanation,
  Inspection,
  InspectionMedia,
  InspectionSchedule,
  InspectionTemplate,
  InspectionTemplateItem,
  LeaseWithRelations,
  LedgerEntry,
  OrgMember,
  OwnerRequest,
  PaymentLink,
  Profile,
  Property,
  PropertyInspection,
  PropertyInspectionItem,
  PropertyInspectionMedia,
  Reminder,
  Tenant,
  Unit,
  Vacancy,
  WorkOrder,
  WorkOrderMedia,
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

// ── Leasing: tenants, leases, ledger ─────────────────────────────────────────

const LEASE_SELECT =
  "*, unit:units(*, building:buildings(*)), property:properties(*), lease_tenants(*, tenant:tenants(*))";

export type UnitRow = Unit & {
  building: Building | null;
  property: Property | null;
};

/** Every unit in the org with its building and property, in display order. */
export async function getUnits(orgId: string): Promise<UnitRow[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("units")
    .select("*, building:buildings(*), property:properties(*)")
    .eq("org_id", orgId);
  const units = (data as UnitRow[]) ?? [];
  return units.sort(
    (a, b) =>
      (a.property?.name ?? "").localeCompare(b.property?.name ?? "") ||
      (a.building?.position ?? 0) - (b.building?.position ?? 0) ||
      a.position - b.position,
  );
}

export async function getUnit(orgId: string, id: string): Promise<UnitRow | null> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("units")
    .select("*, building:buildings(*), property:properties(*)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as UnitRow) ?? null;
}

export async function getTenants(orgId: string): Promise<Tenant[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("tenants")
    .select("*")
    .eq("org_id", orgId)
    .order("last_name")
    .order("first_name");
  return (data as Tenant[]) ?? [];
}

export async function getTenant(orgId: string, id: string): Promise<Tenant | null> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("tenants")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as Tenant) ?? null;
}

/** Leases in the org, newest start first. Optionally narrowed. */
export async function getLeases(
  orgId: string,
  filter: { unitId?: string; vacancyId?: string; ids?: string[] } = {},
): Promise<LeaseWithRelations[]> {
  if (filter.ids && filter.ids.length === 0) return [];
  const supabase = await getReadClient();
  let query = supabase.from("leases").select(LEASE_SELECT).eq("org_id", orgId);
  if (filter.unitId) query = query.eq("unit_id", filter.unitId);
  if (filter.vacancyId) query = query.eq("vacancy_id", filter.vacancyId);
  if (filter.ids) query = query.in("id", filter.ids);
  const { data } = await query.order("start_date", { ascending: false });
  return (data as LeaseWithRelations[]) ?? [];
}

export async function getLease(
  orgId: string,
  id: string,
): Promise<LeaseWithRelations | null> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("leases")
    .select(LEASE_SELECT)
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as LeaseWithRelations) ?? null;
}

/** Every lease a tenant has been on. */
export async function getTenantLeases(
  orgId: string,
  tenantId: string,
): Promise<LeaseWithRelations[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("lease_tenants")
    .select("lease_id")
    .eq("org_id", orgId)
    .eq("tenant_id", tenantId);
  const ids = ((data as { lease_id: string }[]) ?? []).map((r) => r.lease_id);
  return getLeases(orgId, { ids });
}

/** Ledger entries, oldest first. Optionally for specific leases only. */
export async function getLedgerEntries(
  orgId: string,
  leaseIds?: string[],
): Promise<LedgerEntry[]> {
  if (leaseIds && leaseIds.length === 0) return [];
  const supabase = await getReadClient();
  let query = supabase.from("ledger_entries").select("*").eq("org_id", orgId);
  if (leaseIds) query = query.in("lease_id", leaseIds);
  const { data } = await query
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as LedgerEntry[]) ?? [];
}

/** Group ledger entries by lease id. */
export function entriesByLease(entries: LedgerEntry[]): Map<string, LedgerEntry[]> {
  const map = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const list = map.get(e.lease_id) ?? [];
    list.push(e);
    map.set(e.lease_id, list);
  }
  return map;
}

// ── Owner requests ──────────────────────────────────────────────────────────

export type OwnerRequestRow = OwnerRequest & { property: Property | null };

export async function getOwnerRequests(orgId: string): Promise<OwnerRequestRow[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("owner_requests")
    .select("*, property:properties(*)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data as OwnerRequestRow[]) ?? [];
}

// ── Online rent collection ──────────────────────────────────────────────────

export async function getPaymentLinks(
  orgId: string,
  leaseIds?: string[],
): Promise<PaymentLink[]> {
  if (leaseIds && leaseIds.length === 0) return [];
  const supabase = await getReadClient();
  let query = supabase.from("payment_links").select("*").eq("org_id", orgId);
  if (leaseIds) query = query.in("lease_id", leaseIds);
  const { data } = await query.order("created_at", { ascending: false });
  return (data as PaymentLink[]) ?? [];
}

export async function getAutopayAttempts(
  orgId: string,
  leaseIds?: string[],
): Promise<AutopayAttempt[]> {
  if (leaseIds && leaseIds.length === 0) return [];
  const supabase = await getReadClient();
  let query = supabase.from("autopay_attempts").select("*").eq("org_id", orgId);
  if (leaseIds) query = query.in("lease_id", leaseIds);
  const { data } = await query.order("created_at", { ascending: false });
  return (data as AutopayAttempt[]) ?? [];
}

/** Group any rows with a lease_id by lease. */
export function byLease<T extends { lease_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.lease_id) ?? [];
    list.push(r);
    map.set(r.lease_id, list);
  }
  return map;
}

// ── Work orders ────────────────────────────────────────────────────────────

export type WorkOrderRow = WorkOrder & {
  property: { name: string } | null;
  unit: { name: string; building: { name: string } | null } | null;
};

const WORK_ORDER_SELECT = "*, property:properties(name), unit:units(name, building:buildings(name))";

/** Work orders, newest first. Optionally for one property or unit. */
export async function getWorkOrders(
  orgId: string,
  filter: { propertyId?: string; unitId?: string } = {},
): Promise<WorkOrderRow[]> {
  const supabase = await getReadClient();
  let query = supabase.from("work_orders").select(WORK_ORDER_SELECT).eq("org_id", orgId);
  if (filter.propertyId) query = query.eq("property_id", filter.propertyId);
  if (filter.unitId) query = query.eq("unit_id", filter.unitId);
  const { data } = await query.order("created_at", { ascending: false });
  return (data as WorkOrderRow[]) ?? [];
}

export async function getWorkOrder(
  orgId: string,
  id: string,
): Promise<(WorkOrderRow & { media: WorkOrderMedia[] }) | null> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("work_orders")
    .select(`${WORK_ORDER_SELECT}, media:work_order_media(*)`)
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as WorkOrderRow & { media: WorkOrderMedia[] }) ?? null;
}

/** Vendor names already used in this org, for the assign form's suggestions. */
export async function getVendorSuggestions(
  orgId: string,
): Promise<{ name: string; phone: string | null }[]> {
  const supabase = await getReadClient();
  const { data } = await supabase
    .from("work_orders")
    .select("vendor_name, vendor_phone, updated_at")
    .eq("org_id", orgId)
    .not("vendor_name", "is", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  const seen = new Map<string, string | null>();
  for (const r of (data ?? []) as { vendor_name: string; vendor_phone: string | null }[]) {
    if (!seen.has(r.vendor_name)) seen.set(r.vendor_name, r.vendor_phone);
  }
  return Array.from(seen, ([name, phone]) => ({ name, phone }));
}
