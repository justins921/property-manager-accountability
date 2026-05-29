"use client";

import { useState } from "react";
import { createOrganization } from "@/app/actions/org";

export function OnboardingForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await createOrganization(formData);
    // On success the action redirects; we only reach here on error.
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          Organization / portfolio name
        </label>
        <input
          id="name"
          name="name"
          required
          className="input"
          placeholder="e.g. Sobojinski Holdings"
        />
      </div>
      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? "Creating…" : "Create portfolio"}
      </button>
      <p className="text-center text-xs text-slate-400">
        You&rsquo;ll be the owner. You can invite property managers next.
      </p>
    </form>
  );
}
