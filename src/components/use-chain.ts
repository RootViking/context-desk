"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChainLoad } from "@/server/chain-client";

type Slot = { symbol: string; result: ChainLoad | null; failed: string | null; loading: boolean };

/** Cboe delayed chain for the selected symbol. Loaded on demand because the payload is large. */
export function useChain(symbol: string, enabled: boolean) {
  const [slot, setSlot] = useState<Slot>({ symbol, result: null, failed: null, loading: false });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setSlot({ symbol, result: null, failed: null, loading: true });
    fetch(`/api/chain?symbol=${encodeURIComponent(symbol)}${nonce > 0 ? "&refresh=1" : ""}`)
      .then(async (response) => {
        const body = (await response.json()) as ChainLoad & { error?: string };
        if (cancelled) return;
        if (!response.ok) setSlot({ symbol, result: null, failed: body.error ?? "The chain could not be read.", loading: false });
        else setSlot({ symbol, result: body, failed: null, loading: false });
      })
      .catch(() => {
        if (!cancelled) setSlot({ symbol, result: null, failed: "The chain request did not complete.", loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, nonce, enabled]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const current = slot.symbol === symbol ? slot : { symbol, result: null, failed: null, loading: enabled };
  return { result: current.result, failed: current.failed, loading: current.loading, refresh };
}
