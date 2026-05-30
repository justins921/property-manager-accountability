// ============================================================================
// Routine-inspection calculations — pure, calendar-day based (like the vacancy
// math in calculations.ts), so they're testable and reusable on server + client.
// ============================================================================

import {
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
} from "date-fns";
import { parseDate } from "./calculations";
import type {
  InspectionFrequency,
  PropertyInspection,
  PropertyInspectionItem,
  VacancyStatus,
} from "./types";

/** A routine inspection is YELLOW when due within this many days. */
export const INSPECTION_YELLOW_WINDOW_DAYS = 5;

/** Advance a date by one period of the given frequency. */
export function advanceScheduleDate(
  date: Date | string,
  frequency: InspectionFrequency,
): Date {
  const d = parseDate(date);
  switch (frequency) {
    case "weekly":
      return addWeeks(d, 1);
    case "monthly":
      return addMonths(d, 1);
    case "quarterly":
      return addMonths(d, 3);
    case "semiannual":
      return addMonths(d, 6);
    case "annual":
      return addYears(d, 1);
  }
}

/**
 * Roll a schedule's due date forward from `from` until it lands strictly after
 * `asOf`. Used by the cron when catching a schedule up after generating an
 * occurrence (or after a lapse).
 */
export function nextDueAfter(
  from: Date | string,
  frequency: InspectionFrequency,
  asOf: Date = new Date(),
): Date {
  let next = parseDate(from);
  // Guard against pathological loops; weekly over a few years is well under this.
  for (let i = 0; i < 1000; i += 1) {
    if (differenceInCalendarDays(next, asOf) > 0) break;
    next = advanceScheduleDate(next, frequency);
  }
  return next;
}

/**
 * The first occurrence (anchor + n periods) that falls on or after `asOf`.
 * Used when (re)setting a schedule to compute its next due date.
 */
export function firstDueOnOrAfter(
  anchor: Date | string,
  frequency: InspectionFrequency,
  asOf: Date = new Date(),
): Date {
  let d = parseDate(anchor);
  for (let i = 0; i < 1000; i += 1) {
    if (differenceInCalendarDays(d, asOf) >= 0) break;
    d = advanceScheduleDate(d, frequency);
  }
  return d;
}

/** Days until an inspection is due; negative means overdue. */
export function daysUntilDue(
  inspection: Pick<PropertyInspection, "due_date">,
  asOf: Date = new Date(),
): number {
  return differenceInCalendarDays(parseDate(inspection.due_date), asOf);
}

/**
 * Traffic-light status for a routine inspection.
 *   GREEN  — completed, or comfortably ahead of the due date
 *   YELLOW — due within the warning window
 *   RED    — overdue and not yet completed
 */
export function routineInspectionStatus(
  inspection: Pick<PropertyInspection, "due_date" | "completed_at">,
  asOf: Date = new Date(),
): VacancyStatus {
  if (inspection.completed_at) return "green";
  const days = daysUntilDue(inspection, asOf);
  if (days < 0) return "red";
  if (days <= INSPECTION_YELLOW_WINDOW_DAYS) return "yellow";
  return "green";
}

/** Whether a completed inspection was finished on or before its due date. */
export function completedOnTime(
  inspection: Pick<PropertyInspection, "due_date" | "completed_at">,
): boolean | null {
  if (!inspection.completed_at) return null;
  const completedDay = new Date(inspection.completed_at);
  return differenceInCalendarDays(completedDay, parseDate(inspection.due_date)) <=
    0;
}

export interface InspectionScorecard {
  managerId: string | null;
  total: number;
  completed: number;
  overdue: number;
  onTimePct: number | null;
  openIssues: number;
}

/**
 * Roll up routine-inspection performance for a set of inspections, optionally
 * with their items (to count "needs attention" issues).
 */
export function buildInspectionScorecard(
  managerId: string | null,
  inspections: PropertyInspection[],
  items: PropertyInspectionItem[] = [],
  asOf: Date = new Date(),
): InspectionScorecard {
  const completed = inspections.filter((i) => i.completed_at);
  const overdue = inspections.filter(
    (i) => !i.completed_at && daysUntilDue(i, asOf) < 0,
  );
  const onTime = completed.filter((i) => completedOnTime(i) === true);

  const inspectionIds = new Set(inspections.map((i) => i.id));
  const openIssues = items.filter(
    (it) => it.result === "needs_attention" && inspectionIds.has(it.inspection_id),
  ).length;

  return {
    managerId,
    total: inspections.length,
    completed: completed.length,
    overdue: overdue.length,
    onTimePct:
      completed.length === 0 ? null : (onTime.length / completed.length) * 100,
    openIssues,
  };
}
