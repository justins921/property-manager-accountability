import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  applyCheckoutSession,
  applyPaymentIntent,
  orgForAccount,
} from "@/lib/online-payments";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Stripe Connect webhook. Configure it in Stripe as a *Connect* endpoint
 * ("events on connected accounts") pointing at /api/stripe/webhook, with:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.async_payment_failed, payment_intent.succeeded,
 *   payment_intent.processing, payment_intent.payment_failed, account.updated
 * Every event is signature-checked, then re-read from Stripe before it
 * changes anything, so a forged or replayed body can't move money.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured() || !secret) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = createAdminClient();
  const accountId = event.account;
  if (!accountId || !(await orgForAccount(db, accountId))) {
    // Not one of our connected accounts (or a platform event): acknowledge.
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
        await applyCheckoutSession(db, accountId, event.data.object.id);
        break;
      case "payment_intent.succeeded":
      case "payment_intent.processing":
      case "payment_intent.payment_failed":
        await applyPaymentIntent(db, accountId, event.data.object.id);
        break;
      case "account.updated":
        await db
          .from("organizations")
          .update({ stripe_charges_enabled: event.data.object.charges_enabled ?? false })
          .eq("stripe_account_id", accountId);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe webhook]", event.type, err);
    // 500 makes Stripe retry later; every handler is idempotent.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
