"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createTemplate, updateTemplate } from "@/app/actions/templates";
import {
  FREQUENCY_LABELS,
  type InspectionFrequency,
} from "@/lib/types";

interface ItemRow {
  label: string;
  hint: string;
}

export function TemplateBuilder({
  template,
}: {
  template?: {
    id: string;
    name: string;
    frequency: InspectionFrequency;
    description: string | null;
    items: { label: string; hint: string | null }[];
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [frequency, setFrequency] = useState<InspectionFrequency>(
    template?.frequency ?? "monthly",
  );
  const [description, setDescription] = useState(template?.description ?? "");
  const [items, setItems] = useState<ItemRow[]>(
    template?.items.map((i) => ({ label: i.label, hint: i.hint ?? "" })) ?? [
      { label: "", hint: "" },
    ],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function setItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((prev) => [...prev, { label: "", hint: "" }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const payload = {
      name,
      frequency,
      description,
      items: items
        .filter((i) => i.label.trim())
        .map((i) => ({ label: i.label, hint: i.hint })),
    };
    const result = template
      ? await updateTemplate({ id: template.id, ...payload })
      : await createTemplate(payload);
    setLoading(false);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    router.push("/inspections/templates");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="card space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Template name</label>
            <input
              className="input"
              required
              placeholder="e.g. Monthly drive-by"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Cadence</label>
            <select
              className="input"
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as InspectionFrequency)
              }
            >
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Description (optional)</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Checklist items
          </h2>
          <button type="button" className="btn-secondary" onClick={addItem}>
            + Add item
          </button>
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="mt-2 w-5 text-sm text-slate-400">{idx + 1}.</span>
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className="input"
                  placeholder="What to check (e.g. Landscaping & weeds)"
                  value={item.label}
                  onChange={(e) => setItem(idx, { label: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Hint (optional)"
                  value={item.hint}
                  onChange={(e) => setItem(idx, { hint: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="mt-2 text-slate-400 hover:text-status-red"
                aria-label="Remove item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-status-red">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <a href="/inspections/templates" className="btn-secondary">
          Cancel
        </a>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading
            ? "Saving…"
            : template
              ? "Save template"
              : "Create template"}
        </button>
      </div>
    </form>
  );
}
