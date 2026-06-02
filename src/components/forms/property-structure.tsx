"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  addBuilding,
  addUnits,
  deleteBuilding,
  deleteUnit,
  setupSingleFamily,
} from "@/app/actions/structure";
import type { Building, Unit } from "@/lib/types";

type BuildingWithUnits = Building & { units: Unit[] };

export function PropertyStructure({
  propertyId,
  buildings,
}: {
  propertyId: string;
  buildings: BuildingWithUnits[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-status-red">{error}</p> : null}

      {buildings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm">
          <p className="mb-3 text-slate-600">
            No structure yet. A single-family home just needs one building and one
            unit.
          </p>
          <form action={() => run(() => setupSingleFamily(formData(propertyId)))}>
            <button type="submit" className="btn-secondary" disabled={busy}>
              Quick single-family setup
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          {buildings.map((b) => (
            <div key={b.id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{b.name}</h3>
                <button
                  onClick={() => run(() => deleteBuilding(b.id, propertyId))}
                  className="text-slate-400 hover:text-status-red"
                  aria-label="Delete building"
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {b.units.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {b.units.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                    >
                      {u.name}
                      <button
                        onClick={() => run(() => deleteUnit(u.id, propertyId))}
                        className="text-slate-400 hover:text-status-red"
                        aria-label={`Delete ${u.name}`}
                        disabled={busy}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mb-3 text-xs text-slate-400">No units yet.</p>
              )}

              <AddUnitsForm
                propertyId={propertyId}
                buildingId={b.id}
                busy={busy}
                onSubmit={run}
              />
            </div>
          ))}
        </div>
      )}

      <AddBuildingForm propertyId={propertyId} busy={busy} onSubmit={run} />
    </div>
  );
}

function formData(propertyId: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("property_id", propertyId);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

function AddBuildingForm({
  propertyId,
  busy,
  onSubmit,
}: {
  propertyId: string;
  busy: boolean;
  onSubmit: (fn: () => Promise<{ error?: string } | void>) => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      action={() => {
        if (!name.trim()) return;
        onSubmit(() => addBuilding(formData(propertyId, { name })));
        setName("");
      }}
    >
      <input
        className="input"
        placeholder="Add a building (e.g. Building A)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="btn-secondary shrink-0" disabled={busy}>
        + Building
      </button>
    </form>
  );
}

function AddUnitsForm({
  propertyId,
  buildingId,
  busy,
  onSubmit,
}: {
  propertyId: string;
  buildingId: string;
  busy: boolean;
  onSubmit: (fn: () => Promise<{ error?: string } | void>) => void;
}) {
  const [count, setCount] = useState("1");
  const [prefix, setPrefix] = useState("Unit");
  const [start, setStart] = useState("1");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      action={() => {
        onSubmit(() =>
          addUnits(
            formData(propertyId, {
              building_id: buildingId,
              count,
              prefix,
              start,
            }),
          ),
        );
      }}
    >
      <div>
        <label className="text-xs text-slate-400">How many</label>
        <input
          type="number"
          min="1"
          max="200"
          className="input w-20"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-slate-400">Label</label>
        <input
          className="input w-28"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-slate-400">Start #</label>
        <input
          type="number"
          className="input w-20"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-secondary" disabled={busy}>
        + Units
      </button>
    </form>
  );
}
