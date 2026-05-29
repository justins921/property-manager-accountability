import { NextResponse } from "next/server";
import { dueReminder, nextDeadline, vacancyCost } from "@/lib/calculations";
import { reminderBody, reminderSubject } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Property, Vacancy } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily cron (configured in vercel.json) that walks every active vacancy,
 * works out whether a reminder is due today on its next open deadline, and
 * — if one hasn't already been sent for that exact (deadline, step) — emails
 * the responsible manager and records it.
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

  const { data: vacancies, error } = await supabase
    .from("vacancies")
    .select("*, property:properties(*)")
    .neq("stage", "completed")
    .is("closed_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (vacancies ?? []) as (Vacancy & { property: Property | null })[];

  // Resolve manager emails in one pass.
  const managerIds = Array.from(
    new Set(rows.map((v) => v.manager_id).filter((id): id is string => !!id)),
  );
  const emailById = new Map<string, string>();
  if (managerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", managerIds);
    for (const p of profiles ?? []) {
      if (p.email) emailById.set(p.id as string, p.email as string);
    }
  }

  let sent = 0;
  let skipped = 0;

  for (const vacancy of rows) {
    const next = nextDeadline(vacancy, now);
    if (!next) {
      skipped += 1;
      continue;
    }
    const due = dueReminder(next);
    if (!due) {
      skipped += 1;
      continue;
    }

    // Dedupe: have we already recorded this exact reminder?
    const { data: existing } = await supabase
      .from("reminders")
      .select("id")
      .eq("vacancy_id", vacancy.id)
      .eq("deadline_type", next.type)
      .eq("reminder_type", due.type)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    const unitLabel = `Unit ${vacancy.unit_number}${
      vacancy.property?.name ? ` at ${vacancy.property.name}` : ""
    }`;
    const ctx = {
      unitLabel,
      deadlineType: next.type,
      vacancyCost: vacancyCost(vacancy, now),
    };
    const subject = reminderSubject(due.type, ctx);
    const body = reminderBody(due.type, ctx);
    const recipient = vacancy.manager_id
      ? emailById.get(vacancy.manager_id) ?? null
      : null;

    if (recipient) {
      // Lazy import so the route doesn't fail if Resend isn't installed in dev.
      const { sendReminderEmail } = await import("@/lib/email");
      await sendReminderEmail({ to: recipient, subject, body });
    }

    await supabase.from("reminders").insert({
      vacancy_id: vacancy.id,
      org_id: vacancy.org_id,
      reminder_type: due.type,
      deadline_type: next.type,
      message: body,
      recipient_email: recipient,
    });
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent, skipped, scanned: rows.length });
}
