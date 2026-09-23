"use client";

import { useRouter } from "next/navigation";
import { createTenant, deleteTenant, updateTenant } from "@/app/actions/tenants";
import type { Tenant } from "@/lib/types";
import { FormMessages, useAction } from "./use-action";

/** Add a tenant (no `tenant`) or edit one. */
export function TenantForm({ tenant }: { tenant?: Tenant }) {
  const router = useRouter();
  const { run, error, message, pending } = useAction(
    async (fd: FormData) => {
      if (tenant) return updateTenant(fd);
      const result = await createTenant(fd);
      if ("id" in result && result.id) router.push(`/tenants/${result.id}`);
      return result;
    },
    { success: tenant ? "Saved." : undefined },
  );

  return (
    <form action={(fd) => run(fd)} className="space-y-4">
      {tenant ? <input type="hidden" name="tenant_id" value={tenant.id} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">First name</label>
          <input name="first_name" required className="input" defaultValue={tenant?.first_name} />
        </div>
        <div>
          <label className="label">Last name</label>
          <input name="last_name" required className="input" defaultValue={tenant?.last_name} />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" defaultValue={tenant?.email ?? ""} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" type="tel" className="input" defaultValue={tenant?.phone ?? ""} />
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea name="notes" rows={2} className="input" defaultValue={tenant?.notes ?? ""} />
      </div>
      <FormMessages error={error} message={message} />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : tenant ? "Save tenant" : "Add tenant"}
      </button>
    </form>
  );
}

export function DeleteTenantButton({ tenantId }: { tenantId: string }) {
  const { run, error, pending } = useAction(deleteTenant);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-sm font-medium text-slate-400 hover:text-status-red"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this tenant? This can't be undone.")) run(tenantId);
        }}
      >
        {pending ? "Deleting…" : "Delete tenant"}
      </button>
      <FormMessages error={error} message={null} />
    </div>
  );
}
