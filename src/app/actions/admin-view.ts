"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_VIEW_COOKIE } from "@/lib/org";
import { getPlatformAdmin } from "@/lib/admin";

/** Enter read-only "view as" mode for an organization (platform admins only). */
export async function startViewingOrg(formData: FormData) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");

  const orgId = String(formData.get("org_id") ?? "");
  if (!orgId) redirect("/admin");

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_VIEW_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4, // auto-expire after 4 hours
  });
  redirect("/dashboard");
}

/** Exit "view as" mode and return to the admin's own account. */
export async function stopViewingOrg() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_VIEW_COOKIE);
  redirect("/admin");
}
