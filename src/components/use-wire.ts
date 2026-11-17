"use client";

import { useCallback, useEffect, useState } from "react";
import type { WireLoad } from "@/server/wire-client";

/** Public wire headlines. Keeps the last good load on screen while a refresh runs. */
export function useWire() {
  const [result, setResult] = useState<WireLoad | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/wire${nonce > 0 ? "?refresh=1" : ""}`)
      .then(async (response) => {
        const body = (await response.json()) as WireLoad & { error?: string };
        if (cancelled) return;
        if (!response.ok) setFailed(body.error ?? "The wire could not be read.");
        else {
          setResult(body);
          setFailed(null);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed("The wire request did not complete.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { result, failed, loading, refresh };
}
