"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upsertSchedule } from "@/app/actions/inspections-routine";
import {
  FREQUENCY_LABELS,
  type InspectionSchedule,
  type OrgMember,
} from "@/lib/types";

export function InspectionScheduleForm({
  propertyId,
  managers,
  schedule,
}: {
  propertyId: string;
  managers: OrgMember[];
  schedule: InspectionSchedule | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function action(formData: FormData) {
    setError(null);
    setSaved(false);
    setLoading(true);
    const result = await upsertSchedule(formData);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Frequency</label>
          <select
            name="frequency"
            className="input"
            defaultValue={schedule?.frequency ?? "monthly"}
          >
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Responsible manager</label>
          <select
            name="manager_id"
            className="input"
            defaultValue={schedule?.manager_id ?? ""}
          >
            <option value="">Unassigned</option>
            {managers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile?.full_name || m.profile?.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Start / anchor date</label>
          <input
            name="anchor_date"
            type="date"
            className="input"
            defaultValue={schedule?.anchor_date ?? today}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="active"
              defaultChecked={schedule?.active ?? true}
              className="h-4 w-4 rounded border-slate-300"
            />
            Active (auto-generate inspections)
          </label>
        </div>
      </div>
      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Saving…" : schedule ? "Update schedule" : "Set schedule"}
        </button>
        {saved ? <span className="text-sm text-status-green">Saved.</span> : null}
      </div>
    </form>
  );
}
