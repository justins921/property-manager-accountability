// Reminder message templates — mirror the escalation ladder in the spec.
import { DEADLINE_LABELS, type DeadlineType, type ReminderType } from "./types";
import { formatCurrency } from "./utils";

interface ReminderContext {
  unitLabel: string; // e.g. "Unit 205 at Maple Court"
  deadlineType: DeadlineType;
  vacancyCost: number;
}

export function reminderSubject(
  type: ReminderType,
  ctx: ReminderContext,
): string {
  switch (type) {
    case "pre_deadline":
      return `${ctx.unitLabel} is due tomorrow`;
    case "deadline_day":
      return `${ctx.unitLabel} is due today`;
    case "overdue_3":
      return `${ctx.unitLabel} is 3 days overdue`;
    case "overdue_7":
      return `${ctx.unitLabel} is 7 days overdue`;
    case "overdue_14":
      return `${ctx.unitLabel} is 14 days overdue`;
  }
}

export function reminderBody(
  type: ReminderType,
  ctx: ReminderContext,
): string {
  const milestone = DEADLINE_LABELS[ctx.deadlineType].toLowerCase();
  switch (type) {
    case "pre_deadline":
      return `${ctx.unitLabel} is scheduled for ${milestone} tomorrow.`;
    case "deadline_day":
      return `${ctx.unitLabel} ${milestone} is due today. Please update the status.`;
    case "overdue_3":
      return `${ctx.unitLabel} is now 3 days overdue on ${milestone}. Please provide an update.`;
    case "overdue_7":
      return `${ctx.unitLabel} is now 7 days overdue on ${milestone}. Please explain the delay and update the timeline.`;
    case "overdue_14":
      return `${ctx.unitLabel} is now 14 days overdue on ${milestone}. Vacancy cost continues to increase (currently ${formatCurrency(
        ctx.vacancyCost,
      )}).`;
  }
}
