"use client";

import { useRef, useState } from "react";
import { addLedgerEntry, deleteLease, endLease } from "@/app/actions/leases";
import { dateKey } from "@/lib/calculations";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/types";
import { FormMessages, useAction } from "./use-action";

type ManualType = "payment" | "credit" | "charge" | "deposit";

const TYPE_OPTIONS: { value: ManualType; label: string; hint: string }[] = [
  { value: "payment", label: "Payment received", hint: "Cash, check, Zelle, etc." },
  { value: "credit", label: "Credit", hint: "Lowers what the tenant owes (concession, correction)." },
  { value: "charge", label: "Charge", hint: "Raises what the tenant owes (bounced check, utility, damage)." },
  { value: "deposit", label: "Deposit received", hint: "Held separately. Doesn't change the rent balance." },
];

/** Record a payment, credit, one-off charge, or deposit received. */
export function LedgerEntryForm({ leaseId }: { leaseId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<ManualType>("payment");
  const { run, error, message, pending } = useAction(addLedgerEntry, {
    success: "Recorded.",
    onSuccess: () => formRef.current?.reset(),
  });
  const takesMethod = type === "payment" || type === "deposit";
  const hint = TYPE_OPTIONS.find((o) => o.value === type)?.hint;

  return (
    <form ref={formRef} action={(fd) => run(fd)} className="space-y-4">
      <input type="hidden" name="lease_id" value={leaseId} />
      <div>
        <label className="label">Type</label>
        <select
          name="type"
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value as ManualType)}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount ($)</label>
          <input name="amount" type="number" min="0.01" step="0.01" required className="input" />
        </div>
        <div>
          <label className="label">Date</label>
          <input name="entry_date" type="date" required className="input" defaultValue={dateKey(new Date())} />
        </div>
      </div>
      {takesMethod ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Method</label>
            <select name="payment_method" className="input" defaultValue="" required={type === "payment"}>
              <option value="" disabled>
                Choose…
              </option>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Reference</label>
            <input name="reference" className="input" placeholder="Check #" />
          </div>
        </div>
      ) : null}
      <div>
        <label className="label">Memo{takesMethod ? " (optional)" : ""}</label>
        <input name="memo" className="input" required={!takesMethod} />
      </div>
      <FormMessages error={error} message={message} />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Record entry"}
      </button>
      <p className="text-xs text-slate-400">
        Entries can&rsquo;t be edited or deleted. Fix a mistake with an
        offsetting entry.
      </p>
    </form>
  );
}

/** End a lease on schedule or terminate it early. */
export function EndLeaseForm({ leaseId }: { leaseId: string }) {
  const { run, error, pending } = useAction(endLease);
  return (
    <form
      action={(fd) => {
        if (confirm("End this lease? Automatic rent stops after the end date.")) run(fd);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="lease_id" value={leaseId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Move-out / end date</label>
          <input name="ended_on" type="date" required className="input" defaultValue={dateKey(new Date())} />
        </div>
        <div>
          <label className="label">How it ended</label>
          <select name="kind" className="input" defaultValue="ended">
            <option value="ended">Ended (moved out)</option>
            <option value="terminated">Terminated early</option>
          </select>
        </div>
      </div>
      <FormMessages error={error} message={null} />
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? "Saving…" : "End lease"}
      </button>
    </form>
  );
}

export function DeleteLeaseButton({ leaseId }: { leaseId: string }) {
  const { run, error, pending } = useAction(deleteLease);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-sm font-medium text-slate-400 hover:text-status-red"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this lease and its entire ledger? This can't be undone.")) {
            run(leaseId);
          }
        }}
      >
        {pending ? "Deleting…" : "Delete lease"}
      </button>
      <FormMessages error={error} message={null} />
    </div>
  );
}
