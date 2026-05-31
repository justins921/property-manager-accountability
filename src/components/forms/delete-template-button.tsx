"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteTemplate } from "@/app/actions/templates";

export function DeleteTemplateButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    setLoading(true);
    const result = await deleteTemplate(id);
    setLoading(false);
    if (!result?.error) {
      router.push("/inspections/templates");
      router.refresh();
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-sm font-semibold text-status-red hover:underline"
      >
        Delete template
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Delete this template?</span>
      <button
        onClick={onDelete}
        disabled={loading}
        className="font-semibold text-status-red hover:underline"
      >
        {loading ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-slate-500 hover:underline"
      >
        Cancel
      </button>
    </span>
  );
}
