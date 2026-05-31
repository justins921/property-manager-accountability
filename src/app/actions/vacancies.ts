"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deriveStageFromDates, stageRank } from "@/lib/calculations";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import type {
  DeadlineType,
  DelayReason,
  InspectionType,
  MediaType,
  Vacancy,
} from "@/lib/types";

const dateField = z.string().min(1, "required");

const createSchema = z.object({
  property_id: z.string().uuid(),
  manager_id: z.string().uuid().optional().or(z.literal("")),
  unit_number: z.string().min(1),
  monthly_rent: z.coerce.number().nonnegative(),
  move_out_date: dateField,
  expected_make_ready_date: dateField,
  expected_listing_date: dateField,
  expected_lease_signing_date: dateField,
  expected_move_in_date: dateField,
});

export async function createVacancy(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vacancies")
    .insert({
      org_id: ctx.org.id,
      property_id: input.property_id,
      manager_id: input.manager_id || null,
      unit_number: input.unit_number,
      monthly_rent: input.monthly_rent,
      move_out_date: input.move_out_date,
      expected_make_ready_date: input.expected_make_ready_date,
      expected_listing_date: input.expected_listing_date,
      expected_lease_signing_date: input.expected_lease_signing_date,
      expected_move_in_date: input.expected_move_in_date,
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create vacancy." };
  }

  revalidatePath("/vacancies");
  revalidatePath("/dashboard");
  redirect(`/vacancies/${data.id}`);
}

const ACTUAL_FIELDS = [
  "actual_make_ready_date",
  "date_listed",
  "date_applications_received",
  "date_lease_signed",
  "actual_move_in_date",
] as const;

/** Record actual milestone dates (Step 7) and advance the lifecycle stage. */
export async function updateVacancyDates(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const id = String(formData.get("vacancy_id"));

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("vacancies")
    .select("*")
    .eq("org_id", ctx.org.id)
    .eq("id", id)
    .maybeSingle();
  if (!current) return { error: "Vacancy not found." };

  const updates: Record<string, string | null> = {};
  for (const field of ACTUAL_FIELDS) {
    const raw = formData.get(field);
    // Empty string clears the date; absent field leaves it unchanged.
    if (raw !== null) updates[field] = raw === "" ? null : String(raw);
  }

  const merged = { ...(current as Vacancy), ...updates } as Vacancy;
  const derived = deriveStageFromDates(merged);
  // Don't downgrade below an inspection-driven stage already recorded.
  const stage =
    stageRank(derived) >= stageRank((current as Vacancy).stage)
      ? derived
      : (current as Vacancy).stage;

  const { error } = await supabase
    .from("vacancies")
    .update({
      ...updates,
      stage,
      closed_at: stage === "completed" ? new Date().toISOString() : null,
    })
    .eq("org_id", ctx.org.id)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/vacancies/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

const delaySchema = z.object({
  vacancy_id: z.string().uuid(),
  deadline_type: z.enum([
    "make_ready",
    "listing",
    "lease_signing",
    "move_in",
  ]),
  reason: z.enum([
    "waiting_contractor",
    "waiting_materials",
    "waiting_owner_approval",
    "leasing_issue",
    "market_conditions",
    "tenant_delay",
    "other",
  ]),
  notes: z.string().optional(),
});

export async function addDelayExplanation(formData: FormData) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const parsed = delaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("delay_explanations").insert({
    org_id: ctx.org.id,
    vacancy_id: parsed.data.vacancy_id,
    deadline_type: parsed.data.deadline_type as DeadlineType,
    reason: parsed.data.reason as DelayReason,
    notes: parsed.data.notes || null,
    created_by: ctx.userId,
  });

  if (error) return { error: error.message };
  revalidatePath(`/vacancies/${parsed.data.vacancy_id}`);
  return { ok: true };
}

interface MediaInput {
  storage_path: string;
  media_type: MediaType;
  caption?: string;
}

/**
 * Create an inspection record (Step 2 / Step 6) plus its media rows.
 * Files are uploaded to storage on the client first; this records the
 * resulting paths. Advances the stage to "inspected" or "ready".
 */
export async function createInspection(params: {
  vacancy_id: string;
  type: InspectionType;
  damage_notes?: string;
  estimated_turn_cost?: number | null;
  completion_notes?: string;
  media: MediaInput[];
}) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  const supabase = await createClient();

  const { data: inspection, error } = await supabase
    .from("inspections")
    .insert({
      org_id: ctx.org.id,
      vacancy_id: params.vacancy_id,
      type: params.type,
      damage_notes: params.damage_notes || null,
      estimated_turn_cost: params.estimated_turn_cost ?? null,
      completion_notes: params.completion_notes || null,
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !inspection) {
    return { error: error?.message ?? "Could not save inspection." };
  }

  if (params.media.length > 0) {
    const { error: mediaError } = await supabase.from("inspection_media").insert(
      params.media.map((m) => ({
        inspection_id: inspection.id,
        org_id: ctx.org.id,
        media_type: m.media_type,
        storage_path: m.storage_path,
        caption: m.caption || null,
      })),
    );
    if (mediaError) return { error: mediaError.message };
  }

  // Advance stage (without downgrading).
  const { data: current } = await supabase
    .from("vacancies")
    .select("stage")
    .eq("id", params.vacancy_id)
    .maybeSingle();
  const targetStage = params.type === "move_out" ? "inspected" : "ready";
  if (
    current &&
    stageRank(targetStage) > stageRank((current as Vacancy).stage)
  ) {
    await supabase
      .from("vacancies")
      .update({ stage: targetStage })
      .eq("org_id", ctx.org.id)
      .eq("id", params.vacancy_id);
  }

  revalidatePath(`/vacancies/${params.vacancy_id}`);
  return { ok: true, inspectionId: inspection.id };
}
