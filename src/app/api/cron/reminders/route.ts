import { format } from "date-fns";
import { NextResponse } from "next/server";
import {
  autopayChargeDue,
  dateKey,
  dueReminder,
  lateFeesDue,
  rentReminderDue,
  nextDeadline,
  parseDate,
  reminderTypeForDaysUntil,
  rentAutoKey,
  rentPeriodsDue,
  vacancyCost,
} from "@/lib/calculations";
import {
  advanceScheduleDate,
  daysUntilDue,
} from "@/lib/inspections-calc";
import { applyPaymentIntent, stripeAmount } from "@/lib/online-payments";
import {
  inspectionReminderBody,
  inspectionReminderSubject,
  reminderBody,
  reminderSubject,
  rentReminderBody,
  rentReminderSubject,
  type RentReminderContext,
} from "@/lib/reminders";
import { getStripe, siteUrl, stripeConfigured } from "@/lib/stripe";
import { formatCurrency, formatDate, unitLabel } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AutopayAttempt,
  InspectionSchedule,
  Lease,
  LedgerEntry,
  PaymentLink,
  Property,
  PropertyInspection,
  Vacancy,
} from "@/lib/types";

export const dynamic = "force-dynamic";
// Never serve this job's database reads from Next's fetch cache.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

/** Generate inspection occurrences this many days before they're due. */
const GENERATION_LEAD_DAYS = 7;

/**
 * Daily cron (configured in vercel.json):
 *   1. Leasing — activates upcoming leases on their start date, posts monthly
 *      rent charges on the due day, and posts late fees after the grace
 *      period. Both postings are idempotent (unique auto_key per lease).
 *   2. Autopay — charges saved payment methods on the due date, retrying
 *      failed charges (online payments only).
 *   3. Rent reminders — before the due date and after a missed payment, with
 *      a pay link when online payments are on.
 *   4. Vacancy deadline reminders.
 *   5. Routine inspections — generates due occurrences from active schedules
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

  const leasing = await processLeasing(supabase, now);
  const autopay = await processAutopay(supabase, now);
  const rentReminders = await processRentReminders(supabase, now);
  const vacancy = await processVacancyReminders(supabase, now);
  const generated = await generateDueInspections(supabase, now);
  const inspection = await processInspectionReminders(supabase, now);

  return NextResponse.json({
    ok: true,
    leasing,
    autopay,
    rentReminders,
    vacancy,
    generated,
    inspection,
  });
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

async function processLeasing(supabase: AdminClient, now: Date) {
  const today = dateKey(now);

  // 1. Upcoming leases whose start date has arrived become active. If the
  //    unit still has an active lease, the unique index blocks it and the
  //    lease stays upcoming until the old one is ended.
  const { data: upcoming } = await supabase
    .from("leases")
    .select("id")
    .eq("status", "upcoming")
    .lte("start_date", today);
  let activated = 0;
  let blocked = 0;
  for (const l of upcoming ?? []) {
    const { error } = await supabase
      .from("leases")
      .update({ status: "active" })
      .eq("id", l.id)
      .eq("status", "upcoming");
    if (error) blocked += 1;
    else activated += 1;
  }

  // 2. Rent charges and late fees for every active lease.
  const { data } = await supabase
    .from("leases")
    .select("*, ledger_entries(*)")
    .eq("status", "active");
  const leases = (data ?? []) as (Lease & { ledger_entries: LedgerEntry[] })[];

  let rentPosted = 0;
  let feesPosted = 0;
  for (const lease of leases) {
    let entries: Pick<LedgerEntry, "type" | "amount" | "entry_date" | "auto_key" | "created_at">[] =
      lease.ledger_entries;
    const posted = new Set(entries.map((e) => e.auto_key));

    const rentRows = rentPeriodsDue(lease, now)
      .filter((p) => !posted.has(rentAutoKey(p.period)))
      .map((p) => ({
        org_id: lease.org_id,
        lease_id: lease.id,
        type: "charge" as const,
        amount: lease.monthly_rent,
        entry_date: p.dueDate,
        memo: `Rent for ${format(parseDate(p.dueDate), "MMMM yyyy")}`,
        auto_key: rentAutoKey(p.period),
      }));
    if (rentRows.length > 0) {
      const { data: inserted, error } = await supabase
        .from("ledger_entries")
        .upsert(rentRows, { onConflict: "lease_id,auto_key", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.error("[cron] rent posting failed", lease.id, error.message);
        continue;
      }
      rentPosted += inserted?.length ?? 0;
      entries = [...entries, ...rentRows.map((r) => ({ ...r, created_at: now.toISOString() }))];
    }

    const feeRows = lateFeesDue(lease, entries, now).map((f) => ({
      org_id: lease.org_id,
      lease_id: lease.id,
      type: "late_fee" as const,
      amount: f.amount,
      entry_date: f.entryDate,
      memo: `Late fee: ${format(parseDate(`${f.period}-01`), "MMMM yyyy")} rent unpaid after the ${lease.late_fee_grace_days}-day grace period`,
      auto_key: f.autoKey,
    }));
    if (feeRows.length > 0) {
      const { data: inserted, error } = await supabase
        .from("ledger_entries")
        .upsert(feeRows, { onConflict: "lease_id,auto_key", ignoreDuplicates: true })
        .select("id");
      if (error) console.error("[cron] late fee posting failed", lease.id, error.message);
      else feesPosted += inserted?.length ?? 0;
    }
  }

  return { activated, blocked, activeLeases: leases.length, rentPosted, feesPosted };
}

type TenantEmail = { tenant: { email: string | null } | null };

function tenantEmails(rows: TenantEmail[] | null | undefined): string[] {
  return Array.from(
    new Set((rows ?? []).map((r) => r.tenant?.email).filter((e): e is string => !!e)),
  );
}

type RentLease = Lease & {
  org: { name: string; stripe_account_id: string | null; stripe_charges_enabled: boolean } | null;
  unit: { name: string } | null;
  property: { name: string } | null;
  ledger_entries: LedgerEntry[];
  lease_tenants: TenantEmail[];
};

const RENT_LEASE_SELECT =
  "*, org:organizations(name, stripe_account_id, stripe_charges_enabled), unit:units(name), property:properties(name), ledger_entries(*), lease_tenants(tenant:tenants(email))";

/** Send (and log) a rent email once per lease/month/kind. */
async function sendRentEmail(
  supabase: AdminClient,
  lease: RentLease,
  period: string,
  kind: "upcoming" | "late" | "autopay_failed",
  ctx: RentReminderContext,
): Promise<boolean> {
  const emails = tenantEmails(lease.lease_tenants);
  if (emails.length === 0) return false;
  // Log first: the unique (lease, period, kind) makes a re-run a no-op.
  const { data: logged } = await supabase
    .from("rent_reminders")
    .upsert(
      { org_id: lease.org_id, lease_id: lease.id, period, kind, sent_to: emails },
      { onConflict: "lease_id,period,kind", ignoreDuplicates: true },
    )
    .select("id");
  if (!logged?.length) return false;
  const { sendReminderEmail } = await import("@/lib/email");
  for (const to of emails) {
    await sendReminderEmail({
      to,
      subject: rentReminderSubject(kind, ctx),
      body: rentReminderBody(kind, ctx),
    });
  }
  return true;
}

/** An open pay link for this amount: reuse one if it exists, else create it. */
async function payLinkFor(
  supabase: AdminClient,
  lease: RentLease,
  amount: number,
): Promise<string | null> {
  if (!lease.org?.stripe_charges_enabled || !lease.org.stripe_account_id) return null;
  const { data: open } = await supabase
    .from("payment_links")
    .select("id, token, amount, kind, expires_at")
    .eq("lease_id", lease.id)
    .eq("status", "open");
  const reusable = ((open ?? []) as PaymentLink[]).find(
    (l) =>
      l.kind === "payment" &&
      stripeAmount(Number(l.amount)) === stripeAmount(amount) &&
      new Date(l.expires_at) > new Date(),
  );
  if (reusable) return siteUrl(`/pay/${reusable.token}`);

  await supabase.from("payment_links").update({ status: "void" }).eq("lease_id", lease.id).eq("status", "open");
  const { data: created } = await supabase
    .from("payment_links")
    .insert({
      org_id: lease.org_id,
      lease_id: lease.id,
      kind: "payment",
      amount,
      sent_to: tenantEmails(lease.lease_tenants),
    })
    .select("token")
    .single();
  return created ? siteUrl(`/pay/${created.token}`) : null;
}

async function processAutopay(supabase: AdminClient, now: Date) {
  if (!stripeConfigured()) return { skipped: "Stripe not configured" };
  const { data } = await supabase
    .from("leases")
    .select(`${RENT_LEASE_SELECT}, autopay_attempts(*), payment_links(status)`)
    .eq("status", "active")
    .eq("autopay_enabled", true);
  const leases = (data ?? []) as (RentLease & {
    autopay_attempts: AutopayAttempt[];
    payment_links: { status: string }[];
  })[];

  const stripe = getStripe();
  let charged = 0;
  let failed = 0;
  for (const lease of leases) {
    const accountId = lease.org?.stripe_account_id;
    if (!accountId || !lease.org?.stripe_charges_enabled || !lease.stripe_customer_id) continue;
    const due = autopayChargeDue(lease, lease.ledger_entries, lease.autopay_attempts, now, {
      paymentProcessing:
        lease.payment_links.some((l) => l.status === "processing") ||
        lease.autopay_attempts.some((a) => a.status === "processing"),
    });
    if (!due) continue;

    // Claim this attempt first; the unique (lease, period, attempt) stops a
    // second cron run from charging twice.
    const { data: claimed } = await supabase
      .from("autopay_attempts")
      .upsert(
        {
          org_id: lease.org_id,
          lease_id: lease.id,
          period: due.period,
          attempt: due.attempt,
          amount: due.amount,
          status: "processing",
          attempted_on: dateKey(now),
        },
        { onConflict: "lease_id,period,attempt", ignoreDuplicates: true },
      )
      .select("id");
    if (!claimed?.length) continue;

    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: stripeAmount(due.amount),
          currency: "usd",
          customer: lease.stripe_customer_id,
          payment_method: lease.autopay_payment_method_id!,
          payment_method_types: ["card", "us_bank_account"],
          off_session: true,
          confirm: true,
          description: `Rent ${due.period} · ${unitLabel(lease.unit, lease.property)}`,
          metadata: {
            kind: "autopay",
            org_id: lease.org_id,
            lease_id: lease.id,
            period: due.period,
            attempt: String(due.attempt),
          },
        },
        {
          stripeAccount: accountId,
          idempotencyKey: `autopay-${lease.id}-${due.period}-${due.attempt}`,
        },
      );
      await applyPaymentIntent(supabase, accountId, pi.id);
      if (pi.status === "succeeded" || pi.status === "processing") {
        charged += 1;
        continue;
      }
    } catch (err) {
      const e = err as { message?: string; raw?: { payment_intent?: { id: string } } };
      const piId = e.raw?.payment_intent?.id;
      if (piId) await applyPaymentIntent(supabase, accountId, piId);
      await supabase
        .from("autopay_attempts")
        .update({ status: "failed", failure_message: e.message ?? "The charge was declined." })
        .eq("lease_id", lease.id)
        .eq("period", due.period)
        .eq("attempt", due.attempt)
        .eq("status", "processing");
    }

    failed += 1;
    const url = await payLinkFor(supabase, lease, due.amount);
    await sendRentEmail(supabase, lease, due.period, "autopay_failed", {
      place: unitLabel(lease.unit, lease.property),
      amount: formatCurrency(due.amount, true),
      dueDate: formatDate(`${due.period}-${String(lease.rent_due_day).padStart(2, "0")}`),
      url,
      autopayLabel: lease.autopay_method_label,
    });
  }
  return { autopayLeases: leases.length, charged, failed };
}

async function processRentReminders(supabase: AdminClient, now: Date) {
  const { data } = await supabase
    .from("leases")
    .select(`${RENT_LEASE_SELECT}, rent_reminders(period, kind)`)
    .eq("status", "active");
  const leases = (data ?? []) as (RentLease & { rent_reminders: { period: string; kind: string }[] })[];

  let sent = 0;
  for (const lease of leases) {
    if (tenantEmails(lease.lease_tenants).length === 0) continue;
    const already = new Set(lease.rent_reminders.map((r) => `${r.kind}:${r.period}`));
    const due = rentReminderDue(lease, lease.ledger_entries, already, now);
    if (!due) continue;
    const onAutopay = lease.autopay_enabled && !!lease.autopay_payment_method_id;
    const url =
      due.kind === "upcoming" && onAutopay ? null : await payLinkFor(supabase, lease, due.amount);
    const ok = await sendRentEmail(supabase, lease, due.period, due.kind, {
      place: unitLabel(lease.unit, lease.property),
      amount: formatCurrency(due.amount, true),
      dueDate: formatDate(due.dueDate),
      url,
      autopayLabel: onAutopay ? lease.autopay_method_label : null,
    });
    if (ok) sent += 1;
  }
  return { scanned: leases.length, sent };
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
        template_id: schedule.template_id,
        building_id: schedule.building_id,
        unit_id: schedule.unit_id,
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
