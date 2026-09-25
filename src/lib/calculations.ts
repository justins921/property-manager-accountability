// ============================================================================
// Core calculations: vacancy accountability, the rent ledger, and both
// sides of the scorecard.
//
// Everything here is a pure function so it can be unit-tested and reused on
// both the server (cron reminders, dashboards) and the client. Dates are
// handled as calendar days to avoid timezone drift — a vacancy that became
// vacant "on the 1st" is the same number of days vacant regardless of where
// the viewer is sitting.
// ============================================================================

import {
  addDays,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
} from "date-fns";
import type {
  DeadlineType,
  Lease,
  LedgerEntry,
  LedgerEntryType,
  OwnerRequest,
  ReminderType,
  Vacancy,
  VacancyStage,
  VacancyStatus,
} from "./types";

/** Stages in lifecycle order; index doubles as a comparable rank. */
export const STAGE_ORDER: VacancyStage[] = [
  "created",
  "inspected",
  "make_ready",
  "ready",
  "listed",
  "application",
  "leased",
  "completed",
];

export function stageRank(stage: VacancyStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * Derive the lifecycle stage from the recorded actual dates. Returns the
 * furthest stage implied by the milestones that have actually happened.
 * (Inspection-only stages like "inspected"/"make_ready" are layered on top
 * by the inspection actions, which compare ranks before downgrading.)
 */
export function deriveStageFromDates(v: Vacancy): VacancyStage {
  if (v.actual_move_in_date) return "completed";
  if (v.date_lease_signed) return "leased";
  if (v.date_applications_received) return "application";
  if (v.date_listed) return "listed";
  if (v.actual_make_ready_date) return "ready";
  return "created";
}

/** Days in a yearly rent cycle, used to convert monthly rent to a daily rate. */
const DAYS_PER_YEAR = 365;

/** A vacancy is YELLOW when its next deadline is this many days out (or fewer). */
export const YELLOW_WINDOW_DAYS = 2;

/** Parse a 'YYYY-MM-DD' string into a local-midnight Date (no TZ surprises). */
export function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Daily rent loss = (monthly rent × 12) ÷ 365. */
export function dailyRentLoss(monthlyRent: number): number {
  return (monthlyRent * 12) / DAYS_PER_YEAR;
}

/**
 * Number of days a unit has been (or was) vacant.
 * Counts from move-out until the actual move-in, or until `asOf` if still vacant.
 * Never negative.
 */
export function daysVacant(vacancy: Vacancy, asOf: Date = new Date()): number {
  const start = parseDate(vacancy.move_out_date);
  const end = vacancy.actual_move_in_date
    ? parseDate(vacancy.actual_move_in_date)
    : asOf;
  return Math.max(0, differenceInCalendarDays(end, start));
}

/** Total dollars lost to this vacancy as of `asOf` (or final, if moved in). */
export function vacancyCost(vacancy: Vacancy, asOf: Date = new Date()): number {
  return dailyRentLoss(vacancy.monthly_rent) * daysVacant(vacancy, asOf);
}

/**
 * Turn time = move-out → make-ready completion, in days.
 * Returns null until the make-ready is actually completed.
 */
export function turnTime(vacancy: Vacancy): number | null {
  if (!vacancy.actual_make_ready_date) return null;
  return Math.max(
    0,
    differenceInCalendarDays(
      parseDate(vacancy.actual_make_ready_date),
      parseDate(vacancy.move_out_date),
    ),
  );
}

/** Leasing time = listed → lease signed, in days. Null until both are set. */
export function leasingTime(vacancy: Vacancy): number | null {
  if (!vacancy.date_listed || !vacancy.date_lease_signed) return null;
  return Math.max(
    0,
    differenceInCalendarDays(
      parseDate(vacancy.date_lease_signed),
      parseDate(vacancy.date_listed),
    ),
  );
}

interface DeadlineSlot {
  type: DeadlineType;
  /** The committed (expected) date. */
  expected: string;
  /** The actual date the milestone was hit, if any. */
  actual: string | null;
}

/** The four committed milestones, in chronological order. */
export function deadlineSlots(vacancy: Vacancy): DeadlineSlot[] {
  return [
    {
      type: "make_ready",
      expected: vacancy.expected_make_ready_date,
      actual: vacancy.actual_make_ready_date,
    },
    {
      type: "listing",
      expected: vacancy.expected_listing_date,
      actual: vacancy.date_listed,
    },
    {
      type: "lease_signing",
      expected: vacancy.expected_lease_signing_date,
      actual: vacancy.date_lease_signed,
    },
    {
      type: "move_in",
      expected: vacancy.expected_move_in_date,
      actual: vacancy.actual_move_in_date,
    },
  ];
}

export interface NextDeadline {
  type: DeadlineType;
  date: Date;
  /** Days until the deadline; negative means overdue. */
  daysUntil: number;
}

/**
 * The next still-open committed milestone (earliest expected date that has no
 * actual date yet). Returns null when every milestone has been completed.
 */
export function nextDeadline(
  vacancy: Vacancy,
  asOf: Date = new Date(),
): NextDeadline | null {
  const open = deadlineSlots(vacancy)
    .filter((slot) => !slot.actual)
    .sort(
      (a, b) =>
        parseDate(a.expected).getTime() - parseDate(b.expected).getTime(),
    );

  if (open.length === 0) return null;

  const slot = open[0];
  const date = parseDate(slot.expected);
  return {
    type: slot.type,
    date,
    daysUntil: differenceInCalendarDays(date, asOf),
  };
}

/**
 * Traffic-light status for a vacancy.
 *   GREEN  — on track (or fully completed)
 *   YELLOW — next deadline is within the warning window
 *   RED    — a deadline has been missed
 */
export function vacancyStatus(
  vacancy: Vacancy,
  asOf: Date = new Date(),
): VacancyStatus {
  if (vacancy.stage === "completed" || vacancy.closed_at) return "green";

  const next = nextDeadline(vacancy, asOf);
  if (!next) return "green";

  if (next.daysUntil < 0) return "red";
  if (next.daysUntil <= YELLOW_WINDOW_DAYS) return "yellow";
  return "green";
}

/** Whether a completed milestone was hit on or before its committed date. */
export function deadlineMetOnTime(slot: DeadlineSlot): boolean | null {
  if (!slot.actual) return null;
  return (
    differenceInCalendarDays(parseDate(slot.actual), parseDate(slot.expected)) <=
    0
  );
}

/** Count of committed milestones that were missed (completed late OR overdue now). */
export function missedDeadlines(
  vacancy: Vacancy,
  asOf: Date = new Date(),
): number {
  return deadlineSlots(vacancy).reduce((count, slot) => {
    if (slot.actual) {
      // Completed — missed if it landed after the committed date.
      return count + (deadlineMetOnTime(slot) === false ? 1 : 0);
    }
    // Still open — missed if the committed date is already in the past.
    return (
      count +
      (differenceInCalendarDays(parseDate(slot.expected), asOf) < 0 ? 1 : 0)
    );
  }, 0);
}

/**
 * Given the next open deadline, decide which reminder (if any) is due today.
 * Mirrors the spec's escalation ladder:
 *   1 day before → deadline day → 3 / 7 / 14 days overdue.
 * Returns null when no reminder should fire for this exact day offset.
 */
export function dueReminder(
  next: NextDeadline,
): { type: ReminderType } | null {
  const type = reminderTypeForDaysUntil(next.daysUntil);
  return type ? { type } : null;
}

/**
 * The reminder rung that fires for a given days-until value (negative = days
 * overdue). Shared by vacancy deadlines and routine-inspection due dates.
 */
export function reminderTypeForDaysUntil(
  daysUntil: number,
): ReminderType | null {
  const overdueBy = -daysUntil;
  switch (true) {
    case daysUntil === 1:
      return "pre_deadline";
    case daysUntil === 0:
      return "deadline_day";
    case overdueBy === 3:
      return "overdue_3";
    case overdueBy === 7:
      return "overdue_7";
    case overdueBy === 14:
      return "overdue_14";
    default:
      return null;
  }
}

/**
 * Dollars lost to this vacancy that fall within [rangeStart, rangeEnd].
 * Used for "vacancy cost this month / this year" rollups. The vacant interval
 * is [move_out, move_in or asOf]; we charge the daily rate for the overlap.
 */
export function vacancyCostInRange(
  vacancy: Vacancy,
  rangeStart: Date,
  rangeEnd: Date,
  asOf: Date = new Date(),
): number {
  const vacantStart = parseDate(vacancy.move_out_date);
  const vacantEnd = vacancy.actual_move_in_date
    ? parseDate(vacancy.actual_move_in_date)
    : asOf;

  const overlapStart = vacantStart > rangeStart ? vacantStart : rangeStart;
  const overlapEnd = vacantEnd < rangeEnd ? vacantEnd : rangeEnd;
  const overlapDays = differenceInCalendarDays(overlapEnd, overlapStart);
  if (overlapDays <= 0) return 0;
  return dailyRentLoss(vacancy.monthly_rent) * overlapDays;
}

// ── Aggregations: property manager scorecard & portfolio rollups ──────────

export interface ScorecardStats {
  managerId: string | null;
  totalVacancies: number;
  activeVacancies: number;
  avgTurnTime: number | null;
  avgDaysVacant: number | null;
  avgLeasingTime: number | null;
  onTimeCompletionPct: number | null;
  deadlinesMissed: number;
  vacancyCostCreated: number;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Build a scorecard for a single manager from their vacancies. */
export function buildScorecard(
  managerId: string | null,
  vacancies: Vacancy[],
  asOf: Date = new Date(),
): ScorecardStats {
  const turnTimes = vacancies
    .map((v) => turnTime(v))
    .filter((n): n is number => n !== null);

  const leasingTimes = vacancies
    .map((v) => leasingTime(v))
    .filter((n): n is number => n !== null);

  // Days vacant is averaged across completed vacancies for a stable metric.
  const completedDaysVacant = vacancies
    .filter((v) => v.actual_move_in_date)
    .map((v) => daysVacant(v, asOf));

  // On-time completion: of all completed milestones, how many landed on time.
  let metOnTime = 0;
  let completedMilestones = 0;
  for (const v of vacancies) {
    for (const slot of deadlineSlots(v)) {
      const met = deadlineMetOnTime(slot);
      if (met === null) continue;
      completedMilestones += 1;
      if (met) metOnTime += 1;
    }
  }

  return {
    managerId,
    totalVacancies: vacancies.length,
    activeVacancies: vacancies.filter(
      (v) => v.stage !== "completed" && !v.closed_at,
    ).length,
    avgTurnTime: average(turnTimes),
    avgDaysVacant: average(completedDaysVacant),
    avgLeasingTime: average(leasingTimes),
    onTimeCompletionPct:
      completedMilestones === 0
        ? null
        : (metOnTime / completedMilestones) * 100,
    deadlinesMissed: vacancies.reduce(
      (sum, v) => sum + missedDeadlines(v, asOf),
      0,
    ),
    vacancyCostCreated: vacancies.reduce(
      (sum, v) => sum + vacancyCost(v, asOf),
      0,
    ),
  };
}

/** Group vacancies by manager id and build a scorecard for each. */
export function buildScorecards(
  vacancies: Vacancy[],
  asOf: Date = new Date(),
): ScorecardStats[] {
  const byManager = new Map<string | null, Vacancy[]>();
  for (const v of vacancies) {
    const key = v.manager_id;
    const list = byManager.get(key) ?? [];
    list.push(v);
    byManager.set(key, list);
  }
  return Array.from(byManager.entries()).map(([managerId, list]) =>
    buildScorecard(managerId, list, asOf),
  );
}

// ── Rent ledger ─────────────────────────────────────────────────────────────
//
// Balances are never stored; they're always recomputed from ledger entries.
// All ledger math runs in integer cents so float rounding can't creep in.
// Dates are 'YYYY-MM-DD' strings, which compare correctly as plain strings.

/** Format a Date as a 'YYYY-MM-DD' calendar-day key (local time). */
export function dateKey(value: Date | string): string {
  return typeof value === "string" ? value.slice(0, 10) : format(value, "yyyy-MM-dd");
}

export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * How an entry moves the rent balance: charges and late fees raise what the
 * tenant owes, payments and credits lower it. Deposits are money held, not
 * rent, so they're tracked separately and don't touch the balance.
 */
export function ledgerSign(type: LedgerEntryType): 1 | -1 | 0 {
  if (type === "charge" || type === "late_fee") return 1;
  if (type === "payment" || type === "credit") return -1;
  return 0;
}

export type LedgerLike = Pick<
  LedgerEntry,
  "type" | "amount" | "entry_date" | "auto_key"
> &
  Partial<Pick<LedgerEntry, "id" | "created_at">>;

/**
 * What the tenant owes (positive) or has prepaid (negative). Pass `asOf` to
 * only count entries dated on or before that day.
 */
export function ledgerBalance(
  entries: LedgerLike[],
  asOf?: Date | string,
): number {
  const cutoff = asOf ? dateKey(asOf) : null;
  let cents = 0;
  for (const e of entries) {
    if (cutoff && e.entry_date > cutoff) continue;
    cents += ledgerSign(e.type) * toCents(e.amount);
  }
  return fromCents(cents);
}

/**
 * Balance that was due before `asOf` and is still unpaid: charges dated
 * before today, minus every payment and credit recorded through today.
 * Rent that falls due today isn't past due yet.
 */
export function pastDueBalance(entries: LedgerLike[], asOf: Date): number {
  const today = dateKey(asOf);
  let cents = 0;
  for (const e of entries) {
    const sign = ledgerSign(e.type);
    if (sign === 1 && e.entry_date < today) cents += toCents(e.amount);
    if (sign === -1 && e.entry_date <= today) cents -= toCents(e.amount);
  }
  return fromCents(Math.max(0, cents));
}

/** Total security deposit received so far. */
export function depositCollected(entries: LedgerLike[]): number {
  return fromCents(
    entries
      .filter((e) => e.type === "deposit")
      .reduce((sum, e) => sum + toCents(e.amount), 0),
  );
}

/** The due date for a given month: 'YYYY-MM-{dueDay}'. monthIndex is 0-based. */
export function dueDateFor(year: number, monthIndex: number, dueDay: number): string {
  return format(new Date(year, monthIndex, dueDay), "yyyy-MM-dd");
}

/** The first due date on or after `date` for a lease's rent_due_day. */
export function nextDueDateOnOrAfter(date: string, dueDay: number): string {
  const d = parseDate(date);
  const sameMonth = dueDateFor(d.getFullYear(), d.getMonth(), dueDay);
  if (sameMonth >= date) return sameMonth;
  return dueDateFor(d.getFullYear(), d.getMonth() + 1, dueDay);
}

export interface RentPeriod {
  /** 'YYYY-MM' — the month this rent is for. */
  period: string;
  /** 'YYYY-MM-DD' — the day it's due (and the day the charge posts). */
  dueDate: string;
}

type BillableLease = Pick<
  Lease,
  "start_date" | "billing_start_date" | "rent_due_day" | "ended_on" | "status"
>;

/**
 * Every rent charge a lease should have posted by `asOf`: one per month on
 * the due day, starting at the later of start_date and billing_start_date,
 * and stopping at ended_on. A lease past its end_date keeps billing
 * (holdover) until it's ended by hand.
 */
export function rentPeriodsDue(lease: BillableLease, asOf: Date): RentPeriod[] {
  if (lease.status === "upcoming") return [];
  const first =
    lease.billing_start_date > lease.start_date
      ? lease.billing_start_date
      : lease.start_date;
  const today = dateKey(asOf);
  const last = lease.ended_on && lease.ended_on < today ? lease.ended_on : today;
  if (first > last) return [];

  const periods: RentPeriod[] = [];
  const cursor = parseDate(first);
  let year = cursor.getFullYear();
  let month = cursor.getMonth();
  for (;;) {
    const dueDate = dueDateFor(year, month, lease.rent_due_day);
    if (dueDate > last) break;
    if (dueDate >= first) periods.push({ period: dueDate.slice(0, 7), dueDate });
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return periods;
}

/** The idempotency key the cron uses for a month's rent charge. */
export function rentAutoKey(period: string): string {
  return `rent:${period}`;
}

/** The idempotency key the cron uses for a month's late fee. */
export function lateFeeAutoKey(period: string): string {
  return `late:${period}`;
}

/**
 * Prorated rent for the days between move-in and the first full automatic
 * charge, using that month's actual day count. Zero when there's no gap.
 */
export function suggestedProration(
  monthlyRent: number,
  startDate: string,
  firstChargeDate: string,
): number {
  const days = differenceInCalendarDays(
    parseDate(firstChargeDate),
    parseDate(startDate),
  );
  if (days <= 0) return 0;
  const daysInMonth = getDaysInMonth(parseDate(startDate));
  const cents = Math.round((toCents(monthlyRent) * days) / daysInMonth);
  return fromCents(Math.min(cents, toCents(monthlyRent)));
}

function sortForAllocation<T extends LedgerLike>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      a.entry_date.localeCompare(b.entry_date) ||
      (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
      (a.id ?? "").localeCompare(b.id ?? ""),
  );
}

/**
 * Was `charge` fully covered by payments and credits dated on or before
 * `cutoff`? Payments apply to the oldest charges first, so a charge counts as
 * paid only once everything owed before it (and it) has been covered.
 */
export function chargePaidBy(
  entries: LedgerLike[],
  charge: LedgerLike,
  cutoff: string,
): boolean {
  const debits = sortForAllocation(entries.filter((e) => ledgerSign(e.type) === 1));
  const index = debits.indexOf(charge);
  if (index === -1) return false;
  const owedThrough = debits
    .slice(0, index + 1)
    .reduce((sum, e) => sum + toCents(e.amount), 0);
  const paid = entries
    .filter((e) => ledgerSign(e.type) === -1 && e.entry_date <= cutoff)
    .reduce((sum, e) => sum + toCents(e.amount), 0);
  return paid >= owedThrough;
}

export interface LateFeeDue {
  period: string;
  autoKey: string;
  /** The day after the grace period ends. */
  entryDate: string;
  amount: number;
}

type LateFeeLease = Pick<Lease, "late_fee_amount" | "late_fee_grace_days">;

/**
 * Late fees the cron should post by `asOf`. A month's rent that isn't fully
 * paid by the end of the grace period (due date + grace days) gets one flat
 * late fee, dated the next day. Only automatic rent charges trigger fees.
 */
export function lateFeesDue(
  lease: LateFeeLease,
  entries: LedgerLike[],
  asOf: Date,
): LateFeeDue[] {
  const amount = Number(lease.late_fee_amount);
  if (!(amount > 0)) return [];
  const today = dateKey(asOf);
  const posted = new Set(entries.map((e) => e.auto_key).filter(Boolean));

  const due: LateFeeDue[] = [];
  for (const charge of entries) {
    if (charge.type !== "charge" || !charge.auto_key?.startsWith("rent:")) continue;
    const period = charge.auto_key.slice("rent:".length);
    const autoKey = lateFeeAutoKey(period);
    if (posted.has(autoKey)) continue;
    const cutoff = dateKey(addDays(parseDate(charge.entry_date), lease.late_fee_grace_days));
    const entryDate = dateKey(addDays(parseDate(cutoff), 1));
    if (entryDate > today) continue;
    if (chargePaidBy(entries, charge, cutoff)) continue;
    due.push({ period, autoKey, entryDate, amount });
  }
  return due;
}

// ── Occupancy / lease display ───────────────────────────────────────────────

type OccupancyLease = Pick<Lease, "status" | "end_date">;

export type OccupancyLabel =
  | "Upcoming"
  | "Active"
  | "Month-to-month"
  | "Holdover"
  | "Ended"
  | "Terminated";

/** How a lease reads on the rent roll. Past its end date but still active = holdover. */
export function occupancyLabel(lease: OccupancyLease, asOf: Date): OccupancyLabel {
  if (lease.status === "upcoming") return "Upcoming";
  if (lease.status === "ended") return "Ended";
  if (lease.status === "terminated") return "Terminated";
  if (!lease.end_date) return "Month-to-month";
  if (lease.end_date < dateKey(asOf)) return "Holdover";
  return "Active";
}

/** Does this (active or upcoming) lease end within the next `days` days? */
export function leaseEndsWithin(
  lease: OccupancyLease,
  days: number,
  asOf: Date,
): boolean {
  if (lease.status !== "active" && lease.status !== "upcoming") return false;
  if (!lease.end_date) return false;
  const today = dateKey(asOf);
  const horizon = dateKey(addDays(asOf, days));
  return lease.end_date >= today && lease.end_date <= horizon;
}

// ── Rent collection (manager side of the scorecard) ─────────────────────────

export interface RentCollectionStats {
  managerId: string | null;
  leases: number;
  /** Automatic rent charges whose due date has passed. */
  rentCharges: number;
  paidOnTime: number;
  /** % of rent charges fully paid by their due date. */
  onTimePct: number | null;
  pastDueBalance: number;
}

/** Rent collection for one manager across the leases they're responsible for. */
export function buildRentCollection(
  managerId: string | null,
  leases: { entries: LedgerLike[] }[],
  asOf: Date,
): RentCollectionStats {
  const today = dateKey(asOf);
  let rentCharges = 0;
  let paidOnTime = 0;
  let pastDueCents = 0;
  for (const { entries } of leases) {
    for (const e of entries) {
      if (e.type !== "charge" || !e.auto_key?.startsWith("rent:")) continue;
      if (e.entry_date >= today) continue;
      rentCharges += 1;
      if (chargePaidBy(entries, e, e.entry_date)) paidOnTime += 1;
    }
    pastDueCents += toCents(pastDueBalance(entries, asOf));
  }
  return {
    managerId,
    leases: leases.length,
    rentCharges,
    paidOnTime,
    onTimePct: rentCharges === 0 ? null : (paidOnTime / rentCharges) * 100,
    pastDueBalance: fromCents(pastDueCents),
  };
}

/** Group leases by responsible manager and build rent collection for each. */
export function buildRentCollections(
  leases: { managerId: string | null; entries: LedgerLike[] }[],
  asOf: Date,
): RentCollectionStats[] {
  const byManager = new Map<string | null, { entries: LedgerLike[] }[]>();
  for (const l of leases) {
    const list = byManager.get(l.managerId) ?? [];
    list.push(l);
    byManager.set(l.managerId, list);
  }
  return Array.from(byManager.entries()).map(([managerId, list]) =>
    buildRentCollection(managerId, list, asOf),
  );
}

// ── Owner requests (owner side of the scorecard) ────────────────────────────

type RequestLike = Pick<
  OwnerRequest,
  "status" | "created_at" | "responded_at" | "responded_by" | "due_by"
>;

/** Hours from request to owner response; null while unanswered. */
export function responseHours(req: RequestLike): number | null {
  if (!req.responded_at) return null;
  const ms = new Date(req.responded_at).getTime() - new Date(req.created_at).getTime();
  return Math.max(0, ms / 3_600_000);
}

/**
 * Did the owner answer by the due-by date? Pending requests past due count
 * as late; pending requests not yet due and withdrawn ones don't count.
 */
export function answeredOnTime(req: RequestLike, asOf: Date): boolean | null {
  if (req.status === "withdrawn") return null;
  if (req.responded_at) return dateKey(new Date(req.responded_at)) <= req.due_by;
  return req.due_by < dateKey(asOf) ? false : null;
}

export interface OwnerScorecardStats {
  ownerId: string | null;
  total: number;
  answered: number;
  approved: number;
  declined: number;
  pending: number;
  overdue: number;
  avgResponseHours: number | null;
  onTimePct: number | null;
}

export function buildOwnerScorecard(
  ownerId: string | null,
  requests: RequestLike[],
  asOf: Date,
): OwnerScorecardStats {
  const counted = requests.filter((r) => r.status !== "withdrawn");
  const hours = counted
    .map((r) => responseHours(r))
    .filter((h): h is number => h !== null);
  const verdicts = counted
    .map((r) => answeredOnTime(r, asOf))
    .filter((v): v is boolean => v !== null);
  const today = dateKey(asOf);
  return {
    ownerId,
    total: counted.length,
    answered: hours.length,
    approved: counted.filter((r) => r.status === "approved").length,
    declined: counted.filter((r) => r.status === "declined").length,
    pending: counted.filter((r) => r.status === "pending").length,
    overdue: counted.filter((r) => r.status === "pending" && r.due_by < today).length,
    avgResponseHours: average(hours),
    onTimePct:
      verdicts.length === 0
        ? null
        : (verdicts.filter(Boolean).length / verdicts.length) * 100,
  };
}

/** One scorecard per owner who has answered requests (grouped by responder). */
export function buildOwnerScorecards(
  requests: RequestLike[],
  asOf: Date,
): OwnerScorecardStats[] {
  const byOwner = new Map<string, RequestLike[]>();
  for (const r of requests) {
    if (!r.responded_by) continue;
    const list = byOwner.get(r.responded_by) ?? [];
    list.push(r);
    byOwner.set(r.responded_by, list);
  }
  return Array.from(byOwner.entries()).map(([ownerId, list]) =>
    buildOwnerScorecard(ownerId, list, asOf),
  );
}

// ── Online rent collection: autopay, reminders, this month's status ─────────

/** Days between retries after a failed autopay charge. */
export const AUTOPAY_RETRY_DAYS = 3;
/** Total tries per month (first charge + retries). */
export const AUTOPAY_MAX_ATTEMPTS = 3;
/** Send the "rent is coming up" reminder this many days before the due date. */
export const RENT_REMINDER_DAYS_BEFORE = 3;
/** Stop sending a first missed-payment reminder this many days after due. */
const LATE_REMINDER_WINDOW_DAYS = 10;

export interface AutopayAttemptLike {
  period: string;
  attempt: number;
  status: "processing" | "succeeded" | "failed";
  attempted_on: string;
}

type AutopayLease = BillableLease &
  Pick<
    Lease,
    "autopay_enabled" | "autopay_payment_method_id" | "autopay_enabled_at"
  >;

/** The most recent rent period whose due date is on or before `asOf`. */
export function currentRentPeriod(
  lease: BillableLease,
  asOf: Date,
): RentPeriod | null {
  const periods = rentPeriodsDue(lease, asOf);
  return periods.length ? periods[periods.length - 1] : null;
}

export interface AutopayCharge {
  period: string;
  attempt: number;
  amount: number;
}

/**
 * Should the cron charge this lease's saved payment method today, and for
 * how much? Charges the balance owed on the due date, then retries a failed
 * charge every AUTOPAY_RETRY_DAYS days, up to AUTOPAY_MAX_ATTEMPTS in total.
 * Never charges a month whose due date came before the tenant turned autopay
 * on, and never while another payment is still processing.
 */
export function autopayChargeDue(
  lease: AutopayLease,
  entries: LedgerLike[],
  attempts: AutopayAttemptLike[],
  asOf: Date,
  opts: { paymentProcessing?: boolean } = {},
): AutopayCharge | null {
  if (lease.status !== "active" || !lease.autopay_enabled) return null;
  if (!lease.autopay_payment_method_id || !lease.autopay_enabled_at) return null;
  if (opts.paymentProcessing) return null;

  const current = currentRentPeriod(lease, asOf);
  if (!current) return null;
  if (current.dueDate < dateKey(new Date(lease.autopay_enabled_at))) return null;

  const tries = attempts
    .filter((a) => a.period === current.period)
    .sort((a, b) => a.attempt - b.attempt);
  if (tries.some((a) => a.status !== "failed")) return null;
  if (tries.length >= AUTOPAY_MAX_ATTEMPTS) return null;
  if (tries.length > 0) {
    const last = tries[tries.length - 1];
    const retryOn = dateKey(addDays(parseDate(last.attempted_on), AUTOPAY_RETRY_DAYS));
    if (dateKey(asOf) < retryOn) return null;
  }

  const owed = ledgerBalance(entries, asOf);
  if (owed <= 0) return null;
  return { period: current.period, attempt: tries.length + 1, amount: owed };
}

/** Did this month's autopay end in failure (all tries used, or the latest failed)? */
export function autopayState(
  attempts: AutopayAttemptLike[],
  period: string | null,
): "succeeded" | "processing" | "failed" | null {
  if (!period) return null;
  const tries = attempts
    .filter((a) => a.period === period)
    .sort((a, b) => a.attempt - b.attempt);
  if (tries.length === 0) return null;
  return tries[tries.length - 1].status;
}

export interface RentReminderDue {
  kind: "upcoming" | "late";
  period: string;
  dueDate: string;
  /** What the tenant owes: for "upcoming", today's balance plus the rent about to post. */
  amount: number;
}

type ReminderLease = BillableLease & Pick<Lease, "monthly_rent">;

/**
 * Which rent reminder (if any) to send today:
 *   - "upcoming": RENT_REMINDER_DAYS_BEFORE days (or fewer) before the due
 *     date, once per month, unless the tenant has already prepaid.
 *   - "late": from the day after the due date, once per month, when that
 *     month's rent wasn't paid by its due date and a balance is still owed.
 * `sent` holds the "<kind>:<period>" keys already sent for this lease.
 */
export function rentReminderDue(
  lease: ReminderLease,
  entries: LedgerLike[],
  sent: Set<string>,
  asOf: Date,
): RentReminderDue | null {
  if (lease.status !== "active") return null;
  const today = dateKey(asOf);

  const current = currentRentPeriod(lease, asOf);
  if (current && current.dueDate < today && !sent.has(`late:${current.period}`)) {
    const daysLate = differenceInCalendarDays(asOf, parseDate(current.dueDate));
    const charge = entries.find(
      (e) => e.type === "charge" && e.auto_key === rentAutoKey(current.period),
    );
    const owed = ledgerBalance(entries, asOf);
    if (
      daysLate <= LATE_REMINDER_WINDOW_DAYS &&
      charge &&
      !chargePaidBy(entries, charge, current.dueDate) &&
      owed > 0
    ) {
      return { kind: "late", period: current.period, dueDate: current.dueDate, amount: owed };
    }
  }

  const nextDue = nextDueDateOnOrAfter(
    dateKey(addDays(asOf, 1)),
    lease.rent_due_day,
  );
  const billingFrom =
    lease.billing_start_date > lease.start_date ? lease.billing_start_date : lease.start_date;
  const period = nextDue.slice(0, 7);
  const daysUntil = differenceInCalendarDays(parseDate(nextDue), asOf);
  if (
    nextDue >= billingFrom &&
    daysUntil <= RENT_REMINDER_DAYS_BEFORE &&
    !sent.has(`upcoming:${period}`) &&
    !entries.some((e) => e.auto_key === rentAutoKey(period))
  ) {
    const amount = fromCents(
      toCents(ledgerBalance(entries, asOf)) + toCents(lease.monthly_rent),
    );
    if (amount > 0) return { kind: "upcoming", period, dueDate: nextDue, amount };
  }
  return null;
}

export type MonthStatus =
  | { state: "paid" }
  | { state: "outstanding"; amount: number }
  | { state: "not_due"; dueDate: string }
  | { state: "none" };

/**
 * This month's rent for the rent roll: paid, outstanding (with the balance),
 * or not due yet. "Paid" means this month's rent charge is fully covered.
 */
export function monthStatus(
  lease: BillableLease,
  entries: LedgerLike[],
  asOf: Date,
): MonthStatus {
  if (lease.status !== "active") return { state: "none" };
  const month = dateKey(asOf).slice(0, 7);
  const owed = ledgerBalance(entries, asOf);
  const charge = entries.find(
    (e) => e.type === "charge" && e.auto_key === rentAutoKey(month),
  );
  if (!charge) {
    if (owed > 0) return { state: "outstanding", amount: owed };
    const due = dueDateFor(asOf.getFullYear(), asOf.getMonth(), lease.rent_due_day);
    return due >= dateKey(asOf) ? { state: "not_due", dueDate: due } : { state: "none" };
  }
  return owed > 0 ? { state: "outstanding", amount: owed } : { state: "paid" };
}
