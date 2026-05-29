"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ClipboardList,
  Gauge,
  LogOut,
  Trophy,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Owner Dashboard", icon: Gauge },
  { href: "/vacancies", label: "Vacancies", icon: ClipboardList },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/scorecard", label: "PM Scorecard", icon: Trophy },
  { href: "/team", label: "Team", icon: Users },
];

export function Sidebar({
  orgName,
  userName,
  role,
}: {
  orgName: string;
  userName: string;
  role: MemberRole;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          Vacancy Accountability
        </p>
        <p className="mt-1 truncate text-base font-bold text-slate-900">
          {orgName}
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 px-3 py-4">
        <div className="px-2 pb-3">
          <p className="truncate text-sm font-medium text-slate-700">
            {userName}
          </p>
          <p className="text-xs capitalize text-slate-400">{role}</p>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
