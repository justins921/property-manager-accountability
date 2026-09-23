"use client";

import { useState } from "react";
import { createVacancy } from "@/app/actions/vacancies";
import type { OrgMember, Property } from "@/lib/types";

export interface VacancyFormUnit {
  id: string;
  property_id: string;
  label: string;
}

export interface VacancyFormDefaults {
  propertyId?: string;
  unitId?: string;
  monthlyRent?: string;
  moveOutDate?: string;
}

export function NewVacancyForm({
  properties,
  managers,
  units = [],
  defaults = {},
}: {
  properties: Property[];
  managers: OrgMember[];
  units?: VacancyFormUnit[];
  defaults?: VacancyFormDefaults;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [propertyId, setPropertyId] = useState(defaults.propertyId ?? "");
  const [unitId, setUnitId] = useState(defaults.unitId ?? "");
  const propertyUnits = units.filter((u) => u.property_id === propertyId);
  const defaultManager =
    properties.find((p) => p.id === propertyId)?.manager_id ?? "";

  async function action(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await createVacancy(formData);
    // On success the action redirects; we only get here on error.
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <form action={action} className="space-y-6">
      <div className="card space-y-4 p-6">
        <h2 className="text-base font-semibold text-slate-900">Unit details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Property</label>
            <select
              name="property_id"
              required
              className="input"
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setUnitId("");
              }}
            >
              <option value="" disabled>
                Select a property…
              </option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Responsible property manager</label>
            <select
              key={propertyId}
              name="manager_id"
              className="input"
              defaultValue={defaultManager}
            >
              <option value="">Unassigned</option>
              {managers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name || m.profile?.email}
                </option>
              ))}
            </select>
          </div>
          {propertyUnits.length > 0 ? (
            <div>
              <label className="label">Unit</label>
              <select
                name="unit_id"
                className="input"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                <option value="">Not listed (type a unit number)</option>
                {propertyUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!unitId ? (
            <div>
              <label className="label">Unit number</label>
              <input name="unit_number" required className="input" placeholder="205" />
            </div>
          ) : null}
          <div>
            <label className="label">Monthly rent ($)</label>
            <input
              name="monthly_rent"
              type="number"
              min="0"
              step="0.01"
              required
              className="input"
              placeholder="1500"
              defaultValue={defaults.monthlyRent}
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            The commitments
          </h2>
          <p className="text-sm text-slate-500">
            These are the promises the timeline will be measured against.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateInput
            name="move_out_date"
            label="Move-out date"
            defaultValue={defaults.moveOutDate}
          />
          <DateInput
            name="expected_make_ready_date"
            label="Expected make-ready completion"
          />
          <DateInput name="expected_listing_date" label="Expected listing date" />
          <DateInput
            name="expected_lease_signing_date"
            label="Expected lease signing"
          />
          <DateInput name="expected_move_in_date" label="Expected move-in date" />
        </div>
      </div>

      {error ? <p className="text-sm text-status-red">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <a href="/vacancies" className="btn-secondary">
          Cancel
        </a>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create vacancy & start timer"}
        </button>
      </div>
    </form>
  );
}

function DateInput({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        name={name}
        type="date"
        required
        className="input"
        defaultValue={defaultValue}
      />
    </div>
  );
}
