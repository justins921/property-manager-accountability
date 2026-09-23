import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { LeaseWithRelations, Tenant } from "./types";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number, precise = false): string {
  return (precise ? currencyPrecise : currency).format(value || 0);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d =
    value instanceof Date
      ? value
      : (() => {
          const [y, m, day] = value.split("-").map(Number);
          return new Date(y, m - 1, day);
        })();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value);
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

export function tenantName(t: Pick<Tenant, "first_name" | "last_name"> | null | undefined): string {
  if (!t) return "Unknown tenant";
  return `${t.first_name} ${t.last_name}`.trim();
}

/** "Ann Lee & Bo Park" — primary tenant first. */
export function leaseTenantNames(lease: Pick<LeaseWithRelations, "lease_tenants">): string {
  const names = [...lease.lease_tenants]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((lt) => tenantName(lt.tenant));
  return names.length === 0 ? "No tenant listed" : names.join(" & ");
}

/** "Maple Court · Bldg A · 101" (building left out when there's only a name). */
export function unitLabel(
  unit: { name: string; building?: { name: string } | null } | null | undefined,
  property?: { name: string } | null,
): string {
  if (!unit) return "Unknown unit";
  const parts = [property?.name, unit.building?.name, `Unit ${unit.name}`].filter(Boolean);
  return parts.join(" · ");
}

/** "2 hours", "1.5 days" — for owner response times. */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  if (hours < 24) {
    const h = Math.round(hours);
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days} ${days === 1 ? "day" : "days"}`;
}
