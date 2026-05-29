"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDelayExplanation } from "@/app/actions/vacancies";
import { DEADLINE_LABELS, DELAY_REASON_LABELS } from "@/lib/types";

export function DelayForm({ vacancyId }: { vacancyId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function action(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await addDelayExplanation(formData);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        + Log a delay explanation
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-slate-200 p-4">
      <input type="hidden" name="vacancy_id" value={vacancyId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Missed deadline</label>
          <select name="deadline_type" required className="input" defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {Object.entries(DEADLINE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Reason</label>
          <select name="reason" required className="input" defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {Object.entries(DELAY_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Notes (optional)</label>
        <textarea name="notes" rows={2} className="input" />
      </div>
      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Saving…" : "Save explanation"}
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
