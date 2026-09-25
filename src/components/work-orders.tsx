import Link from "next/link";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderStatus,
} from "@/lib/types";
import type { WorkOrderRow } from "@/lib/queries";

const STATUS_STYLES: Record<WorkOrderStatus, string> = {
  new: "bg-amber-50 text-amber-700",
  assigned: "bg-blue-50 text-blue-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  done: "bg-green-50 text-green-700",
};

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[status])}>
      {WORK_ORDER_STATUS_LABELS[status]}
    </span>
  );
}

/** New → Assigned → In progress → Done, with the date each step happened. */
export function WorkOrderSteps({
  status,
  dates,
}: {
  status: WorkOrderStatus;
  dates: Record<WorkOrderStatus, string | null>;
}) {
  const current = WORK_ORDER_STATUSES.indexOf(status);
  return (
    <ol className="grid grid-cols-4 gap-2">
      {WORK_ORDER_STATUSES.map((s, i) => (
        <li key={s} className="min-w-0">
          <div className={cn("h-1.5 rounded-full", i <= current ? "bg-brand-600" : "bg-slate-200")} />
          <p className={cn("mt-2 text-xs font-semibold sm:text-sm", i <= current ? "text-slate-900" : "text-slate-400")}>
            {WORK_ORDER_STATUS_LABELS[s]}
          </p>
          <p className="text-xs text-slate-400">{dates[s] ? formatDate(dates[s]!.slice(0, 10)) : " "}</p>
        </li>
      ))}
    </ol>
  );
}

export function workOrderPlace(w: WorkOrderRow): string {
  return [w.property?.name, w.unit ? `Unit ${w.unit.name}` : "Common area"].filter(Boolean).join(" · ");
}

/** Newest-first list used on the Work Orders page and property pages. */
export function WorkOrderList({
  orders,
  showProperty = true,
  empty,
}: {
  orders: WorkOrderRow[];
  showProperty?: boolean;
  empty: string;
}) {
  if (orders.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {orders.map((w) => (
        <li key={w.id}>
          <Link href={`/work-orders/${w.id}`} className="flex items-start justify-between gap-3 py-3 transition hover:opacity-75">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{w.title}</p>
              <p className="text-xs text-slate-500">
                {showProperty ? `${workOrderPlace(w)} · ` : w.unit ? `Unit ${w.unit.name} · ` : "Common area · "}
                {w.status === "done"
                  ? `Done ${formatDate(w.completed_on)}${w.vendor_name ? ` by ${w.vendor_name}` : ""}${
                      w.cost !== null ? ` · ${formatCurrency(Number(w.cost), true)}` : ""
                    }`
                  : `Opened ${formatDate(w.created_at.slice(0, 10))}${w.source === "tenant" ? " by tenant" : ""}${
                      w.vendor_name ? ` · ${w.vendor_name}` : ""
                    }`}
              </p>
            </div>
            <WorkOrderStatusBadge status={w.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
