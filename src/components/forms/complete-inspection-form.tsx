"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { completeInspection } from "@/app/actions/inspections-routine";
import { createClient } from "@/lib/supabase/client";
import { ITEM_RESULT_LABELS, type InspectionItemResult } from "@/lib/types";

const BUCKET = "property-media";

export interface ChecklistArea {
  key: string;
  label: string;
  hint?: string | null;
  photoRequired?: boolean;
  minPhotos?: number;
}

function requiredCount(area: ChecklistArea): number {
  return area.photoRequired ? Math.max(1, area.minPhotos ?? 1) : 0;
}

interface AreaState {
  result: InspectionItemResult;
  notes: string;
  files: File[];
}

export function CompleteInspectionForm({
  orgId,
  inspectionId,
  areas,
}: {
  orgId: string;
  inspectionId: string;
  areas: ChecklistArea[];
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, AreaState>>(() =>
    Object.fromEntries(
      areas.map((a) => [
        a.key,
        { result: "pass" as InspectionItemResult, notes: "", files: [] },
      ]),
    ),
  );
  const [overallNotes, setOverallNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: string, patch: Partial<AreaState>) {
    setState((s) => ({ ...s, [key]: { ...s[key], ...patch } }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    try {
      const items = [];
      for (const area of areas) {
        const a = state[area.key];
        const needed = requiredCount(area);

        if (a.result !== "na" && needed > 0 && a.files.length < needed) {
          throw new Error(
            `“${area.label}” needs ${needed} photo${
              needed === 1 ? "" : "s"
            } before it can be completed (or mark it N/A).`,
          );
        }

        const media = [];
        for (const file of a.files) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${orgId}/${inspectionId}/${area.key}-${Date.now()}-${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { upsert: false });
          if (uploadError) throw new Error(uploadError.message);
          media.push({ storage_path: path });
        }

        items.push({
          area_key: area.key,
          area_label: area.label,
          result: a.result,
          notes: a.notes,
          media,
        });
      }

      const result = await completeInspection({
        inspection_id: inspectionId,
        overall_notes: overallNotes,
        items,
      });
      if (result?.error) throw new Error(result.error);
      router.push("/inspections");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {areas.map((area) => {
        const a = state[area.key];
        return (
          <div key={area.key} className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {area.label}
                  {requiredCount(area) > 0 ? (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      📷 {requiredCount(area)} required
                    </span>
                  ) : null}
                </h3>
                {area.hint ? (
                  <p className="text-xs text-slate-400">{area.hint}</p>
                ) : null}
              </div>
              <div className="flex gap-1">
                {(Object.keys(ITEM_RESULT_LABELS) as InspectionItemResult[]).map(
                  (r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => update(area.key, { result: r })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        a.result === r
                          ? r === "pass"
                            ? "bg-green-100 text-green-700"
                            : r === "needs_attention"
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-200 text-slate-700"
                          : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {ITEM_RESULT_LABELS[r]}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="file"
                accept="image/*"
                multiple
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
                onChange={(e) =>
                  update(area.key, { files: Array.from(e.target.files ?? []) })
                }
              />
              <input
                type="text"
                placeholder="Notes (optional)"
                className="input"
                value={a.notes}
                onChange={(e) => update(area.key, { notes: e.target.value })}
              />
            </div>
            {a.files.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                {a.files.length} photo{a.files.length === 1 ? "" : "s"} selected
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="card p-5">
        <label className="label">Overall notes (optional)</label>
        <textarea
          rows={3}
          className="input"
          value={overallNotes}
          onChange={(e) => setOverallNotes(e.target.value)}
        />
      </div>

      {error ? <p className="text-sm text-status-red">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <a href="/inspections" className="btn-secondary">
          Cancel
        </a>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Submitting…" : "Submit completed inspection"}
        </button>
      </div>
    </form>
  );
}
