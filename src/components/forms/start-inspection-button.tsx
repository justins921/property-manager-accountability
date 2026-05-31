"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createAdHocInspection } from "@/app/actions/inspections-routine";
import {
  FREQUENCY_LABELS,
  type InspectionTemplate,
  type Property,
} from "@/lib/types";

export function StartInspectionButton({
  properties,
  templates,
}: {
  properties: Property[];
  templates: InspectionTemplate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ready = properties.length > 0 && templates.length > 0;

  async function action(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await createAdHocInspection(formData);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.id) {
      router.push(`/inspections/${result.id}`);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        + Start an inspection
      </button>
    );
  }

  if (!ready) {
    return (
      <div className="card p-4 text-sm text-slate-600">
        You need at least one property and one{" "}
        <Link href="/inspections/templates" className="font-semibold text-brand-600">
          template
        </Link>{" "}
        before starting an inspection.
        <button
          onClick={() => setOpen(false)}
          className="ml-2 text-slate-400 hover:underline"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-3 p-4">
      <h2 className="text-base font-semibold text-slate-900">Start an inspection</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Property</label>
          <select name="property_id" required className="input" defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Template</label>
          <select name="template_id" required className="input" defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({FREQUENCY_LABELS[t.frequency]})
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Starting…" : "Start now"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
