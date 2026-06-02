"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createStarterTemplate,
  seedRecommendedStarters,
} from "@/app/actions/templates";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { CATEGORY_LABELS, FREQUENCY_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui";

const CATEGORY_BADGE: Record<string, string> = {
  interior: "bg-violet-50 text-violet-700",
  exterior: "bg-emerald-50 text-emerald-700",
  general: "bg-slate-100 text-slate-600",
};

export function StarterTemplates() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    label: string,
    fn: () => Promise<{ error?: string } | { ok?: boolean }>,
  ) {
    setError(null);
    setBusy(label);
    const result = await fn();
    setBusy(null);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Starter templates
          </h2>
          <p className="text-sm text-slate-500">
            Pre-built checklists with photo requirements already set — add and
            tweak.
          </p>
        </div>
        <button
          className="btn-secondary"
          disabled={busy !== null}
          onClick={() =>
            run("all", () => seedRecommendedStarters())
          }
        >
          {busy === "all" ? "Adding…" : "Add all recommended"}
        </button>
      </div>

      {error ? <p className="mb-3 text-sm text-status-red">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STARTER_TEMPLATES.map((s) => (
          <div key={s.key} className="card flex flex-col p-5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="font-semibold text-slate-900">{s.name}</h3>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge className={CATEGORY_BADGE[s.category]}>
                  {CATEGORY_LABELS[s.category]}
                </Badge>
                <Badge>{FREQUENCY_LABELS[s.frequency]}</Badge>
              </div>
            </div>
            <p className="text-sm text-slate-500">{s.description}</p>
            <ul className="mt-3 space-y-1 text-xs text-slate-500">
              {s.items.slice(0, 4).map((it) => (
                <li key={it.label} className="flex items-center gap-1">
                  <span className="text-slate-300">•</span>
                  {it.label}
                  {it.photo_required ? (
                    <span className="text-amber-600">📷{it.min_photos}</span>
                  ) : null}
                </li>
              ))}
              {s.items.length > 4 ? (
                <li className="text-slate-400">
                  +{s.items.length - 4} more
                </li>
              ) : null}
            </ul>
            <button
              className="btn-secondary mt-4"
              disabled={busy !== null}
              onClick={() =>
                run(s.key, () => createStarterTemplate(s.key))
              }
            >
              {busy === s.key ? "Adding…" : "+ Add this template"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
