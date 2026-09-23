import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/scorecard", label: "Property managers" },
  { href: "/scorecard/owners", label: "Owners" },
];

/** Switch between the two sides of the two-way scorecard. */
export function ScorecardTabs({ active }: { active: string }) {
  return (
    <div className="mb-6 flex gap-2 border-b border-slate-200">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-3 pb-2 text-sm font-medium",
            active === t.href
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-900",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
