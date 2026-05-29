import Link from "next/link";
import { cn } from "@/lib/utils";
import type { VacancyStatus } from "@/lib/types";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("card p-5", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "default" | "red" | "green";
}) {
  return (
    <div className="card p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-bold tracking-tight",
          accent === "red" && "text-status-red",
          accent === "green" && "text-status-green",
          (!accent || accent === "default") && "text-slate-900",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-sm text-slate-500">{sub}</p> : null}
    </div>
  );
}

const STATUS_STYLES: Record<
  VacancyStatus,
  { dot: string; bg: string; text: string; label: string }
> = {
  green: {
    dot: "bg-status-green",
    bg: "bg-green-50",
    text: "text-green-700",
    label: "On track",
  },
  yellow: {
    dot: "bg-status-yellow",
    bg: "bg-amber-50",
    text: "text-amber-700",
    label: "Approaching deadline",
  },
  red: {
    dot: "bg-status-red",
    bg: "bg-red-50",
    text: "text-red-700",
    label: "Missed deadline",
  },
};

export function StatusBadge({
  status,
  showLabel = true,
}: {
  status: VacancyStatus;
  showLabel?: boolean;
}) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        s.bg,
        s.text,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
      {showLabel ? s.label : null}
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description ? (
        <p className="max-w-md text-sm text-slate-500">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={variant === "primary" ? "btn-primary" : "btn-secondary"}
    >
      {children}
    </Link>
  );
}
