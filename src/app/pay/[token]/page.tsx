import { applyCheckoutSession } from "@/lib/online-payments";
import { loadPayLink, payLinkUsable } from "@/lib/pay-links";
import { startCheckout } from "@/app/actions/pay";
import { stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency, formatDate, unitLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay rent", robots: { index: false } };

/**
 * Public pay page (no tenant login). Shows the amount and sends the tenant to
 * Stripe's hosted payment page. When they come back, the session is applied
 * right away (the webhook does the same thing; both are idempotent).
 */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { token } = await params;
  const { session_id } = await searchParams;
  let link = await loadPayLink(token);

  if (
    link?.org?.stripe_account_id &&
    session_id &&
    link.stripe_session_id === session_id &&
    stripeConfigured()
  ) {
    try {
      await applyCheckoutSession(createAdminClient(), link.org.stripe_account_id, session_id);
    } catch (err) {
      console.error("[pay] applying checkout session", err);
    }
    link = await loadPayLink(token);
  }

  const place = link?.lease ? unitLabel(link.lease.unit, link.lease.property) : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
            {link?.org?.name ?? "Rent payment"}
          </p>
          {place ? <p className="mt-1 text-slate-600">{place}</p> : null}
        </div>
        <div className="card space-y-5 p-6">
          <PayBody link={link} token={token} returned={!!session_id} />
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Payments are processed securely by Stripe. Your card and bank
          details are never stored by this site.
        </p>
      </div>
    </div>
  );
}

function PayBody({
  link,
  token,
  returned,
}: {
  link: Awaited<ReturnType<typeof loadPayLink>>;
  token: string;
  returned: boolean;
}) {
  if (!link || !link.lease) {
    return <Message title="Link not found" body="Check the link in your email, or ask your property manager for a new one." />;
  }
  if (link.status === "paid") {
    return link.kind === "autopay" ? (
      <Message
        title="Autopay is set up"
        body={`Rent will be charged automatically on each due date${
          link.lease.autopay_method_label ? ` to ${link.lease.autopay_method_label}` : ""
        }. Thank you!`}
        good
      />
    ) : (
      <Message
        title="Payment received"
        body={`We received your payment of ${formatCurrency(Number(link.amount), true)}${
          link.paid_at ? ` on ${formatDate(link.paid_at.slice(0, 10))}` : ""
        }. Thank you!`}
        good
      />
    );
  }
  if (link.status === "processing") {
    return (
      <Message
        title="Bank payment processing"
        body="Your bank payment was submitted. Bank transfers usually take 3 to 5 business days to finish. You don't need to do anything else."
        good
      />
    );
  }
  if (returned && link.status === "open") {
    return <Message title="Confirming your payment" body="This can take a moment. Refresh the page in a few seconds." />;
  }
  if (!payLinkUsable(link)) {
    return <Message title="This link isn't active" body="It was cancelled, replaced by a newer link, or has expired. Ask your property manager for a new one." />;
  }

  return (
    <form action={startCheckout} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      {link.status === "failed" ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Your last payment didn&rsquo;t go through. You can try again with a different method.
        </p>
      ) : null}
      {link.kind === "autopay" ? (
        <div>
          <h1 className="text-xl font-bold text-slate-900">Set up automatic rent payments</h1>
          <p className="mt-2 text-sm text-slate-600">
            Save a bank account or card. Rent of {formatCurrency(link.lease.monthly_rent, true)} is
            charged automatically on each due date. Your property manager can turn it off anytime.
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-sm text-slate-500">Amount due</p>
            <p className="text-4xl font-bold tracking-tight text-slate-900">
              {formatCurrency(Number(link.amount), true)}
            </p>
          </div>
          {!link.lease.autopay_enabled ? (
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" name="autopay" value="1" className="mt-1 h-4 w-4" />
              <span>
                Use this payment method for automatic rent each month. It&rsquo;s charged on the
                due date, and your property manager can turn it off anytime.
              </span>
            </label>
          ) : null}
        </>
      )}
      <button type="submit" className="btn-primary w-full py-3 text-base">
        {link.kind === "autopay" ? "Continue to set up autopay" : "Continue to secure payment"}
      </button>
      <p className="text-center text-xs text-slate-400">Bank account (ACH) or card</p>
    </form>
  );
}

function Message({ title, body, good }: { title: string; body: string; good?: boolean }) {
  return (
    <div className="text-center">
      <h1 className={good ? "text-xl font-bold text-status-green" : "text-xl font-bold text-slate-900"}>{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}
