"use client";

import { useMemo, useState } from "react";
import { createLease } from "@/app/actions/leases";
import {
  dateKey,
  nextDueDateOnOrAfter,
  suggestedProration,
} from "@/lib/calculations";
import type { Tenant } from "@/lib/types";
import { formatCurrency, formatDate, tenantName } from "@/lib/utils";

export interface LeaseFormUnit {
  id: string;
  label: string;
  occupied: boolean;
}

export interface LeaseFormDefaults {
  unitId?: string;
  vacancyId?: string;
  tenantId?: string;
  monthlyRent?: number;
  startDate?: string;
}

export function LeaseForm({
  units,
  tenants,
  defaults = {},
}: {
  units: LeaseFormUnit[];
  tenants: Tenant[];
  defaults?: LeaseFormDefaults;
}) {
  const today = dateKey(new Date());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState(defaults.startDate ?? today);
  const [rent, setRent] = useState(defaults.monthlyRent ? String(defaults.monthlyRent) : "");
  const [dueDay, setDueDay] = useState("1");
  const [billingOverride, setBillingOverride] = useState<string | null>(null);
  const [prorateOverride, setProrateOverride] = useState<string | null>(null);

  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const dueDayNum = Math.min(28, Math.max(1, Number(dueDay) || 1));
  const suggestedBilling = validStart
    ? nextDueDateOnOrAfter(startDate > today ? startDate : today, dueDayNum)
    : "";
  const billingStart = billingOverride ?? suggestedBilling;
  const isNewMoveIn = validStart && startDate >= today;

  const suggestedProrate = useMemo(() => {
    const r = Number(rent);
    if (!isNewMoveIn || !(r > 0) || !billingStart) return 0;
    return suggestedProration(r, startDate, billingStart);
  }, [rent, startDate, billingStart, isNewMoveIn]);
  const prorate = prorateOverride ?? (suggestedProrate > 0 ? suggestedProrate.toFixed(2) : "");

  async function action(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await createLease(formData);
    // On success the action redirects; we only get here on error.
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <form action={action} className="space-y-6">
      {defaults.vacancyId ? (
        <input type="hidden" name="vacancy_id" value={defaults.vacancyId} />
      ) : null}

      <div className="card space-y-4 p-6">
        <h2 className="text-base font-semibold text-slate-900">Unit</h2>
        <select
          name="unit_id"
          required
          className="input"
          defaultValue={defaults.unitId ?? ""}
        >
          <option value="" disabled>
            Select a unit…
          </option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
              {u.occupied ? " (has an active lease)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="card space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Tenants</h2>
          <p className="text-sm text-slate-500">
            Pick everyone on the lease. The first one listed is the primary tenant.
          </p>
        </div>
        {tenants.length > 0 ? (
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {tenants.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="tenant_ids"
                  value={t.id}
                  defaultChecked={t.id === defaults.tenantId}
                />
                {tenantName(t)}
                {t.email ? <span className="text-slate-400">· {t.email}</span> : null}
              </label>
            ))}
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            {tenants.length > 0 ? "Or add a new tenant" : "Add the tenant"}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <input name="new_first_name" className="input" placeholder="First name" />
            <input name="new_last_name" className="input" placeholder="Last name" />
            <input name="new_email" type="email" className="input" placeholder="Email" />
            <input name="new_phone" type="tel" className="input" placeholder="Phone" />
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-base font-semibold text-slate-900">Terms</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Start date</label>
            <input
              name="start_date"
              type="date"
              required
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">End date</label>
            <input name="end_date" type="date" className="input" />
            <p className="mt-1 text-xs text-slate-400">Leave blank for month-to-month.</p>
          </div>
          <div>
            <label className="label">Monthly rent ($)</label>
            <input
              name="monthly_rent"
              type="number"
              min="0"
              step="0.01"
              required
              className="input"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Rent due day</label>
            <input
              name="rent_due_day"
              type="number"
              min="1"
              max="28"
              required
              className="input"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Late fee ($)</label>
            <input name="late_fee_amount" type="number" min="0" step="0.01" className="input" placeholder="0" />
            <p className="mt-1 text-xs text-slate-400">Flat fee. Leave blank for none.</p>
          </div>
          <div>
            <label className="label">Grace period (days)</label>
            <input name="late_fee_grace_days" type="number" min="0" max="27" defaultValue="5" className="input" />
          </div>
          <div>
            <label className="label">Security deposit ($)</label>
            <input name="security_deposit" type="number" min="0" step="0.01" className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Deposit collected so far ($)</label>
            <input name="deposit_collected" type="number" min="0" step="0.01" className="input" placeholder="0" />
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Rent charges</h2>
          <p className="text-sm text-slate-500">
            Rent posts to the ledger automatically on the due day each month,
            starting on the date below. Late fees post automatically after the
            grace period.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">First automatic rent charge</label>
            <input
              name="billing_start_date"
              type="date"
              required
              className="input"
              value={billingStart}
              onChange={(e) => setBillingOverride(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Prorated first month ($)</label>
            <input
              name="prorated_charge"
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={prorate}
              onChange={(e) => setProrateOverride(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              {suggestedProrate > 0
                ? `Suggested: ${formatCurrency(suggestedProrate, true)} for ${formatDate(startDate)} up to ${formatDate(billingStart)}.`
                : "For a mid-month move-in."}
            </p>
          </div>
          <div>
            <label className="label">Opening balance ($)</label>
            <input name="opening_balance" type="number" min="0" step="0.01" className="input" placeholder="0" />
            <p className="mt-1 text-xs text-slate-400">
              For an existing tenant: what they owe today, before automatic rent starts.
            </p>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-status-red">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <a href="/rent-roll" className="btn-secondary">
          Cancel
        </a>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create lease"}
        </button>
      </div>
    </form>
  );
}
