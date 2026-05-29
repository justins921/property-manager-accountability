"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateVacancyDates } from "@/app/actions/vacancies";
import type { Vacancy } from "@/lib/types";

const FIELDS: { name: keyof Vacancy; label: string }[] = [
  { name: "actual_make_ready_date", label: "Make-ready completed" },
  { name: "date_listed", label: "Date listed" },
  { name: "date_applications_received", label: "Applications received" },
  { name: "date_lease_signed", label: "Lease signed" },
  { name: "actual_move_in_date", label: "Move-in date" },
];

export function MilestoneForm({ vacancy }: { vacancy: Vacancy }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setError(null);
    setSaved(false);
    setLoading(true);
    const result = await updateVacancyDates(formData);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vacancy_id" value={vacancy.id} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label className="label">{f.label}</label>
            <input
              name={f.name}
              type="date"
              className="input"
              defaultValue={(vacancy[f.name] as string | null) ?? ""}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Saving…" : "Save milestones"}
        </button>
        {saved ? (
          <span className="text-sm text-status-green">Saved.</span>
        ) : null}
        {error ? <span className="text-sm text-status-red">{error}</span> : null}
      </div>
    </form>
  );
}
