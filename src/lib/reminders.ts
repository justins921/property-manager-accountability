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

// ── Rent: pay links, reminders, autopay ────────────────────────────────────

export function payLinkSubject(kind: "payment" | "autopay", place: string): string {
  return kind === "autopay"
    ? `Set up automatic rent payments for ${place}`
    : `Rent payment for ${place}`;
}

export function payLinkBody(
  kind: "payment" | "autopay",
  ctx: { place: string; amount: string | null; url: string; orgName: string },
): string {
  if (kind === "autopay") {
    return `${ctx.orgName} invited you to pay rent for ${ctx.place} automatically each month. Save a bank account or card here: ${ctx.url} It's charged on the rent due date, and you can ask your property manager to turn it off anytime.`;
  }
  return `${ctx.orgName} sent you a payment request for ${ctx.place}: ${ctx.amount}. Pay securely online by bank account or card: ${ctx.url}`;
}

export interface RentReminderContext {
  place: string;
  amount: string;
  dueDate: string;
  /** Pay link, when online payments are on and the tenant isn't on autopay. */
  url: string | null;
  /** "Visa •••• 4242" when the tenant is on autopay. */
  autopayLabel: string | null;
}

export function rentReminderSubject(
  kind: "upcoming" | "late" | "autopay_failed",
  ctx: RentReminderContext,
): string {
  switch (kind) {
    case "upcoming":
      return `Rent for ${ctx.place} is due ${ctx.dueDate}`;
    case "late":
      return `Rent for ${ctx.place} is past due`;
    case "autopay_failed":
      return `Your automatic rent payment didn't go through`;
  }
}

export function rentReminderBody(
  kind: "upcoming" | "late" | "autopay_failed",
  ctx: RentReminderContext,
): string {
  const pay = ctx.url ? ` Pay online: ${ctx.url}` : "";
  switch (kind) {
    case "upcoming":
      return ctx.autopayLabel
        ? `Rent of ${ctx.amount} for ${ctx.place} will be charged automatically to ${ctx.autopayLabel} on ${ctx.dueDate}. Nothing to do.`
        : `Rent of ${ctx.amount} for ${ctx.place} is due on ${ctx.dueDate}.${pay}`;
    case "late":
      return `We haven't received rent for ${ctx.place}, due ${ctx.dueDate}. The balance is ${ctx.amount}.${pay}`;
    case "autopay_failed":
      return `The automatic payment of ${ctx.amount} for ${ctx.place} didn't go through${
        ctx.autopayLabel ? ` on ${ctx.autopayLabel}` : ""
      }. We'll try again in a few days, or you can pay now.${pay}`;
  }
}

// ── Maintenance ────────────────────────────────────────────────────────────

export function newRepairRequestSubject(place: string): string {
  return `New repair request: ${place}`;
}

export function newRepairRequestBody(ctx: {
  place: string;
  title: string;
  reporter: string;
  url: string;
}): string {
  return `${ctx.reporter} submitted a repair request for ${ctx.place}: "${ctx.title}". It's in your work orders as New: ${ctx.url}`;
}
