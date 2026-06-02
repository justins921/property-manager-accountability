"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_VIEW_READONLY, requireOrgContext } from "@/lib/org";
import { DEFAULT_CHECKLIST } from "@/lib/inspection-checklist";
import { createClient } from "@/lib/supabase/server";
import type { InspectionFrequency, TemplateCategory } from "@/lib/types";

interface TemplateItemInput {
  label: string;
  hint?: string;
  photo_required?: boolean;
  min_photos?: number;
}

interface TemplateInput {
  name: string;
  frequency: InspectionFrequency;
  category: TemplateCategory;
  description?: string;
  items: TemplateItemInput[];
}

async function writeItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  templateId: string,
  items: TemplateItemInput[],
) {
  const clean = items
    .map((it) => {
      const photoRequired = !!it.photo_required;
      // A required photo means at least 1; respect a higher minimum if set.
      const minPhotos = photoRequired ? Math.max(1, it.min_photos ?? 1) : 0;
      return {
        label: it.label.trim(),
        hint: it.hint?.trim() || null,
        photo_required: photoRequired,
        min_photos: minPhotos,
      };
    })
    .filter((it) => it.label.length > 0);
  if (clean.length === 0) return { error: "Add at least one checklist item." };

  const { error } = await supabase.from("inspection_template_items").insert(
    clean.map((it, position) => ({
      template_id: templateId,
      org_id: orgId,
      label: it.label,
      hint: it.hint,
      photo_required: it.photo_required,
      min_photos: it.min_photos,
      position,
    })),
  );
  return error ? { error: error.message } : { ok: true as const };
}

/** Create a reusable checklist template (owner only). */
export async function createTemplate(input: TemplateInput) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") {
    return { error: "Only owners can manage templates." };
  }
  if (!input.name.trim()) return { error: "Template name is required." };

  const supabase = await createClient();
  const { data: template, error } = await supabase
    .from("inspection_templates")
    .insert({
      org_id: ctx.org.id,
      name: input.name.trim(),
      frequency: input.frequency,
      category: input.category,
      description: input.description?.trim() || null,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !template) {
    return { error: error?.message ?? "Could not create template." };
  }

  const result = await writeItems(supabase, ctx.org.id, template.id, input.items);
  if ("error" in result) {
    await supabase.from("inspection_templates").delete().eq("id", template.id);
    return result;
  }

  revalidatePath("/inspections/templates");
  return { ok: true, id: template.id };
}

/** Update a template's details and replace its items (owner only). */
export async function updateTemplate(input: TemplateInput & { id: string }) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") {
    return { error: "Only owners can manage templates." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("inspection_templates")
    .update({
      name: input.name.trim(),
      frequency: input.frequency,
      category: input.category,
      description: input.description?.trim() || null,
    })
    .eq("org_id", ctx.org.id)
    .eq("id", input.id);
  if (updateError) return { error: updateError.message };

  // Replace items wholesale (simple + predictable for v1).
  await supabase
    .from("inspection_template_items")
    .delete()
    .eq("template_id", input.id);
  const result = await writeItems(supabase, ctx.org.id, input.id, input.items);
  if ("error" in result) return result;

  revalidatePath("/inspections/templates");
  revalidatePath(`/inspections/templates/${input.id}`);
  return { ok: true };
}

export async function deleteTemplate(id: string) {
  const ctx = await requireOrgContext();
  if (ctx.isAdminView) return { error: ADMIN_VIEW_READONLY };
  if (ctx.role !== "owner") {
    return { error: "Only owners can manage templates." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("inspection_templates")
    .delete()
    .eq("org_id", ctx.org.id)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/inspections/templates");
  return { ok: true };
}

/** One-click: create a starter template from the built-in default checklist. */
export async function seedDefaultTemplate() {
  return createTemplate({
    name: "Standard property check",
    frequency: "monthly",
    category: "general",
    description: "A good starting point — edit the items to fit your portfolio.",
    items: DEFAULT_CHECKLIST.map((a) => ({ label: a.label, hint: a.hint })),
  });
}
