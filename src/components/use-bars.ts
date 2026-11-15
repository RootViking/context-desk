"use client";

import { useCallback, useEffect, useState } from "react";
import { TIMEFRAMES, type BarsLoad, type Candle, type Timeframe } from "@/domain/bars";

export type BarsBundle = {
  symbol: string;
  loads: Partial<Record<Timeframe, BarsLoad>>;
  candles: Record<Timeframe, Candle[]>;
  loading: boolean;
  failed: string | null;
  retrievedAt: string | null;
};

const EMPTY: Record<Timeframe, Candle[]> = { "15m": [], "1h": [], "1d": [] };

export async function fetchBars(symbol: string, tf: Timeframe, refresh = false): Promise<BarsLoad> {
  const response = await fetch(`/api/bars?symbol=${encodeURIComponent(symbol)}&tf=${tf}${refresh ? "&refresh=1" : ""}`);
  const body = (await response.json()) as BarsLoad & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Bars could not be read.");
  return body;
}

/** Loads 15-minute, hour, and day bars for one symbol. Delayed context, never a quote. */
export function useBars(symbol: string) {
  const [bundle, setBundle] = useState<BarsBundle>({ symbol, loads: {}, candles: EMPTY, loading: true, failed: null, retrievedAt: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBundle({ symbol, loads: {}, candles: EMPTY, loading: true, failed: null, retrievedAt: null });
    Promise.allSettled(TIMEFRAMES.map((tf) => fetchBars(symbol, tf, nonce > 0)))
      .then((results) => {
        if (cancelled) return;
        const loads: Partial<Record<Timeframe, BarsLoad>> = {};
        const candles: Record<Timeframe, Candle[]> = { ...EMPTY };
        const errors: string[] = [];
        results.forEach((result, index) => {
          const tf = TIMEFRAMES[index];
          if (result.status === "fulfilled") {
            loads[tf] = result.value;
            candles[tf] = result.value.candles;
            if (result.value.state === "error" && result.value.error) errors.push(`${tf}: ${result.value.error}`);
          } else errors.push(`${tf}: ${result.reason instanceof Error ? result.reason.message : "request failed"}`);
        });
        const retrievedAt = Object.values(loads).find((l) => l?.state === "ok")?.retrievedAt ?? null;
        setBundle({ symbol, loads, candles, loading: false, failed: errors.length ? errors.join(" ") : null, retrievedAt });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const current = bundle.symbol === symbol ? bundle : { symbol, loads: {}, candles: EMPTY, loading: true, failed: null, retrievedAt: null };
  return { ...current, refresh };
}
