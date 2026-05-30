import { format } from "date-fns";
import { NextResponse } from "next/server";
import {
  dueReminder,
  nextDeadline,
  reminderTypeForDaysUntil,
  vacancyCost,
} from "@/lib/calculations";
import {
  advanceScheduleDate,
  daysUntilDue,
} from "@/lib/inspections-calc";
import {
  inspectionReminderBody,
  inspectionReminderSubject,
  reminderBody,
  reminderSubject,
} from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  InspectionSchedule,
  Property,
  PropertyInspection,
  Vacancy,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

/** Generate inspection occurrences this many days before they're due. */
const GENERATION_LEAD_DAYS = 7;

/**
 * Daily cron (configured in vercel.json). Handles both accountability pillars:
 *   1. Vacancy deadline reminders.
 *   2. Routine inspections — generates due occurrences from active schedules
 *      and sends their reminders.
 *
 * Protected by a shared bearer secret (CRON_SECRET). Vercel Cron sends it
 * automatically; you can also trigger it manually with the same header.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const vacancy = await processVacancyReminders(supabase, now);
  const generated = await generateDueInspections(supabase, now);
  const inspection = await processInspectionReminders(supabase, now);

  return NextResponse.json({ ok: true, vacancy, generated, inspection });
}

/** Look up emails for a set of user ids. */
async function emailsFor(
  supabase: AdminClient,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(ids.filter((id): id is string => !!id)),
  );
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", unique);
  for (const p of data ?? []) {
    if (p.email) map.set(p.id as string, p.email as string);
  }
  return map;
}

async function processVacancyReminders(supabase: AdminClient, now: Date) {
  const { data } = await supabase
    .from("vacancies")
    .select("*, property:properties(*)")
    .neq("stage", "completed")
    .is("closed_at", null);

  const rows = (data ?? []) as (Vacancy & { property: Property | null })[];
  const emailById = await emailsFor(
    supabase,
    rows.map((v) => v.manager_id),
  );

  let sent = 0;
  for (const v of rows) {
    const next = nextDeadline(v, now);
    if (!next) continue;
    const due = dueReminder(next);
    if (!due) continue;

    const { data: existing } = await supabase
      .from("reminders")
      .select("id")
      .eq("vacancy_id", v.id)
      .eq("deadline_type", next.type)
      .eq("reminder_type", due.type)
      .maybeSingle();
    if (existing) continue;

    const unitLabel = `Unit ${v.unit_number}${
      v.property?.name ? ` at ${v.property.name}` : ""
    }`;
    const ctx = {
      unitLabel,
      deadlineType: next.type,
      vacancyCost: vacancyCost(v, now),
    };
    const subject = reminderSubject(due.type, ctx);
    const body = reminderBody(due.type, ctx);
    const recipient = v.manager_id ? emailById.get(v.manager_id) ?? null : null;

    if (recipient) {
      const { sendReminderEmail } = await import("@/lib/email");
      await sendReminderEmail({ to: recipient, subject, body });
    }
    await supabase.from("reminders").insert({
      vacancy_id: v.id,
      org_id: v.org_id,
      reminder_type: due.type,
      deadline_type: next.type,
      message: body,
      recipient_email: recipient,
    });
    sent += 1;
  }
  return { scanned: rows.length, sent };
}

async function generateDueInspections(supabase: AdminClient, now: Date) {
  const horizon = format(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + GENERATION_LEAD_DAYS),
    "yyyy-MM-dd",
  );

  const { data } = await supabase
    .from("inspection_schedules")
    .select("*")
    .eq("active", true)
    .lte("next_due_date", horizon);

  const schedules = (data ?? []) as InspectionSchedule[];
  let created = 0;

  for (const schedule of schedules) {
    // Skip if an occurrence for this exact due date already exists.
    const { data: existing } = await supabase
      .from("property_inspections")
      .select("id")
      .eq("schedule_id", schedule.id)
      .eq("due_date", schedule.next_due_date)
      .maybeSingle();

    if (!existing) {
      await supabase.from("property_inspections").insert({
        org_id: schedule.org_id,
        property_id: schedule.property_id,
        schedule_id: schedule.id,
        manager_id: schedule.manager_id,
        due_date: schedule.next_due_date,
      });
      created += 1;
    }

    // Roll the schedule forward one period.
    const nextDue = format(
      advanceScheduleDate(schedule.next_due_date, schedule.frequency),
      "yyyy-MM-dd",
    );
    await supabase
      .from("inspection_schedules")
      .update({ next_due_date: nextDue })
      .eq("id", schedule.id);
  }
  return { schedules: schedules.length, created };
}

async function processInspectionReminders(supabase: AdminClient, now: Date) {
  const { data } = await supabase
    .from("property_inspections")
    .select("*, property:properties(*)")
    .is("completed_at", null);

  const rows = (data ?? []) as (PropertyInspection & {
    property: Property | null;
  })[];
  const emailById = await emailsFor(
    supabase,
    rows.map((r) => r.manager_id),
  );

  let sent = 0;
  for (const ins of rows) {
    const type = reminderTypeForDaysUntil(daysUntilDue(ins, now));
    if (!type) continue;

    const { data: existing } = await supabase
      .from("inspection_reminders")
      .select("id")
      .eq("inspection_id", ins.id)
      .eq("reminder_type", type)
      .maybeSingle();
    if (existing) continue;

    const ctx = { propertyName: ins.property?.name ?? "your property" };
    const subject = inspectionReminderSubject(type, ctx);
    const body = inspectionReminderBody(type, ctx);
    const recipient = ins.manager_id
      ? emailById.get(ins.manager_id) ?? null
      : null;

    if (recipient) {
      const { sendReminderEmail } = await import("@/lib/email");
      await sendReminderEmail({ to: recipient, subject, body });
    }
    await supabase.from("inspection_reminders").insert({
      inspection_id: ins.id,
      org_id: ins.org_id,
      reminder_type: type,
      message: body,
      recipient_email: recipient,
    });
    sent += 1;
  }
  return { scanned: rows.length, sent };
}
