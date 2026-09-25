import Stripe from "stripe";
import type { createAdminClient } from "./supabase/admin";

// ============================================================================
// Stripe (server only). Rent goes straight to each organization's own Stripe
// account via Stripe Connect: every call that touches a tenant's money passes
// `{ stripeAccount }`. Card and bank details are entered on Stripe's hosted
// Checkout page; the app only ever stores Stripe IDs and a display label.
// ============================================================================

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Online payments aren't configured (STRIPE_SECRET_KEY is missing).");
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
      appInfo: { name: "property-management" },
      // Only set in local testing, to point at a fake Stripe server.
      ...(process.env.STRIPE_API_HOST
        ? {
            host: process.env.STRIPE_API_HOST,
            port: Number(process.env.STRIPE_API_PORT ?? 443),
            protocol: (process.env.STRIPE_API_PROTOCOL as "http" | "https") ?? "https",
          }
        : {}),
    });
  }
  return client;
}

/** "Visa •••• 4242" / "Chase •••• 6789" — safe to store and show. */
export function paymentMethodLabel(pm: Stripe.PaymentMethod | null | undefined): string {
  if (!pm) return "Saved payment method";
  if (pm.type === "card" && pm.card) {
    const brand = pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1);
    return `${brand} •••• ${pm.card.last4}`;
  }
  if (pm.type === "us_bank_account" && pm.us_bank_account) {
    return `${pm.us_bank_account.bank_name ?? "Bank account"} •••• ${pm.us_bank_account.last4 ?? ""}`.trim();
  }
  return "Saved payment method";
}

/** Our ledger's payment_method for a Stripe payment method type. */
export function ledgerMethod(pm: Stripe.PaymentMethod | null | undefined): "card" | "ach" | "other" {
  if (pm?.type === "card") return "card";
  if (pm?.type === "us_bank_account") return "ach";
  return "other";
}

export function siteUrl(path = ""): string {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}${path}`;
}

/**
 * Re-read the org's Stripe account and store whether it can take payments.
 * Called when an owner returns from Stripe onboarding (the account.updated
 * webhook keeps it current after that).
 */
export async function refreshStripeAccount(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  accountId: string,
): Promise<boolean> {
  const account = await getStripe().accounts.retrieve(accountId);
  const enabled = account.charges_enabled ?? false;
  await db.from("organizations").update({ stripe_charges_enabled: enabled }).eq("id", orgId);
  return enabled;
}
