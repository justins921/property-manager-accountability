"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inviteManager } from "@/app/actions/team";

export function InviteForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setError(null);
    setMessage(null);
    setLoading(true);
    const result = await inviteManager(formData);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setMessage("Invitation sent / member added.");
    router.refresh();
  }

  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="text-base font-semibold text-slate-900">
        Invite a team member
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Full name</label>
          <input name="full_name" className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label">Role</label>
          <select name="role" className="input" defaultValue="manager">
            <option value="manager">Property manager</option>
            <option value="owner">Owner</option>
          </select>
        </div>
      </div>
      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      {message ? <p className="text-sm text-status-green">{message}</p> : null}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}
