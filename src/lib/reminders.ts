// Reminder message templates — mirror the escalation ladder in the spec.
import { DEADLINE_LABELS, type DeadlineType, type ReminderType } from "./types";
import { formatCurrency } from "./utils";

interface InspectionReminderContext {
  propertyName: string;
}

export function inspectionReminderSubject(
  type: ReminderType,
  ctx: InspectionReminderContext,
): string {
  switch (type) {
    case "pre_deadline":
      return `Routine inspection due tomorrow — ${ctx.propertyName}`;
    case "deadline_day":
      return `Routine inspection due today — ${ctx.propertyName}`;
    case "overdue_3":
      return `Routine inspection 3 days overdue — ${ctx.propertyName}`;
    case "overdue_7":
      return `Routine inspection 7 days overdue — ${ctx.propertyName}`;
    case "overdue_14":
      return `Routine inspection 14 days overdue — ${ctx.propertyName}`;
  }
}

export function inspectionReminderBody(
  type: ReminderType,
  ctx: InspectionReminderContext,
): string {
  switch (type) {
    case "pre_deadline":
      return `The routine inspection for ${ctx.propertyName} is scheduled for tomorrow. Please complete the walkthrough and upload photos.`;
    case "deadline_day":
      return `The routine inspection for ${ctx.propertyName} is due today. Please complete the walkthrough and upload photos.`;
    case "overdue_3":
      return `The routine inspection for ${ctx.propertyName} is now 3 days overdue. Please complete it as soon as possible.`;
    case "overdue_7":
      return `The routine inspection for ${ctx.propertyName} is now 7 days overdue. Please complete it and report any issues.`;
    case "overdue_14":
      return `The routine inspection for ${ctx.propertyName} is now 14 days overdue. This is affecting the property's accountability record.`;
  }
}

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
