"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createTemplate, updateTemplate } from "@/app/actions/templates";
import {
  CATEGORY_LABELS,
  FREQUENCY_LABELS,
  type InspectionFrequency,
  type TemplateCategory,
} from "@/lib/types";

interface ItemRow {
  label: string;
  hint: string;
  photoRequired: boolean;
  minPhotos: number;
}

export function TemplateBuilder({
  template,
}: {
  template?: {
    id: string;
    name: string;
    frequency: InspectionFrequency;
    category: TemplateCategory;
    description: string | null;
    items: {
      label: string;
      hint: string | null;
      photo_required: boolean;
      min_photos: number;
    }[];
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [frequency, setFrequency] = useState<InspectionFrequency>(
    template?.frequency ?? "monthly",
  );
  const [category, setCategory] = useState<TemplateCategory>(
    template?.category ?? "general",
  );
  const [description, setDescription] = useState(template?.description ?? "");
  const [items, setItems] = useState<ItemRow[]>(
    template?.items.map((i) => ({
      label: i.label,
      hint: i.hint ?? "",
      photoRequired: i.photo_required,
      minPhotos: i.min_photos,
    })) ?? [{ label: "", hint: "", photoRequired: false, minPhotos: 1 }],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function setItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      { label: "", hint: "", photoRequired: false, minPhotos: 1 },
    ]);
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
      category,
      description,
      items: items
        .filter((i) => i.label.trim())
        .map((i) => ({
          label: i.label,
          hint: i.hint,
          photo_required: i.photoRequired,
          min_photos: i.photoRequired ? Math.max(1, i.minPhotos) : 0,
        })),
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Template name</label>
            <input
              className="input"
              required
              placeholder="e.g. Monthly exterior drive-by"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as TemplateCategory)
              }
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
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
        <p className="text-xs text-slate-400">
          Interior templates apply to units; exterior templates apply to
          buildings. General can apply anywhere.
        </p>
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
            <div
              key={idx}
              className="rounded-lg border border-slate-100 p-3"
            >
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 text-sm text-slate-400">
                  {idx + 1}.
                </span>
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    className="input"
                    placeholder="What to check (e.g. Front yard & landscaping)"
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
              <div className="ml-7 mt-2 flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={item.photoRequired}
                    onChange={(e) =>
                      setItem(idx, { photoRequired: e.target.checked })
                    }
                  />
                  Require photo
                </label>
                {item.photoRequired ? (
                  <label className="flex items-center gap-2 text-slate-500">
                    Minimum
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="input w-16 py-1"
                      value={item.minPhotos}
                      onChange={(e) =>
                        setItem(idx, {
                          minPhotos: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                    photo{item.minPhotos === 1 ? "" : "s"}
                  </label>
                ) : (
                  <span className="text-xs text-slate-400">
                    Simple check (no photo required)
                  </span>
                )}
              </div>
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
