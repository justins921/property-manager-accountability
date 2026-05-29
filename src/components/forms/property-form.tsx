"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProperty } from "@/app/actions/properties";
import type { OrgMember } from "@/lib/types";

export function PropertyForm({ managers }: { managers: OrgMember[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await createProperty(formData);
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
      <button onClick={() => setOpen(true)} className="btn-primary">
        + Add property
      </button>
    );
  }

  return (
    <form
      action={action}
      className="card space-y-4 p-6"
    >
      <h2 className="text-base font-semibold text-slate-900">New property</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Property name</label>
          <input name="name" required className="input" placeholder="Maple Court" />
        </div>
        <div>
          <label className="label">Address (optional)</label>
          <input name="address" className="input" />
        </div>
        <div>
          <label className="label">Assigned manager (optional)</label>
          <select name="manager_id" className="input" defaultValue="">
            <option value="">Unassigned</option>
            {managers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile?.full_name || m.profile?.email}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Saving…" : "Save property"}
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
