import { dateKey, ledgerSign, toCents, type OccupancyLabel } from "@/lib/calculations";
import {
  LEDGER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type LedgerEntry,
  type Profile,
} from "@/lib/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

const OCCUPANCY_STYLES: Record<OccupancyLabel | "Vacant", string> = {
  Active: "bg-green-50 text-green-700",
  "Month-to-month": "bg-green-50 text-green-700",
  Upcoming: "bg-blue-50 text-blue-700",
  Holdover: "bg-amber-50 text-amber-700",
  Ended: "bg-slate-100 text-slate-600",
  Terminated: "bg-slate-100 text-slate-600",
  Vacant: "bg-red-50 text-red-700",
};

export function OccupancyBadge({ label }: { label: OccupancyLabel | "Vacant" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        OCCUPANCY_STYLES[label],
      )}
    >
      {label}
    </span>
  );
}

/** Balance with "owes" / "credit" wording and color. */
export function BalanceText({ amount }: { amount: number }) {
  if (amount > 0) {
    return <span className="font-semibold text-status-red">{formatCurrency(amount, true)}</span>;
  }
  if (amount < 0) {
    return (
      <span className="font-semibold text-status-green">
        {formatCurrency(-amount, true)} credit
      </span>
    );
  }
  return <span className="text-slate-500">{formatCurrency(0, true)}</span>;
}

/**
 * The ledger with a running balance, oldest first. The running balance is
 * computed for display only — nothing is stored.
 */
export function LedgerTable({
  entries,
  profiles,
}: {
  entries: LedgerEntry[];
  profiles: Map<string, Profile>;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No ledger entries yet.</p>;
  }

  let running = 0;
  const rows = entries.map((e) => {
    running += ledgerSign(e.type) * toCents(e.amount);
    return { e, balance: running / 100 };
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Memo</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ e, balance }) => {
            const sign = ledgerSign(e.type);
            const who = e.created_by
              ? profiles.get(e.created_by)?.full_name || profiles.get(e.created_by)?.email || "Team member"
              : "Automatic";
            const recorded = dateKey(new Date(e.created_at));
            return (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDate(e.entry_date)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">
                  {LEDGER_TYPE_LABELS[e.type]}
                </td>
                <td className="min-w-[14rem] px-3 py-2 text-slate-600">
                  {e.memo ?? ""}
                  {e.payment_method ? (
                    <span className="text-slate-400">
                      {e.memo ? " · " : ""}
                      {PAYMENT_METHOD_LABELS[e.payment_method]}
                      {e.reference ? ` #${e.reference}` : ""}
                    </span>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    {who}
                    {recorded !== e.entry_date ? ` · recorded ${formatDate(recorded)}` : ""}
                  </p>
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-3 py-2 text-right font-medium",
                    sign === 1 && "text-slate-900",
                    sign === -1 && "text-status-green",
                    sign === 0 && "text-slate-400",
                  )}
                >
                  {sign === -1 ? "−" : ""}
                  {formatCurrency(Number(e.amount), true)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                  {formatCurrency(balance, true)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
