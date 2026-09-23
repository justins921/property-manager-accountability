"use client";

import { useRef, useState } from "react";
import {
  createOwnerRequest,
  respondToOwnerRequest,
  withdrawOwnerRequest,
} from "@/app/actions/owner-requests";
import { OWNER_REQUEST_TYPE_LABELS, type OwnerRequestType } from "@/lib/types";
import { FormMessages, useAction } from "./use-action";

export function NewOwnerRequestForm({
  properties,
  defaults = {},
}: {
  properties: { id: string; name: string }[];
  defaults?: { propertyId?: string; vacancyId?: string };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<OwnerRequestType>("spending");
  const { run, error, message, pending } = useAction(createOwnerRequest, {
    success: "Sent. The owners have been emailed.",
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form ref={formRef} action={(fd) => run(fd)} className="card space-y-4 p-6">
      <h2 className="text-base font-semibold text-slate-900">Ask the owner</h2>
      {defaults.vacancyId ? (
        <input type="hidden" name="vacancy_id" value={defaults.vacancyId} />
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className="label">Type</label>
          <select
            name="type"
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as OwnerRequestType)}
          >
            {(Object.keys(OWNER_REQUEST_TYPE_LABELS) as OwnerRequestType[]).map((t) => (
              <option key={t} value={t}>
                {OWNER_REQUEST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">What do you need?</label>
          <input name="title" required className="input" placeholder="Replace water heater in Unit 4" />
        </div>
        <div>
          <label className="label">Property</label>
          <select name="property_id" className="input" defaultValue={defaults.propertyId ?? ""}>
            <option value="">Portfolio-wide</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Amount ($){type === "decision" ? " (optional)" : ""}</label>
          <input
            name="amount"
            type="number"
            min="0"
            step="0.01"
            className="input"
            required={type !== "decision"}
          />
        </div>
        <div>
          <label className="label">Need an answer by</label>
          <input name="due_by" type="date" required className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Details</label>
          <input name="details" className="input" placeholder="Quote from ABC Plumbing attached to the email thread." />
        </div>
      </div>
      <FormMessages error={error} message={message} />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}

/** Owner approve / decline controls for one pending request. */
export function RespondToRequest({ requestId }: { requestId: string }) {
  const [note, setNote] = useState("");
  const { run, error, pending } = useAction(respondToOwnerRequest);

  function respond(decision: "approved" | "declined") {
    const fd = new FormData();
    fd.set("request_id", requestId);
    fd.set("decision", decision);
    fd.set("response_note", note);
    run(fd);
  }

  return (
    <div className="space-y-2">
      <input
        className="input"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => respond("approved")}>
          Approve
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => respond("declined")}>
          Decline
        </button>
      </div>
      <FormMessages error={error} message={null} />
    </div>
  );
}

export function WithdrawRequestButton({ requestId }: { requestId: string }) {
  const { run, error, pending } = useAction(withdrawOwnerRequest);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        className="text-xs font-medium text-slate-400 hover:text-status-red"
        disabled={pending}
        onClick={() => {
          if (confirm("Withdraw this request?")) run(requestId);
        }}
      >
        Withdraw
      </button>
      <FormMessages error={error} message={null} />
    </span>
  );
}
