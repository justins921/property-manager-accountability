import Link from "next/link";
import { Circle, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SetupStep {
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

/**
 * First-run checklist on the dashboard. Shown until every step is done, so a
 * brand-new portfolio knows what to do first instead of seeing a page of zeros.
 */
export function GettingStarted({ steps }: { steps: SetupStep[] }) {
  if (steps.every((s) => s.done)) return null;
  const next = steps.find((s) => !s.done);
  return (
    <div className="card mb-6 p-5">
      <h2 className="text-lg font-semibold text-slate-900">Get set up</h2>
      <p className="mb-4 text-sm text-slate-500">
        {steps.filter((s) => s.done).length} of {steps.length} done. Rent
        starts posting automatically once a lease is in.
      </p>
      <ol className="space-y-2">
        {steps.map((s) => {
          const Icon = s.done ? CircleCheck : Circle;
          return (
            <li key={s.label}>
              <Link
                href={s.href}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-3 transition",
                  s === next
                    ? "border-brand-200 bg-brand-50 hover:bg-brand-100"
                    : "border-slate-100 hover:bg-slate-50",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    s.done ? "text-status-green" : "text-slate-300",
                  )}
                />
                <span>
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      s.done ? "text-slate-400 line-through" : "text-slate-900",
                    )}
                  >
                    {s.label}
                  </span>
                  {!s.done ? <span className="block text-xs text-slate-500">{s.hint}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
