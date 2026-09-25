"use server";

import { z } from "zod";
import { sendReminderEmail } from "@/lib/email";
import { newRepairRequestBody, newRepairRequestSubject } from "@/lib/reminders";
import { siteUrl } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { unitLabel } from "@/lib/utils";

// Public tenant repair requests (no login). The unit's secret request token
// is the credential. Photos go into the same private 'property-media' bucket
// as everything else, through one-time signed upload URLs the server hands
// out, so the tenant never gets general storage access.

const BUCKET = "property-media";
const MAX_PHOTOS = 5;

type UnitForToken = {
  id: string;
  org_id: string;
  property_id: string;
  name: string;
  building: { name: string } | null;
  property: { name: string; manager_id: string | null } | null;
};

async function unitForToken(token: string): Promise<UnitForToken | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from("units")
    .select("id, org_id, property_id, name, building:buildings(name), property:properties(name, manager_id)")
    .eq("maintenance_token", token)
    .maybeSingle();
  return (data as unknown as UnitForToken) ?? null;
}

/** Signed upload URLs for up to 5 photos, all under this unit's org. */
export async function prepareRepairUploads(token: string, fileNames: string[]) {
  const unit = await unitForToken(token);
  if (!unit) return { error: "This repair link isn't active. Ask your property manager for a new one." };
  const batch = `req-${crypto.randomUUID()}`;
  const db = createAdminClient();
  const uploads: { path: string; token: string }[] = [];
  for (const [i, name] of fileNames.slice(0, MAX_PHOTOS).entries()) {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${unit.org_id}/work-orders/${batch}/${i}-${safe}`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: "Couldn't prepare the photo upload. Try again, or send it without photos." };
    uploads.push({ path, token: data.token });
  }
  return { ok: true, uploads };
}

const requestSchema = z.object({
  token: z.string(),
  name: z.string().trim().min(1, "Enter your name.").max(120),
  contact: z.string().trim().min(3, "Enter a phone number or email so we can reach you.").max(200),
  title: z.string().trim().min(3, "Say briefly what needs fixing.").max(200),
  description: z.string().trim().max(4000).optional(),
  website: z.string().optional(), // honeypot: real people leave it empty
});

/** Create the work order (status New) and email the property's manager. */
export async function submitRepairRequest(formData: FormData, photoPaths: string[]) {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Please check the form." };
  }
  const input = parsed.data;
  if (input.website) return { ok: true }; // bot
  const unit = await unitForToken(input.token);
  if (!unit) return { error: "This repair link isn't active. Ask your property manager for a new one." };

  const db = createAdminClient();
  const { data: wo, error } = await db
    .from("work_orders")
    .insert({
      org_id: unit.org_id,
      property_id: unit.property_id,
      unit_id: unit.id,
      title: input.title,
      description: input.description || null,
      source: "tenant",
      reporter_name: input.name,
      reporter_contact: input.contact,
    })
    .select("id")
    .single();
  if (error || !wo) return { error: "Couldn't send your request. Please try again." };

  const prefix = `${unit.org_id}/work-orders/req-`;
  const paths = photoPaths.filter((p) => p.startsWith(prefix)).slice(0, MAX_PHOTOS);
  if (paths.length) {
    await db.from("work_order_media").insert(
      paths.map((storage_path) => ({ org_id: unit.org_id, work_order_id: wo.id, storage_path })),
    );
  }

  // Tell the property's manager, or the owners if none is assigned.
  let recipients: string[] = [];
  if (unit.property?.manager_id) {
    const { data } = await db.from("profiles").select("email").eq("id", unit.property.manager_id).maybeSingle();
    if (data?.email) recipients = [data.email as string];
  }
  if (recipients.length === 0) {
    const { data: owners } = await db
      .from("org_members")
      .select("user_id")
      .eq("org_id", unit.org_id)
      .eq("role", "owner");
    const ids = ((owners ?? []) as { user_id: string }[]).map((o) => o.user_id);
    if (ids.length) {
      const { data } = await db.from("profiles").select("email").in("id", ids);
      recipients = ((data ?? []) as { email: string | null }[]).map((p) => p.email).filter((e): e is string => !!e);
    }
  }
  const place = unitLabel({ name: unit.name, building: unit.building }, unit.property);
  for (const to of recipients) {
    await sendReminderEmail({
      to,
      subject: newRepairRequestSubject(place),
      body: newRepairRequestBody({
        place,
        title: input.title,
        reporter: input.name,
        url: siteUrl(`/work-orders/${wo.id}`),
      }),
    });
  }
  return { ok: true };
}
