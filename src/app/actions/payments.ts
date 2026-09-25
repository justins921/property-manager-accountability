"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateKey, ledgerBalance } from "@/lib/calculations";
import { sendReminderEmail } from "@/lib/email";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { payLinkBody, payLinkSubject } from "@/lib/reminders";
import { getStripe, siteUrl, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { LedgerEntry } from "@/lib/types";
import { formatCurrency, unitLabel } from "@/lib/utils";

/**
 * Connect the organization's Stripe account so rent goes straight to the
 * owner's bank. Owners only. Returns Stripe's onboarding URL to open.
 */
export async function startStripeConnect() {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") return { error: "Only owners can set up online payments." };
  if (!stripeConfigured()) {
    return { error: "Online payments aren't available yet. Ask your platform admin to add the Stripe keys." };
  }

  const stripe = getStripe();
  const admin = createAdminClient();
  let accountId = ctx.org.stripe_account_id ?? null;
  if (!accountId) {
    const account = await stripe.accounts.create(
      {
        type: "standard",
        email: ctx.email || undefined,
        business_profile: { name: ctx.org.name },
        metadata: { org_id: ctx.org.id },
      },
      { idempotencyKey: `connect-${ctx.org.id}` },
    );
    accountId = account.id;
    // Stripe fields are written with the service role only (see payments.sql).
    await admin.from("organizations").update({ stripe_account_id: accountId }).eq("id", ctx.org.id);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: siteUrl("/rent-roll?stripe=refresh"),
    return_url: siteUrl("/rent-roll?stripe=return"),
  });
  return { ok: true, url: link.url };
}

const sendSchema = z.object({
  lease_id: z.string().uuid(),
  kind: z.enum(["payment", "autopay"]).default("payment"),
  amount: z
    .union([z.literal(""), z.coerce.number().positive().multipleOf(0.01)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

/**
 * Send the tenant(s) a secure pay link by email. "payment" asks for an
 * amount (default: what's owed today); "autopay" lets the tenant save a
 * payment method for automatic monthly rent. Any earlier open link for the
 * lease is cancelled, so only the newest link works.
 */
export async function sendPaymentLink(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { lease_id, kind } = parsed.data;
  if (!ctx.org.stripe_charges_enabled) {
    return { error: "Online payments aren't set up for this portfolio yet. An owner can connect Stripe on the Rent Roll page." };
  }

  const supabase = await createClient();
  const { data: lease } = await supabase
    .from("leases")
    .select("*, unit:units(name), property:properties(name), lease_tenants(tenant:tenants(first_name, email))")
    .eq("org_id", ctx.org.id)
    .eq("id", lease_id)
    .maybeSingle();
  if (!lease) return { error: "Lease not found." };
  if (lease.status !== "active" && lease.status !== "upcoming") {
    return { error: "This lease has ended." };
  }

  let amount: number | null = null;
  if (kind === "payment") {
    const { data: entries } = await supabase
      .from("ledger_entries")
      .select("type, amount, entry_date, auto_key")
      .eq("lease_id", lease_id);
    amount = parsed.data.amount ?? ledgerBalance((entries ?? []) as LedgerEntry[], new Date());
    if (!(amount > 0)) return { error: "Nothing is owed right now. Enter an amount to request." };
  }

  const tenants = ((lease.lease_tenants ?? []) as { tenant: { first_name: string; email: string | null } | null }[])
    .map((lt) => lt.tenant)
    .filter((t): t is { first_name: string; email: string | null } => !!t);
  const emails = Array.from(new Set(tenants.map((t) => t.email).filter((e): e is string => !!e)));

  await supabase
    .from("payment_links")
    .update({ status: "void" })
    .eq("lease_id", lease_id)
    .eq("status", "open");

  const { data: link, error } = await supabase
    .from("payment_links")
    .insert({
      org_id: ctx.org.id,
      lease_id,
      kind,
      amount,
      sent_to: emails,
      created_by: ctx.userId,
    })
    .select("token")
    .single();
  if (error || !link) return { error: error?.message ?? "Could not create the link." };

  const url = siteUrl(`/pay/${link.token}`);
  const place = unitLabel(lease.unit, lease.property);
  for (const email of emails) {
    await sendReminderEmail({
      to: email,
      subject: payLinkSubject(kind, place),
      body: payLinkBody(kind, {
        place,
        amount: amount !== null ? formatCurrency(amount, true) : null,
        url,
        orgName: ctx.org.name,
      }),
    });
  }

  revalidatePath(`/leases/${lease_id}`);
  revalidatePath("/rent-roll");
  return {
    ok: true,
    url,
    message: emails.length
      ? `Sent to ${emails.join(", ")}.`
      : "Link created. No tenant on this lease has an email, so copy the link and send it yourself.",
  };
}

/** Cancel an open pay link so it stops working. */
export async function voidPaymentLink(linkId: string) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_links")
    .update({ status: "void" })
    .eq("org_id", ctx.org.id)
    .eq("id", linkId)
    .eq("status", "open")
    .select("lease_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That link is no longer open." };
  revalidatePath(`/leases/${data.lease_id}`);
  return { ok: true };
}

/** Turn autopay off. Turning it back on needs the tenant (autopay link). */
export async function turnOffAutopay(leaseId: string) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const supabase = await createClient();
  const { error } = await supabase
    .from("leases")
    .update({ autopay_enabled: false })
    .eq("org_id", ctx.org.id)
    .eq("id", leaseId);
  if (error) return { error: error.message };
  revalidatePath(`/leases/${leaseId}`);
  revalidatePath("/rent-roll");
  return { ok: true, message: `Autopay turned off ${dateKey(new Date())}.` };
}
