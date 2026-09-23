"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateKey } from "@/lib/calculations";
import { sendReminderEmail } from "@/lib/email";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { OWNER_REQUEST_TYPE_LABELS, type OwnerRequestType } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

// Owner requests are the owner side of the two-way scorecard: a manager asks
// the owner to approve spending, make a decision, or reimburse a cost, with a
// due-by date. The database stamps created_at and responded_at itself, so
// response times can't be edited after the fact, and requests can't be
// deleted (only withdrawn by the person who sent them).

const requestSchema = z.object({
  type: z.enum(["spending", "decision", "reimbursement"]),
  title: z.string().trim().min(1, "Give the request a short title."),
  details: z.string().trim().optional(),
  amount: z
    .union([z.literal(""), z.coerce.number().nonnegative().multipleOf(0.01)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  due_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a due-by date."),
  property_id: z.string().uuid().optional().or(z.literal("")),
  vacancy_id: z.string().uuid().optional().or(z.literal("")),
});

function siteLink(path: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${path}`;
}

/** Send an owner request. Any member; emails every owner in the org. */
export async function createOwnerRequest(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;
  if (input.due_by < dateKey(new Date())) {
    return { error: "The due-by date can't be in the past." };
  }
  if (input.type !== "decision" && input.amount === null) {
    return { error: "Add the amount for a spending or reimbursement request." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("owner_requests").insert({
    org_id: ctx.org.id,
    type: input.type,
    title: input.title,
    details: input.details || null,
    amount: input.amount,
    due_by: input.due_by,
    property_id: input.property_id || null,
    vacancy_id: input.vacancy_id || null,
    requested_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const { data: owners } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", ctx.org.id)
    .eq("role", "owner");
  const ownerIds = ((owners ?? []) as { user_id: string }[])
    .map((o) => o.user_id)
    .filter((id) => id !== ctx.userId);
  const { data: ownerProfiles } = ownerIds.length
    ? await supabase.from("profiles").select("email").in("id", ownerIds)
    : { data: [] };
  const from = ctx.fullName || ctx.email;
  const label = OWNER_REQUEST_TYPE_LABELS[input.type as OwnerRequestType];
  const amount = input.amount !== null ? ` (${formatCurrency(input.amount, true)})` : "";
  for (const p of (ownerProfiles ?? []) as { email: string | null }[]) {
    if (!p.email) continue;
    await sendReminderEmail({
      to: p.email,
      subject: `${label}: ${input.title}`,
      body: `${from} is asking you to respond by ${formatDate(input.due_by)}: "${input.title}"${amount}. Your response time shows on the Owner Scorecard. Respond here: ${siteLink("/requests")}`,
    });
  }

  revalidatePath("/requests");
  return { ok: true };
}

const respondSchema = z.object({
  request_id: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
  response_note: z.string().trim().optional(),
});

/** Approve or decline a pending request. Owners only. */
export async function respondToOwnerRequest(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") {
    return { error: "Only owners can approve or decline requests." };
  }
  const parsed = respondSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const { request_id, decision, response_note } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("owner_requests")
    .update({
      status: decision,
      response_note: response_note || null,
      responded_by: ctx.userId,
    })
    .eq("org_id", ctx.org.id)
    .eq("id", request_id)
    .eq("status", "pending")
    .select("title, requested_by")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This request was already answered or withdrawn." };

  if (data.requested_by && data.requested_by !== ctx.userId) {
    const { data: requester } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", data.requested_by)
      .maybeSingle();
    if (requester?.email) {
      await sendReminderEmail({
        to: requester.email as string,
        subject: `Request ${decision}: ${data.title}`,
        body: `${ctx.fullName || ctx.email} ${decision} your request "${data.title}".${
          response_note ? ` Note: ${response_note}` : ""
        } ${siteLink("/requests")}`,
      });
    }
  }

  revalidatePath("/requests");
  revalidatePath("/scorecard/owners");
  return { ok: true };
}

/** Withdraw your own pending request (it no longer counts on the scorecard). */
export async function withdrawOwnerRequest(requestId: string) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("owner_requests")
    .update({ status: "withdrawn" })
    .eq("org_id", ctx.org.id)
    .eq("id", requestId)
    .eq("requested_by", ctx.userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Only the person who sent a pending request can withdraw it." };

  revalidatePath("/requests");
  revalidatePath("/scorecard/owners");
  return { ok: true };
}
