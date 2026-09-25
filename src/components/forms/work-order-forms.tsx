"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  addWorkOrderMedia,
  advanceWorkOrder,
  createWorkOrder,
  deleteWorkOrder,
  resetRepairLink,
  updateWorkOrderDetails,
} from "@/app/actions/work-orders";
import { prepareRepairUploads, submitRepairRequest } from "@/app/actions/repair-request";
import { dateKey } from "@/lib/calculations";
import { createClient } from "@/lib/supabase/client";
import { WORK_ORDER_NEXT_ACTION, type WorkOrderStatus } from "@/lib/types";
import { FormMessages, useAction } from "./use-action";

// Same bucket and path scheme as Inspections: {org_id}/… in 'property-media'.
const BUCKET = "property-media";
const MAX_PHOTOS = 5;

/** Upload photos the same way inspection photos are uploaded. */
async function uploadPhotos(orgId: string, workOrderId: string, files: File[]): Promise<string[]> {
  const supabase = createClient();
  const paths: string[] = [];
  for (const file of files.slice(0, MAX_PHOTOS)) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${orgId}/work-orders/${workOrderId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    paths.push(path);
  }
  return paths;
}

function PhotoInput({ onChange }: { onChange: (files: File[]) => void }) {
  return (
    <div>
      <label className="label">Photos (up to {MAX_PHOTOS})</label>
      <input
        type="file"
        accept="image/*"
        multiple
        className="block w-full text-base text-slate-600 lg:text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
        onChange={(e) => onChange(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS))}
      />
    </div>
  );
}

export function NewWorkOrderForm({
  orgId,
  properties,
  units,
  defaults = {},
}: {
  orgId: string;
  properties: { id: string; name: string }[];
  units: { id: string; property_id: string; label: string }[];
  defaults?: { propertyId?: string; unitId?: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!defaults.propertyId);
  const [propertyId, setPropertyId] = useState(defaults.propertyId ?? properties[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const propertyUnits = units.filter((u) => u.property_id === propertyId);

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New work order
      </button>
    );
  }

  async function action(fd: FormData) {
    setError(null);
    setPending(true);
    const result = await createWorkOrder(fd);
    if (!("id" in result) || !result.id) {
      setError(("error" in result && result.error) || "Could not create the work order.");
      setPending(false);
      return;
    }
    try {
      if (files.length) {
        const paths = await uploadPhotos(orgId, result.id, files);
        const attached = await addWorkOrderMedia(result.id, paths);
        if (attached && "error" in attached && attached.error) throw new Error(attached.error);
      }
    } catch (err) {
      // The work order exists; photos can be added from its page.
      console.error(err);
    }
    router.push(`/work-orders/${result.id}`);
  }

  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="text-base font-semibold text-slate-900">New work order</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Property</label>
          <select
            name="property_id"
            required
            className="input"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Unit</label>
          <select key={propertyId} name="unit_id" className="input" defaultValue={defaults.unitId ?? ""}>
            <option value="">Common area / whole property</option>
            {propertyUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">What needs fixing?</label>
        <input name="title" required className="input" placeholder="Kitchen faucet leaking" />
      </div>
      <div>
        <label className="label">Details</label>
        <textarea name="description" rows={3} className="input" />
      </div>
      <PhotoInput onChange={setFiles} />
      <FormMessages error={error} message={null} />
      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Create work order"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The one forward action for the current status. */
export function AdvanceWorkOrderForm({
  workOrderId,
  status,
  vendors,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
  vendors: { name: string; phone: string | null }[];
}) {
  const [vendorPhone, setVendorPhone] = useState("");
  const { run, error, pending } = useAction(advanceWorkOrder);
  const label = WORK_ORDER_NEXT_ACTION[status];
  if (!label) return null;

  return (
    <form action={(fd) => run(fd)} className="space-y-3">
      <input type="hidden" name="work_order_id" value={workOrderId} />
      {status === "new" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Vendor</label>
            <input
              name="vendor_name"
              required
              list="vendor-suggestions"
              className="input"
              placeholder="ABC Plumbing"
              onChange={(e) => {
                const match = vendors.find((v) => v.name === e.target.value);
                if (match?.phone) setVendorPhone(match.phone);
              }}
            />
            <datalist id="vendor-suggestions">
              {vendors.map((v) => (
                <option key={v.name} value={v.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Vendor phone</label>
            <input
              name="vendor_phone"
              type="tel"
              className="input"
              value={vendorPhone}
              onChange={(e) => setVendorPhone(e.target.value)}
            />
          </div>
        </div>
      ) : null}
      {status === "in_progress" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Cost ($, optional)</label>
            <input name="cost" type="number" min="0" step="0.01" className="input" />
          </div>
          <div>
            <label className="label">Completed on</label>
            <input name="completed_on" type="date" className="input" defaultValue={dateKey(new Date())} />
          </div>
        </div>
      ) : null}
      <FormMessages error={error} message={null} />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
    </form>
  );
}

export function WorkOrderDetailsForm({
  workOrderId,
  vendorName,
  vendorPhone,
  cost,
}: {
  workOrderId: string;
  vendorName: string | null;
  vendorPhone: string | null;
  cost: number | null;
}) {
  const { run, error, message, pending } = useAction(updateWorkOrderDetails);
  return (
    <form action={(fd) => run(fd)} className="space-y-3">
      <input type="hidden" name="work_order_id" value={workOrderId} />
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="label">Vendor</label>
          <input name="vendor_name" className="input" defaultValue={vendorName ?? ""} />
        </div>
        <div>
          <label className="label">Vendor phone</label>
          <input name="vendor_phone" type="tel" className="input" defaultValue={vendorPhone ?? ""} />
        </div>
        <div>
          <label className="label">Cost ($)</label>
          <input name="cost" type="number" min="0" step="0.01" className="input" defaultValue={cost ?? ""} />
        </div>
      </div>
      <FormMessages error={error} message={message} />
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}

export function AddPhotosForm({ orgId, workOrderId }: { orgId: string; workOrderId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!files.length) return;
        setError(null);
        setPending(true);
        try {
          const paths = await uploadPhotos(orgId, workOrderId, files);
          const result = await addWorkOrderMedia(workOrderId, paths);
          if (result && "error" in result && result.error) throw new Error(result.error);
          formRef.current?.reset();
          setFiles([]);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed.");
        }
        setPending(false);
      }}
    >
      <PhotoInput onChange={setFiles} />
      <FormMessages error={error} message={null} />
      <button type="submit" className="btn-secondary" disabled={pending || !files.length}>
        {pending ? "Uploading…" : "Add photos"}
      </button>
    </form>
  );
}

export function DeleteWorkOrderButton({ workOrderId }: { workOrderId: string }) {
  const { run, error, pending } = useAction(deleteWorkOrder);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-sm font-medium text-slate-400 hover:text-status-red"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this work order and its photos?")) run(workOrderId);
        }}
      >
        Delete work order
      </button>
      <FormMessages error={error} message={null} />
    </div>
  );
}

/** A unit's repair-request link: copy it for the tenant, or replace it. */
export function RepairLinkBox({ unitId, url }: { unitId: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const { run, error, message, pending } = useAction(resetRepairLink);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input readOnly value={url} className="input" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button
        type="button"
        className="text-xs font-medium text-slate-400 hover:text-slate-700"
        disabled={pending}
        onClick={() => {
          if (confirm("Make a new link? The current one will stop working.")) run(unitId);
        }}
      >
        Replace link
      </button>
      <FormMessages error={error} message={message} />
    </div>
  );
}

/** Public tenant form (no login). */
export function TenantRepairForm({ token }: { token: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-status-green">Request sent</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your property manager has it and will be in touch. For an emergency like a
          gas leak, fire or flooding, call 911 or your emergency line right away.
        </p>
      </div>
    );
  }

  async function action(fd: FormData) {
    setError(null);
    setPending(true);
    try {
      const paths: string[] = [];
      if (files.length) {
        const prep = await prepareRepairUploads(token, files.map((f) => f.name));
        if (!("uploads" in prep) || !prep.uploads) throw new Error(("error" in prep && prep.error) || "Upload failed.");
        const supabase = createClient();
        for (const [i, up] of prep.uploads.entries()) {
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .uploadToSignedUrl(up.path, up.token, files[i]);
          if (upErr) throw new Error("A photo didn't upload. Try again, or send it without photos.");
          paths.push(up.path);
        }
      }
      const result = await submitRepairRequest(fd, paths);
      if (result && "error" in result && result.error) throw new Error(result.error);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your request.");
    }
    setPending(false);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-bold text-slate-900">Request a repair</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tell us what&rsquo;s wrong. A photo helps us send the right person.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Your name</label>
          <input name="name" required className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label">Phone or email</label>
          <input name="contact" required className="input" autoComplete="tel" />
        </div>
      </div>
      <div>
        <label className="label">What needs fixing?</label>
        <input name="title" required className="input" placeholder="Bathroom sink is leaking" />
      </div>
      <div>
        <label className="label">Details (optional)</label>
        <textarea name="description" rows={3} className="input" placeholder="When it started, where exactly, anything we should know" />
      </div>
      <PhotoInput onChange={setFiles} />
      <FormMessages error={error} message={null} />
      <button type="submit" className="btn-primary w-full py-3 text-base" disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
