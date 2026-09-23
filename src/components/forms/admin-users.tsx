"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  adminAddUserToOrg,
  adminChangeRole,
  adminRemoveFromOrg,
} from "@/app/actions/admin-users";
import type { MemberRole } from "@/lib/types";

type Result = { error?: string; message?: string } | undefined;

export function AdminAddUserForm({
  orgs,
}: {
  orgs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setError(null);
    setMessage(null);
    setLoading(true);
    const result = (await adminAddUserToOrg(formData)) as Result;
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setMessage(result?.message ?? "User added.");
    router.refresh();
  }

  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="text-base font-semibold text-slate-900">
        Add a user to an organization
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className="label">Full name</label>
          <input name="full_name" className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label">Organization</label>
          <select name="org_id" required className="input" defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
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
        {loading ? "Adding…" : "Add user"}
      </button>
    </form>
  );
}

export function MembershipControls({
  orgId,
  userId,
  role,
}: {
  orgId: string;
  userId: string;
  role: MemberRole;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: (fd: FormData) => Promise<unknown>, extra = {}) {
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.set("org_id", orgId);
    fd.set("user_id", userId);
    for (const [k, v] of Object.entries(extra)) fd.set(k, String(v));
    const result = (await fn(fd)) as Result;
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label="Role"
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
        value={role}
        disabled={busy}
        onChange={(e) => run(adminChangeRole, { role: e.target.value })}
      >
        <option value="owner">Owner</option>
        <option value="manager">Manager</option>
      </select>
      <button
        type="button"
        disabled={busy}
        className="text-xs font-medium text-slate-400 hover:text-status-red"
        onClick={() => {
          if (confirm("Remove this user from the organization?")) {
            run(adminRemoveFromOrg);
          }
        }}
      >
        Remove
      </button>
      {error ? <span className="text-xs text-status-red">{error}</span> : null}
    </span>
  );
}
