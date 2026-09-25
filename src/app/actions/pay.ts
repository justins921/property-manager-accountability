"use server";

import { redirect } from "next/navigation";
import { ensureCustomer, stripeAmount } from "@/lib/online-payments";
import { loadPayLink, payLinkUsable } from "@/lib/pay-links";
import { getStripe, siteUrl } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantName, unitLabel } from "@/lib/utils";

/**
 * Public action behind the pay page's button (no login; the link token is
 * the credential). Creates a Stripe Checkout Session on the organization's
 * own Stripe account and sends the tenant there. Card and bank details are
 * entered on Stripe's page and never touch this app.
 */
export async function startCheckout(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const wantsAutopay = formData.get("autopay") === "1";
  const link = await loadPayLink(token);
  if (!link || !link.lease || !link.org || !payLinkUsable(link)) {
    redirect(`/pay/${encodeURIComponent(token)}`);
  }
  const accountId = link.org.stripe_account_id!;
  const lease = link.lease;
  const primary =
    lease.lease_tenants.find((lt) => lt.is_primary)?.tenant ?? lease.lease_tenants[0]?.tenant ?? null;

  const db = createAdminClient();
  const customer = await ensureCustomer(db, accountId, lease, {
    name: primary ? tenantName(primary) : unitLabel(lease.unit, lease.property),
    email: primary?.email ?? null,
  });

  const place = unitLabel(lease.unit, lease.property);
  const metadata = {
    org_id: link.org.id,
    lease_id: lease.id,
    link_id: link.id,
    autopay: link.kind === "autopay" || wantsAutopay ? "1" : "0",
  };
  const returnUrl = siteUrl(`/pay/${token}?session_id={CHECKOUT_SESSION_ID}`);
  const stripe = getStripe();

  const session =
    link.kind === "autopay"
      ? await stripe.checkout.sessions.create(
          {
            mode: "setup",
            currency: "usd",
            customer,
            payment_method_types: ["us_bank_account", "card"],
            setup_intent_data: { metadata: { ...metadata, kind: "autopay_setup" } },
            metadata,
            success_url: returnUrl,
            cancel_url: siteUrl(`/pay/${token}`),
          },
          { stripeAccount: accountId },
        )
      : await stripe.checkout.sessions.create(
          {
            mode: "payment",
            customer,
            payment_method_types: ["us_bank_account", "card"],
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: stripeAmount(Number(link.amount)),
                  product_data: { name: `Rent · ${place}` },
                },
              },
            ],
            payment_intent_data: {
              metadata: { ...metadata, kind: "pay_link" },
              ...(wantsAutopay ? { setup_future_usage: "off_session" as const } : {}),
            },
            metadata,
            success_url: returnUrl,
            cancel_url: siteUrl(`/pay/${token}`),
          },
          { stripeAccount: accountId },
        );

  await db
    .from("payment_links")
    .update({ stripe_session_id: session.id, status: "open" })
    .eq("id", link.id);
  redirect(session.url!);
}
