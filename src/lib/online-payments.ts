import type Stripe from "stripe";
import { dateKey, toCents } from "./calculations";
import { createAdminClient } from "./supabase/admin";
import { getStripe, ledgerMethod, paymentMethodLabel } from "./stripe";
import type { Lease, PaymentLink } from "./types";

// ============================================================================
// Everything that turns a Stripe event into app state. Called from three
// places: the Stripe webhook, the pay page when the tenant returns from
// Checkout, and the daily cron (autopay). Every function here is idempotent,
// so it's safe for the same event to arrive more than once from any of them.
// Runs with the service role; callers must have verified the Stripe side.
// ============================================================================

type Db = ReturnType<typeof createAdminClient>;

/** Ledger auto_key for a Stripe payment; unique per lease, so it posts once. */
export function stripeAutoKey(paymentIntentId: string): string {
  return `stripe:${paymentIntentId}`;
}

/** Post a succeeded Stripe payment to the lease's ledger (once). */
export async function recordStripePayment(
  db: Db,
  args: {
    orgId: string;
    leaseId: string;
    paymentIntent: Stripe.PaymentIntent;
    paymentMethod: Stripe.PaymentMethod | null;
    memo: string;
  },
): Promise<boolean> {
  const { paymentIntent: pi, paymentMethod: pm } = args;
  const { data, error } = await db
    .from("ledger_entries")
    .upsert(
      {
        org_id: args.orgId,
        lease_id: args.leaseId,
        type: "payment",
        amount: pi.amount_received / 100,
        entry_date: dateKey(new Date()),
        memo: `${args.memo} · ${paymentMethodLabel(pm)}`,
        payment_method: ledgerMethod(pm),
        reference: pi.id,
        auto_key: stripeAutoKey(pi.id),
      },
      { onConflict: "lease_id,auto_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`Could not record payment: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Save the tenant's payment method for autopay (they opted in on the pay page). */
async function saveAutopayMethod(
  db: Db,
  leaseId: string,
  pm: Stripe.PaymentMethod,
): Promise<void> {
  await db
    .from("leases")
    .update({
      autopay_enabled: true,
      autopay_payment_method_id: pm.id,
      autopay_method_label: paymentMethodLabel(pm),
      autopay_enabled_at: new Date().toISOString(),
    })
    .eq("id", leaseId);
}

function asPaymentMethod(
  value: string | Stripe.PaymentMethod | null | undefined,
): Stripe.PaymentMethod | null {
  return value && typeof value === "object" ? value : null;
}

/** The org whose Stripe account sent this, or null if it isn't one of ours. */
export async function orgForAccount(db: Db, accountId: string | null | undefined) {
  if (!accountId) return null;
  const { data } = await db
    .from("organizations")
    .select("id, name, stripe_account_id, stripe_charges_enabled")
    .eq("stripe_account_id", accountId)
    .maybeSingle();
  return data as { id: string; name: string; stripe_account_id: string; stripe_charges_enabled: boolean } | null;
}

/**
 * Apply a PaymentIntent's current state: a pay-link payment or an autopay
 * charge. Succeeded → posts to the ledger. Processing (bank payments take a
 * few days) → marked processing. Failed → link marked failed / autopay
 * attempt marked failed so the cron retries.
 */
export async function applyPaymentIntent(
  db: Db,
  accountId: string,
  piOrId: Stripe.PaymentIntent | string,
): Promise<void> {
  const stripe = getStripe();
  const pi =
    typeof piOrId === "string" || !piOrId.payment_method || typeof piOrId.payment_method === "string"
      ? await stripe.paymentIntents.retrieve(
          typeof piOrId === "string" ? piOrId : piOrId.id,
          { expand: ["payment_method"] },
          { stripeAccount: accountId },
        )
      : piOrId;

  const org = await orgForAccount(db, accountId);
  const meta = pi.metadata ?? {};
  if (!org || meta.org_id !== org.id || !meta.lease_id) return;
  const pm = asPaymentMethod(pi.payment_method);
  const failed =
    pi.status === "requires_payment_method" || pi.status === "canceled";
  const failure = pi.last_payment_error?.message ?? "The payment was declined.";

  if (meta.kind === "autopay") {
    const attemptFilter = db
      .from("autopay_attempts")
      .update(
        pi.status === "succeeded"
          ? { status: "succeeded", payment_intent_id: pi.id, failure_message: null }
          : failed
            ? { status: "failed", payment_intent_id: pi.id, failure_message: failure }
            : { status: "processing", payment_intent_id: pi.id },
      )
      .eq("lease_id", meta.lease_id)
      .eq("period", meta.period)
      .eq("attempt", Number(meta.attempt));
    await attemptFilter;
    if (pi.status === "succeeded") {
      await recordStripePayment(db, {
        orgId: org.id,
        leaseId: meta.lease_id,
        paymentIntent: pi,
        paymentMethod: pm,
        memo: "Autopay",
      });
    }
    return;
  }

  if (meta.kind === "pay_link" && meta.link_id) {
    if (pi.status === "succeeded") {
      await recordStripePayment(db, {
        orgId: org.id,
        leaseId: meta.lease_id,
        paymentIntent: pi,
        paymentMethod: pm,
        memo: "Online payment",
      });
      await db
        .from("payment_links")
        .update({ status: "paid", paid_at: new Date().toISOString(), payment_intent_id: pi.id })
        .eq("id", meta.link_id)
        .neq("status", "paid");
    } else if (pi.status === "processing") {
      await db
        .from("payment_links")
        .update({ status: "processing", payment_intent_id: pi.id })
        .eq("id", meta.link_id)
        .in("status", ["open", "processing"]);
    } else if (failed) {
      await db
        .from("payment_links")
        .update({ status: "failed", payment_intent_id: pi.id })
        .eq("id", meta.link_id)
        .in("status", ["open", "processing"]);
    }
  }
}

/**
 * Apply a finished Checkout Session from a pay link: records the payment
 * (or marks it processing) and, if the tenant opted in, saves their payment
 * method for autopay. Used by both the webhook and the pay page's return.
 */
export async function applyCheckoutSession(
  db: Db,
  accountId: string,
  sessionId: string,
): Promise<void> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(
    sessionId,
    { expand: ["payment_intent.payment_method", "setup_intent.payment_method"] },
    { stripeAccount: accountId },
  );
  const org = await orgForAccount(db, accountId);
  const meta = session.metadata ?? {};
  if (!org || meta.org_id !== org.id || !meta.link_id || !meta.lease_id) return;

  const { data: link } = await db
    .from("payment_links")
    .select("*")
    .eq("id", meta.link_id)
    .maybeSingle();
  const l = link as PaymentLink | null;
  if (!l || l.stripe_session_id !== session.id || l.lease_id !== meta.lease_id) return;
  if (session.status !== "complete") return;

  if (session.mode === "setup") {
    const si = session.setup_intent as Stripe.SetupIntent | null;
    const pm = asPaymentMethod(si?.payment_method);
    if (si?.status === "succeeded" && pm) {
      await saveAutopayMethod(db, l.lease_id, pm);
      await db
        .from("payment_links")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", l.id);
    }
    return;
  }

  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  if (!pi) return;
  await applyPaymentIntent(db, accountId, pi);
  const pm = asPaymentMethod(pi.payment_method);
  if (meta.autopay === "1" && pm && (pi.status === "succeeded" || pi.status === "processing")) {
    await saveAutopayMethod(db, l.lease_id, pm);
  }
}

/** The lease's Stripe customer on the org's account, created on first use. */
export async function ensureCustomer(
  db: Db,
  accountId: string,
  lease: Pick<Lease, "id" | "stripe_customer_id">,
  details: { name: string; email: string | null },
): Promise<string> {
  if (lease.stripe_customer_id) return lease.stripe_customer_id;
  const customer = await getStripe().customers.create(
    {
      name: details.name,
      email: details.email ?? undefined,
      metadata: { lease_id: lease.id },
    },
    { stripeAccount: accountId, idempotencyKey: `customer-${lease.id}` },
  );
  await db.from("leases").update({ stripe_customer_id: customer.id }).eq("id", lease.id);
  return customer.id;
}

/** Amount in cents for Stripe, from a ledger amount in dollars. */
export function stripeAmount(dollars: number): number {
  return toCents(dollars);
}
