import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdmin } from "./admin";
import { ADMIN_VIEW_COOKIE } from "./org";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/**
 * The Supabase client used for READ queries that back pages.
 *
 * Normally the user's RLS-bound client. When a verified platform admin has an
 * active "view as" cookie, returns the service-role client so the admin can
 * read the viewed org's data (they aren't a member, so RLS would otherwise
 * hide it). This is reads only — mutations go through `createClient()` directly
 * and are additionally guarded against admin-view in each server action.
 */
export async function getReadClient(): Promise<SupabaseClient> {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const viewOrgId = cookieStore.get(ADMIN_VIEW_COOKIE)?.value;

  if (viewOrgId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && isPlatformAdmin(user.email)) {
      return createAdminClient();
    }
  }
  return supabase as unknown as SupabaseClient;
}
