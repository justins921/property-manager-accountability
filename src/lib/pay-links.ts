import { createAdminClient } from "./supabase/admin";
import type { PaymentLink } from "./types";

export interface PayLinkView extends PaymentLink {
  lease: {
    id: string;
    status: string;
    monthly_rent: number;
    stripe_customer_id: string | null;
    autopay_enabled: boolean;
    autopay_method_label: string | null;
    unit: { name: string } | null;
    property: { name: string } | null;
    lease_tenants: { is_primary: boolean; tenant: { first_name: string; last_name: string; email: string | null } | null }[];
  } | null;
  org: { id: string; name: string; stripe_account_id: string | null; stripe_charges_enabled: boolean } | null;
}

/**
 * Load a pay link by its token for the public pay page. Uses the service
 * role (the tenant has no login); the unguessable token is the credential.
 */
export async function loadPayLink(token: string): Promise<PayLinkView | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("payment_links")
    .select(
      "*, lease:leases(id, status, monthly_rent, stripe_customer_id, autopay_enabled, autopay_method_label, unit:units(name), property:properties(name), lease_tenants(is_primary, tenant:tenants(first_name, last_name, email))), org:organizations(id, name, stripe_account_id, stripe_charges_enabled)",
    )
    .eq("token", token)
    .maybeSingle();
  return (data as PayLinkView) ?? null;
}

/** Can the tenant pay with this link right now? */
export function payLinkUsable(link: PayLinkView): boolean {
  return (
    (link.status === "open" || link.status === "failed") &&
    new Date(link.expires_at) > new Date() &&
    !!link.org?.stripe_charges_enabled &&
    !!link.org?.stripe_account_id &&
    (link.lease?.status === "active" || link.lease?.status === "upcoming")
  );
}
