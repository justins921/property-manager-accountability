// Domain & database types for the property management platform.
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
  /** Linked unit (leasing.sql). Older rows may only have unit_number. */
  unit_id: string | null;
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

export type TemplateCategory = "interior" | "exterior" | "general";

export interface InspectionTemplate {
  id: string;
  org_id: string;
  name: string;
  frequency: InspectionFrequency;
  category: TemplateCategory;
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
  photo_required: boolean;
  min_photos: number;
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
  photo_required: boolean;
  min_photos: number;
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

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  interior: "Interior",
  exterior: "Exterior",
  general: "General",
};

// ── Leasing: tenants, leases, rent ledger (leasing.sql) ─────────────────────

export type LeaseStatus = "upcoming" | "active" | "ended" | "terminated";

export type LedgerEntryType =
  | "charge"
  | "payment"
  | "credit"
  | "late_fee"
  | "deposit";

export type PaymentMethod =
  | "cash"
  | "check"
  | "zelle"
  | "ach"
  | "money_order"
  | "other";

export interface Tenant {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Lease {
  id: string;
  org_id: string;
  property_id: string;
  unit_id: string;
  vacancy_id: string | null;
  start_date: string;
  end_date: string | null;
  monthly_rent: number;
  rent_due_day: number;
  security_deposit: number;
  late_fee_amount: number;
  late_fee_grace_days: number;
  billing_start_date: string;
  status: LeaseStatus;
  ended_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaseTenant {
  id: string;
  org_id: string;
  lease_id: string;
  tenant_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  org_id: string;
  lease_id: string;
  type: LedgerEntryType;
  amount: number;
  entry_date: string;
  memo: string | null;
  payment_method: PaymentMethod | null;
  reference: string | null;
  auto_key: string | null;
  created_by: string | null;
  created_at: string;
}

/** A lease with the things almost every page needs alongside it. */
export interface LeaseWithRelations extends Lease {
  unit: (Unit & { building: Building | null }) | null;
  property: Property | null;
  lease_tenants: (LeaseTenant & { tenant: Tenant | null })[];
}

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  ended: "Ended",
  terminated: "Terminated",
};

export const LEDGER_TYPE_LABELS: Record<LedgerEntryType, string> = {
  charge: "Charge",
  payment: "Payment",
  credit: "Credit",
  late_fee: "Late fee",
  deposit: "Deposit received",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  zelle: "Zelle",
  ach: "ACH / bank transfer",
  money_order: "Money order",
  other: "Other",
};

// ── Owner requests (two-way accountability) ────────────────────────────────

export type OwnerRequestType = "spending" | "decision" | "reimbursement";
export type OwnerRequestStatus = "pending" | "approved" | "declined" | "withdrawn";

export interface OwnerRequest {
  id: string;
  org_id: string;
  property_id: string | null;
  vacancy_id: string | null;
  type: OwnerRequestType;
  title: string;
  details: string | null;
  amount: number | null;
  due_by: string;
  status: OwnerRequestStatus;
  requested_by: string | null;
  created_at: string;
  responded_by: string | null;
  responded_at: string | null;
  response_note: string | null;
}

export const OWNER_REQUEST_TYPE_LABELS: Record<OwnerRequestType, string> = {
  spending: "Approve spending",
  decision: "Decision needed",
  reimbursement: "Reimbursement",
};

export const OWNER_REQUEST_STATUS_LABELS: Record<OwnerRequestStatus, string> = {
  pending: "Waiting on owner",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};
