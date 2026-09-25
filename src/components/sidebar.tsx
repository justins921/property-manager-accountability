"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Building2,
  ClipboardCheck,
  ClipboardList,
  Contact,
  Gauge,
  Inbox,
  LogOut,
  Menu,
  ReceiptText,
  Shield,
  Trophy,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/tenants", label: "Tenants", icon: Contact },
  { href: "/rent-roll", label: "Rent Roll", icon: ReceiptText },
  { href: "/vacancies", label: "Vacancies", icon: ClipboardList },
  { href: "/inspections", label: "Inspections", icon: ClipboardCheck },
  { href: "/work-orders", label: "Work Orders", icon: Wrench },
  { href: "/requests", label: "Owner Requests", icon: Inbox },
  { href: "/scorecard", label: "Scorecards", icon: Trophy },
  { href: "/team", label: "Team", icon: Users },
];

export function Sidebar({
  orgName,
  userName,
  role,
  isAdmin = false,
}: {
  orgName: string;
  userName: string;
  role: MemberRole;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close the mobile menu after navigating.
  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const content = (
    <>
      <div className="border-b border-slate-100 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          Property Management
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

        {isAdmin ? (
          <Link
            href="/admin"
            className={cn(
              "mt-2 flex items-center gap-3 rounded-lg border-t border-slate-100 px-3 pb-2 pt-4 text-sm font-medium transition",
              pathname.startsWith("/admin")
                ? "text-brand-700"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Shield className="h-4 w-4" />
            Platform Admin
          </Link>
        ) : null}
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
    </>
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        {content}
      </aside>

      {/* Phone / tablet: top bar + slide-out menu */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">
            Property Management
          </p>
          <p className="truncate text-sm font-bold text-slate-900">{orgName}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col overflow-y-auto bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}