// Domain & database types for the Property Manager Accountability Platform.
// These mirror supabase/schema.sql. If you regenerate types with the Supabase
// CLI you can replace these, but hand-maintained types keep the app readable.

export type MemberRole = "owner" | "manager";

export type VacancyStage =
  | "created"
  | "inspected"
  | "make_ready"
  | "ready"
  | "listed"
  | "application"
  | "leased"
  | "completed";

export type InspectionType = "move_out" | "ready_for_market";
export type MediaType = "video" | "photo";
export type DeadlineType = "make_ready" | "listing" | "lease_signing" | "move_in";

export type DelayReason =
  | "waiting_contractor"
  | "waiting_materials"
  | "waiting_owner_approval"
  | "leasing_issue"
  | "market_conditions"
  | "tenant_delay"
  | "other";

export type ReminderType =
  | "pre_deadline"
  | "deadline_day"
  | "overdue_3"
  | "overdue_7"
  | "overdue_14";

/** Traffic-light status derived from the next open deadline. */
export type VacancyStatus = "green" | "yellow" | "red";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
  profile?: Profile;
}

export interface Property {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  manager_id: string | null;
  created_at: string;
}

export interface Vacancy {
  id: string;
  org_id: string;
  property_id: string;
  manager_id: string | null;
  unit_number: string;
  monthly_rent: number;

  move_out_date: string;
  expected_make_ready_date: string;
  expected_listing_date: string;
  expected_lease_signing_date: string;
  expected_move_in_date: string;

  actual_make_ready_date: string | null;
  date_listed: string | null;
  date_applications_received: string | null;
  date_lease_signed: string | null;
  actual_move_in_date: string | null;

  stage: VacancyStage;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VacancyWithRelations extends Vacancy {
  property?: Property;
  manager?: Profile | null;
}

export interface Inspection {
  id: string;
  vacancy_id: string;
  org_id: string;
  type: InspectionType;
  damage_notes: string | null;
  estimated_turn_cost: number | null;
  completion_notes: string | null;
  created_by: string;
  created_at: string;
  media?: InspectionMedia[];
}

export interface InspectionMedia {
  id: string;
  inspection_id: string;
  org_id: string;
  media_type: MediaType;
  storage_path: string;
  caption: string | null;
  created_at: string;
}

export interface DelayExplanation {
  id: string;
  vacancy_id: string;
  org_id: string;
  deadline_type: DeadlineType;
  reason: DelayReason;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface Reminder {
  id: string;
  vacancy_id: string;
  org_id: string;
  reminder_type: ReminderType;
  deadline_type: DeadlineType;
  message: string;
  recipient_email: string | null;
  sent_at: string;
}

// ── Human-readable labels ────────────────────────────────────────────────

export const DELAY_REASON_LABELS: Record<DelayReason, string> = {
  waiting_contractor: "Waiting on Contractor",
  waiting_materials: "Waiting on Materials",
  waiting_owner_approval: "Waiting on Owner Approval",
  leasing_issue: "Leasing Issue",
  market_conditions: "Market Conditions",
  tenant_delay: "Tenant Delay",
  other: "Other",
};

export const DEADLINE_LABELS: Record<DeadlineType, string> = {
  make_ready: "Make-Ready Completion",
  listing: "Listing",
  lease_signing: "Lease Signing",
  move_in: "Move-In",
};

export const STAGE_LABELS: Record<VacancyStage, string> = {
  created: "Vacancy Created",
  inspected: "Move-Out Inspected",
  make_ready: "Make-Ready In Progress",
  ready: "Ready for Market",
  listed: "Listed",
  application: "Application Received",
  leased: "Leased",
  completed: "Completed",
};

// ── Routine property inspections (the upkeep accountability pillar) ────────

export type InspectionFrequency =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type InspectionItemResult = "pass" | "needs_attention" | "na";

export interface InspectionTemplate {
  id: string;
  org_id: string;
  name: string;
  frequency: InspectionFrequency;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InspectionTemplateItem {
  id: string;
  template_id: string;
  org_id: string;
  label: string;
  hint: string | null;
  position: number;
  created_at: string;
}

export interface Building {
  id: string;
  org_id: string;
  property_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Unit {
  id: string;
  org_id: string;
  property_id: string;
  building_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface InspectionSchedule {
  id: string;
  org_id: string;
  property_id: string;
  building_id: string | null;
  unit_id: string | null;
  template_id: string | null;
  manager_id: string | null;
  frequency: InspectionFrequency;
  anchor_date: string;
  next_due_date: string;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PropertyInspection {
  id: string;
  org_id: string;
  property_id: string;
  schedule_id: string | null;
  template_id: string | null;
  building_id: string | null;
  unit_id: string | null;
  manager_id: string | null;
  due_date: string;
  completed_at: string | null;
  completed_by: string | null;
  overall_notes: string | null;
  created_at: string;
}

export interface PropertyInspectionItem {
  id: string;
  org_id: string;
  inspection_id: string;
  area_key: string;
  area_label: string | null;
  result: InspectionItemResult;
  notes: string | null;
  created_at: string;
}

export interface PropertyInspectionMedia {
  id: string;
  org_id: string;
  inspection_id: string;
  item_id: string | null;
  storage_path: string;
  caption: string | null;
  created_at: string;
}

export const FREQUENCY_LABELS: Record<InspectionFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Every 6 months",
  annual: "Annually",
};

export const ITEM_RESULT_LABELS: Record<InspectionItemResult, string> = {
  pass: "Pass",
  needs_attention: "Needs attention",
  na: "N/A",
};
