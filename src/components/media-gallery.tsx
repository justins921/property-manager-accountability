"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InspectionMedia } from "@/lib/types";

const BUCKET = "vacancy-media";

/**
 * Renders private inspection media by requesting short-lived signed URLs from
 * Supabase Storage (the bucket is private; access is enforced by RLS).
 */
export function MediaGallery({ media }: { media: InspectionMedia[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const paths = media.map((m) => m.storage_path);
      if (paths.length === 0) return;
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, 60 * 60);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      data.forEach((d) => {
        if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      });
      setUrls(map);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [media]);

  if (media.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {media.map((m) => {
        const url = urls[m.storage_path];
        return (
          <div
            key={m.id}
            className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
          >
            {!url ? (
              <div className="flex aspect-square items-center justify-center text-xs text-slate-400">
                Loading…
              </div>
            ) : m.media_type === "video" ? (
              <video src={url} controls className="aspect-square w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt={m.caption ?? "Inspection photo"}
                  className="aspect-square w-full object-cover"
                />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
