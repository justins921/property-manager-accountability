"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addSchedule, removeSchedule } from "@/app/actions/inspections-routine";
import { formatDate } from "@/lib/utils";
import {
  FREQUENCY_LABELS,
  type InspectionSchedule,
  type InspectionTemplate,
  type OrgMember,
} from "@/lib/types";

type ScheduleWithTemplate = InspectionSchedule & {
  template: InspectionTemplate | null;
};

export function PropertySchedules({
  propertyId,
  managers,
  templates,
  schedules,
}: {
  propertyId: string;
  managers: OrgMember[];
  templates: InspectionTemplate[];
  schedules: ScheduleWithTemplate[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function add(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await addSchedule(formData);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    router.refresh();
  }

  async function remove(id: string) {
    await removeSchedule(id, propertyId);
    router.refresh();
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Create an{" "}
        <Link
          href="/inspections/templates/new"
          className="font-semibold text-brand-600"
        >
          inspection template
        </Link>{" "}
        first, then schedule it here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {schedules.length > 0 ? (
        <ul className="space-y-2">
          {schedules.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {s.template?.name ?? "Inspection"}
                </p>
                <p className="text-xs text-slate-500">
                  {FREQUENCY_LABELS[s.frequency]} · next due{" "}
                  {formatDate(s.next_due_date)}
                  {s.active ? "" : " · paused"}
                </p>
              </div>
              <button
                onClick={() => remove(s.id)}
                className="text-xs font-semibold text-slate-400 hover:text-status-red"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <form
          action={add}
          className="space-y-3 rounded-lg border border-slate-200 p-3"
        >
          <input type="hidden" name="property_id" value={propertyId} />
          <div>
            <label className="label">Template</label>
            <select name="template_id" required className="input" defaultValue="">
              <option value="" disabled>
                Choose a template…
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({FREQUENCY_LABELS[t.frequency]})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Responsible manager</label>
              <select name="manager_id" className="input" defaultValue="">
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
                defaultValue={today}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="active"
              defaultChecked
              className="h-4 w-4 rounded border-slate-300"
            />
            Active (auto-generate inspections)
          </label>
          {error ? <p className="text-sm text-status-red">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Saving…" : "Add schedule"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-secondary">
          + Add inspection schedule
        </button>
      )}
    </div>
  );
}
