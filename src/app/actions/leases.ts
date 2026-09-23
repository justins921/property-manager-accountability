"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dateKey, nextDueDateOnOrAfter } from "@/lib/calculations";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

const money = z.coerce.number().nonnegative().multipleOf(0.01, "Use whole cents.");
const optionalMoney = z
  .union([z.literal(""), money])
  .optional()
  .transform((v) => (v === "" || v === undefined ? 0 : v));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
const optionalDate = z
  .union([z.literal(""), date])
  .optional()
  .transform((v) => v || null);

const leaseSchema = z.object({
  unit_id: z.string().uuid("Pick a unit."),
  vacancy_id: z.string().uuid().optional().or(z.literal("")),
  start_date: date,
  end_date: optionalDate,
  monthly_rent: money,
  rent_due_day: z.coerce.number().int().min(1).max(28).default(1),
  security_deposit: optionalMoney,
  late_fee_amount: optionalMoney,
  late_fee_grace_days: z.coerce.number().int().min(0).max(27).default(5),
  billing_start_date: optionalDate,
  opening_balance: optionalMoney,
  prorated_charge: optionalMoney,
  deposit_collected: optionalMoney,
  new_first_name: z.string().trim().optional(),
  new_last_name: z.string().trim().optional(),
  new_email: z.string().trim().email("Enter a valid email.").optional().or(z.literal("")),
  new_phone: z.string().trim().optional(),
});

/**
 * Create a lease on a unit for one or more tenants. Owners and managers.
 *
 * Status is `active` when it starts today or earlier, otherwise `upcoming`
 * (the cron activates it on the start date). The DB allows one active lease
 * per unit. Optional one-time entries — an opening balance for an existing
 * tenant, a prorated first month, a deposit received — are posted as manual
 * ledger entries by the signed-in user. Monthly rent posts automatically from
 * billing_start_date on.
 */
export async function createLease(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };

  const raw = Object.fromEntries(formData);
  const parsed = leaseSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;
  const tenantIds = formData
    .getAll("tenant_ids")
    .map(String)
    .filter((id) => z.string().uuid().safeParse(id).success);
  const hasNewTenant = !!(input.new_first_name || input.new_last_name);
  if (hasNewTenant && !(input.new_first_name && input.new_last_name)) {
    return { error: "Enter both a first and last name for the new tenant." };
  }
  if (tenantIds.length === 0 && !hasNewTenant) {
    return { error: "Add at least one tenant to the lease." };
  }
  if (input.end_date && input.end_date < input.start_date) {
    return { error: "The end date can't be before the start date." };
  }

  const supabase = await createClient();
  const today = dateKey(new Date());

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("org_id", ctx.org.id)
    .eq("id", input.unit_id)
    .maybeSingle();
  if (!unit) return { error: "Unit not found." };

  if (tenantIds.length > 0) {
    const { data: found } = await supabase
      .from("tenants")
      .select("id")
      .eq("org_id", ctx.org.id)
      .in("id", tenantIds);
    if ((found ?? []).length !== tenantIds.length) {
      return { error: "One of the selected tenants wasn't found." };
    }
  }

  const status = input.start_date <= today ? "active" : "upcoming";
  if (status === "active") {
    const { data: current } = await supabase
      .from("leases")
      .select("id")
      .eq("unit_id", input.unit_id)
      .eq("status", "active")
      .maybeSingle();
    if (current) {
      return {
        error:
          "This unit already has an active lease. End that lease first, or start this one on a future date.",
      };
    }
  }

  const billingStart =
    input.billing_start_date ??
    nextDueDateOnOrAfter(
      input.start_date > today ? input.start_date : today,
      input.rent_due_day,
    );
  if (billingStart < input.start_date) {
    return { error: "Automatic rent can't start before the lease does." };
  }

  // A brand-new tenant typed into the form.
  const allTenantIds = [...tenantIds];
  if (hasNewTenant) {
    const { data: created, error } = await supabase
      .from("tenants")
      .insert({
        org_id: ctx.org.id,
        first_name: input.new_first_name,
        last_name: input.new_last_name,
        email: input.new_email || null,
        phone: input.new_phone || null,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Could not add tenant." };
    allTenantIds.unshift(created.id as string);
  }

  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .insert({
      org_id: ctx.org.id,
      property_id: unit.property_id,
      unit_id: input.unit_id,
      vacancy_id: input.vacancy_id || null,
      start_date: input.start_date,
      end_date: input.end_date,
      monthly_rent: input.monthly_rent,
      rent_due_day: input.rent_due_day,
      security_deposit: input.security_deposit,
      late_fee_amount: input.late_fee_amount,
      late_fee_grace_days: input.late_fee_grace_days,
      billing_start_date: billingStart,
      status,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (leaseError || !lease) {
    return {
      error: leaseError?.message.includes("leases_one_active_per_unit")
        ? "This unit already has an active lease."
        : leaseError?.message ?? "Could not create lease.",
    };
  }

  const leaseId = lease.id as string;
  const partial = (what: string, msg: string) => ({
    error: `The lease was created, but ${what} failed: ${msg}. Open the lease to finish setting it up.`,
    leaseId,
  });

  const { error: linkError } = await supabase.from("lease_tenants").insert(
    allTenantIds.map((tenantId, i) => ({
      org_id: ctx.org.id,
      lease_id: leaseId,
      tenant_id: tenantId,
      is_primary: i === 0,
    })),
  );
  if (linkError) return partial("adding tenants", linkError.message);

  const oneTime = [
    input.opening_balance > 0 && {
      type: "charge",
      amount: input.opening_balance,
      entry_date: today,
      memo: "Opening balance",
    },
    input.prorated_charge > 0 && {
      type: "charge",
      amount: input.prorated_charge,
      entry_date: input.start_date,
      memo: "Prorated rent (first partial month)",
    },
    input.deposit_collected > 0 && {
      type: "deposit",
      amount: input.deposit_collected,
      entry_date: input.start_date < today ? input.start_date : today,
      memo: "Security deposit",
    },
  ].filter(Boolean) as { type: string; amount: number; entry_date: string; memo: string }[];

  if (oneTime.length > 0) {
    const { error } = await supabase.from("ledger_entries").insert(
      oneTime.map((e) => ({
        ...e,
        org_id: ctx.org.id,
        lease_id: leaseId,
        created_by: ctx.userId,
      })),
    );
    if (error) return partial("posting the opening entries", error.message);
  }

  // Link the vacancy to this unit if it wasn't already.
  if (input.vacancy_id) {
    await supabase
      .from("vacancies")
      .update({ unit_id: input.unit_id })
      .eq("org_id", ctx.org.id)
      .eq("id", input.vacancy_id)
      .is("unit_id", null);
  }

  revalidatePath("/rent-roll");
  revalidatePath("/tenants");
  revalidatePath(`/units/${input.unit_id}`);
  redirect(`/leases/${leaseId}`);
}

const endSchema = z.object({
  lease_id: z.string().uuid(),
  ended_on: date,
  kind: z.enum(["ended", "terminated"]),
});

/**
 * End a lease (tenant moved out at or after term) or terminate it early.
 * Automatic rent stops after ended_on. Owners and managers.
 */
export async function endLease(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = endSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const { lease_id, ended_on, kind } = parsed.data;

  const supabase = await createClient();
  const { data: lease } = await supabase
    .from("leases")
    .select("id, unit_id, status, start_date")
    .eq("org_id", ctx.org.id)
    .eq("id", lease_id)
    .maybeSingle();
  if (!lease) return { error: "Lease not found." };
  if (lease.status !== "active" && lease.status !== "upcoming") {
    return { error: "This lease has already ended." };
  }
  if (ended_on < (lease.start_date as string)) {
    return { error: "The end date can't be before the lease started." };
  }

  const { error } = await supabase
    .from("leases")
    .update({ status: kind, ended_on })
    .eq("org_id", ctx.org.id)
    .eq("id", lease_id);
  if (error) return { error: error.message };

  revalidatePath(`/leases/${lease_id}`);
  revalidatePath(`/units/${lease.unit_id}`);
  revalidatePath("/rent-roll");
  return { ok: true };
}

/** Delete a lease and its ledger. Owners only. */
export async function deleteLease(leaseId: string) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") return { error: "Only owners can delete leases." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leases")
    .delete()
    .eq("org_id", ctx.org.id)
    .eq("id", leaseId)
    .select("unit_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Lease not found." };

  revalidatePath("/rent-roll");
  revalidatePath("/tenants");
  redirect(`/units/${data[0].unit_id}`);
}

const entrySchema = z
  .object({
    lease_id: z.string().uuid(),
    type: z.enum(["payment", "credit", "charge", "deposit"]),
    amount: z.coerce
      .number()
      .positive("Amount must be more than zero.")
      .multipleOf(0.01, "Use whole cents."),
    entry_date: date,
    memo: z.string().trim().optional(),
    payment_method: z
      .enum(["cash", "check", "zelle", "ach", "money_order", "other"])
      .optional()
      .or(z.literal("")),
    reference: z.string().trim().optional(),
  })
  .refine((e) => e.type === "payment" || e.type === "deposit" || !!e.memo, {
    message: "Add a memo explaining this charge or credit.",
  })
  .refine((e) => e.type !== "payment" || !!e.payment_method, {
    message: "Pick how the payment was made.",
  });

/**
 * Record a manual ledger entry: a payment received (cash, check, Zelle…), a
 * credit, a one-off charge, or a deposit received. Entries can't be edited or
 * deleted afterwards; fix a mistake with an offsetting entry. Every entry is
 * stamped with who recorded it. Owners and managers.
 */
export async function addLedgerEntry(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = entrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const e = parsed.data;

  const supabase = await createClient();
  const { data: lease } = await supabase
    .from("leases")
    .select("id")
    .eq("org_id", ctx.org.id)
    .eq("id", e.lease_id)
    .maybeSingle();
  if (!lease) return { error: "Lease not found." };

  const takesMethod = e.type === "payment" || e.type === "deposit";
  const { error } = await supabase.from("ledger_entries").insert({
    org_id: ctx.org.id,
    lease_id: e.lease_id,
    type: e.type,
    amount: e.amount,
    entry_date: e.entry_date,
    memo: e.memo || null,
    payment_method: takesMethod && e.payment_method ? e.payment_method : null,
    reference: takesMethod ? e.reference || null : null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/leases/${e.lease_id}`);
  revalidatePath("/rent-roll");
  return { ok: true };
}
