"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().min(1, "Property name is required."),
  address: z.string().optional(),
  manager_id: z.string().uuid().optional().or(z.literal("")),
});

export async function createProperty(formData: FormData) {
  const ctx = await requireOrgContext();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("properties").insert({
    org_id: ctx.org.id,
    name: parsed.data.name,
    address: parsed.data.address || null,
    manager_id: parsed.data.manager_id || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/properties");
  return { ok: true };
}
