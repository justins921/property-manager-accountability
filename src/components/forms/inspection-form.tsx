"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createInspection } from "@/app/actions/vacancies";
import { createClient } from "@/lib/supabase/client";
import type { InspectionType, MediaType } from "@/lib/types";

const BUCKET = "vacancy-media";

export function InspectionForm({
  orgId,
  vacancyId,
  type,
}: {
  orgId: string;
  vacancyId: string;
  type: InspectionType;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const isMoveOut = type === "move_out";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const supabase = createClient();

    try {
      // Upload each file to private storage, keyed under the org folder.
      const media = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${orgId}/${vacancyId}/${type}-${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        const mediaType: MediaType = file.type.startsWith("video")
          ? "video"
          : "photo";
        media.push({ storage_path: path, media_type: mediaType });
      }

      const turnCostRaw = fd.get("estimated_turn_cost");
      const result = await createInspection({
        vacancy_id: vacancyId,
        type,
        damage_notes: isMoveOut
          ? String(fd.get("damage_notes") ?? "")
          : undefined,
        estimated_turn_cost:
          isMoveOut && turnCostRaw ? Number(turnCostRaw) : null,
        completion_notes: !isMoveOut
          ? String(fd.get("completion_notes") ?? "")
          : undefined,
        media,
      });

      if (result?.error) throw new Error(result.error);
      setOpen(false);
      setFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        {isMoveOut ? "+ Add move-out inspection" : "+ Add ready-for-market verification"}
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-slate-200 p-4"
    >
      {isMoveOut ? (
        <>
          <div>
            <label className="label">Damage notes</label>
            <textarea name="damage_notes" rows={3} className="input" />
          </div>
          <div>
            <label className="label">Estimated turn cost ($)</label>
            <input
              name="estimated_turn_cost"
              type="number"
              min="0"
              step="0.01"
              className="input"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="label">Completion notes</label>
          <textarea name="completion_notes" rows={3} className="input" />
        </div>
      )}

      <div>
        <label className="label">
          {isMoveOut
            ? "Walkthrough video & photos"
            : "Final walkthrough video & photos"}
        </label>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            {files.length} file{files.length === 1 ? "" : "s"} selected
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Uploading…" : "Save inspection"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setOpen(false)}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
