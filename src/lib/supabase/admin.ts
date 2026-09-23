import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS — use ONLY on the server, never
 * in code that ships to the browser. Used by the daily cron job, which must
 * read and write across every tenant.
 *
 * Every request opts out of Next's fetch cache. Without this, Next 14 caches
 * supabase-js GETs made from a route handler (the cron) indefinitely, so the
 * job would keep acting on the first snapshot of the data it ever read.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );
}
