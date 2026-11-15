"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TIMEFRAMES, type BarsLoad, type Candle, type Timeframe } from "@/domain/bars";

export type BarsBundle = {
  symbol: string;
  loads: Partial<Record<Timeframe, BarsLoad>>;
  candles: Record<Timeframe, Candle[]>;
  loading: boolean;
  failed: string | null;
  retrievedAt: string | null;
  /** Count of completed loads, so panels can tell a refresh from a first load. */
  generation: number;
};

const EMPTY: Record<Timeframe, Candle[]> = { "15m": [], "1h": [], "1d": [] };

export async function fetchBars(symbol: string, tf: Timeframe, refresh = false): Promise<BarsLoad> {
  const response = await fetch(`/api/bars?symbol=${encodeURIComponent(symbol)}&tf=${tf}${refresh ? "&refresh=1" : ""}`);
  const body = (await response.json()) as BarsLoad & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Bars could not be read.");
  return body;
}

function blank(symbol: string): BarsBundle {
  return { symbol, loads: {}, candles: EMPTY, loading: true, failed: null, retrievedAt: null, generation: 0 };
}

/**
 * Loads 15-minute, hour, and day bars for one symbol. Delayed context, never a quote.
 * A refresh keeps the previous candles on screen until the new ones arrive, so the chart does not flicker.
 */
export function useBars(symbol: string) {
  const [bundle, setBundle] = useState<BarsBundle>(() => blank(symbol));
  const [nonce, setNonce] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    inFlight.current = true;
    setBundle((prev) => (prev.symbol === symbol ? { ...prev, loading: true } : blank(symbol)));
    Promise.allSettled(TIMEFRAMES.map((tf) => fetchBars(symbol, tf, nonce > 0))).then((results) => {
      inFlight.current = false;
      if (cancelled) return;
      setBundle((prev) => {
        const loads: Partial<Record<Timeframe, BarsLoad>> = { ...prev.loads };
        const candles: Record<Timeframe, Candle[]> = { ...prev.candles };
        const errors: string[] = [];
        results.forEach((result, index) => {
          const tf = TIMEFRAMES[index];
          if (result.status === "fulfilled") {
            loads[tf] = result.value;
            if (result.value.state === "ok") candles[tf] = result.value.candles;
            else if (result.value.error) errors.push(`${tf}: ${result.value.error}`);
          } else errors.push(`${tf}: ${result.reason instanceof Error ? result.reason.message : "request failed"}`);
        });
        const retrievedAt = Object.values(loads).find((l) => l?.state === "ok")?.retrievedAt ?? prev.retrievedAt;
        return { symbol, loads, candles, loading: false, failed: errors.length ? errors.join(" ") : null, retrievedAt, generation: prev.generation + 1 };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, nonce]);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    setNonce((n) => n + 1);
  }, []);
  const current = bundle.symbol === symbol ? bundle : blank(symbol);
  return { ...current, refresh };
}
