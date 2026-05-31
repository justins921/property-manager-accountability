"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { seedDefaultTemplate } from "@/app/actions/templates";

export function SeedTemplateButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const result = await seedDefaultTemplate();
    setLoading(false);
    if (result && "id" in result && result.id) {
      router.push(`/inspections/templates/${result.id}`);
      router.refresh();
    }
  }

  return (
    <button onClick={onClick} className="btn-secondary" disabled={loading}>
      {loading ? "Creating…" : "Start from default checklist"}
    </button>
  );
}
