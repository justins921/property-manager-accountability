// ============================================================================
// Core accountability calculations.
//
// Everything here is a pure function so it can be unit-tested and reused on
// both the server (cron reminders, dashboards) and the client. Dates are
// handled as calendar days to avoid timezone drift — a vacancy that became
// vacant "on the 1st" is the same number of days vacant regardless of where
// the viewer is sitting.
// ============================================================================

import { differenceInCalendarDays } from "date-fns";
import type {
  DeadlineType,
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
  const overdueBy = -next.daysUntil;
  switch (true) {
    case next.daysUntil === 1:
      return { type: "pre_deadline" };
    case next.daysUntil === 0:
      return { type: "deadline_day" };
    case overdueBy === 3:
      return { type: "overdue_3" };
    case overdueBy === 7:
      return { type: "overdue_7" };
    case overdueBy === 14:
      return { type: "overdue_14" };
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
