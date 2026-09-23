"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionResult = { error?: string; message?: string } | void | undefined;

/**
 * Shared pending / error / success state for forms that call a server action.
 * On success it refreshes the route so server components re-fetch.
 */
export function useAction<A extends unknown[]>(
  fn: (...args: A) => Promise<ActionResult | object>,
  opts: { success?: string; onSuccess?: () => void } = {},
) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(...args: A): Promise<void> {
    setError(null);
    setMessage(null);
    setPending(true);
    const result = (await fn(...args)) as ActionResult;
    setPending(false);
    if (result && result.error) {
      setError(result.error);
      return;
    }
    setMessage((result && result.message) || opts.success || null);
    opts.onSuccess?.();
    router.refresh();
  }

  return { run, error, message, pending };
}

export function FormMessages({
  error,
  message,
}: {
  error: string | null;
  message: string | null;
}) {
  return (
    <>
      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      {message ? <p className="text-sm text-status-green">{message}</p> : null}
    </>
  );
}
