"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  sendPaymentLink,
  startStripeConnect,
  turnOffAutopay,
  voidPaymentLink,
} from "@/app/actions/payments";
import { FormMessages, useAction } from "./use-action";

/** Owner-only: open Stripe's onboarding to connect the portfolio's bank. */
export function ConnectStripeButton({ label = "Set up online payments" }: { label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={async () => {
          setError(null);
          setPending(true);
          const result = await startStripeConnect();
          if ("url" in result && result.url) {
            window.location.href = result.url;
            return;
          }
          setError(("error" in result && result.error) || "Couldn't start Stripe setup.");
          setPending(false);
        }}
      >
        {pending ? "Opening Stripe…" : label}
      </button>
      <FormMessages error={error} message={null} />
    </div>
  );
}

/** Send a pay link (for an amount) or an autopay setup link to the tenant. */
export function SendPayLinkForm({
  leaseId,
  balance,
  autopayOn,
}: {
  leaseId: string;
  balance: number;
  autopayOn: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { run, error, message, pending } = useAction(async (fd: FormData) => {
    setUrl(null);
    setCopied(false);
    const result = await sendPaymentLink(fd);
    if ("url" in result && result.url) setUrl(result.url);
    return result;
  });

  return (
    <div className="space-y-4">
      <form action={(fd) => run(fd)} className="space-y-3">
        <input type="hidden" name="lease_id" value={leaseId} />
        <input type="hidden" name="kind" value="payment" />
        <div>
          <label className="label">Amount ($)</label>
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            className="input"
            defaultValue={balance > 0 ? balance.toFixed(2) : ""}
            placeholder="0.00"
          />
          <p className="mt-1 text-xs text-slate-400">Defaults to what&rsquo;s owed today.</p>
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send payment link"}
        </button>
      </form>
      {!autopayOn ? (
        <form action={(fd) => run(fd)}>
          <input type="hidden" name="lease_id" value={leaseId} />
          <input type="hidden" name="kind" value="autopay" />
          <button type="submit" className="btn-secondary" disabled={pending}>
            Send autopay setup link
          </button>
        </form>
      ) : null}
      <FormMessages error={error} message={message} />
      {url ? (
        <div className="flex items-center gap-2">
          <input readOnly value={url} className="input" onFocus={(e) => e.target.select()} />
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function VoidLinkButton({ linkId }: { linkId: string }) {
  const { run, error, pending } = useAction(voidPaymentLink);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className="text-xs font-medium text-slate-400 hover:text-status-red"
        disabled={pending}
        onClick={() => {
          if (confirm("Cancel this link? The tenant won't be able to use it.")) run(linkId);
        }}
      >
        Cancel link
      </button>
      <FormMessages error={error} message={null} />
    </span>
  );
}

export function TurnOffAutopayButton({ leaseId }: { leaseId: string }) {
  const router = useRouter();
  const { run, error, pending } = useAction(turnOffAutopay, { onSuccess: () => router.refresh() });
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className="text-sm font-medium text-slate-500 hover:text-status-red"
        disabled={pending}
        onClick={() => {
          if (confirm("Turn off autopay? The tenant will need a new autopay link to turn it back on.")) {
            run(leaseId);
          }
        }}
      >
        Turn off autopay
      </button>
      <FormMessages error={error} message={null} />
    </span>
  );
}
