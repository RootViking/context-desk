"use client";

import { useEffect, useRef, useState } from "react";
import type { QuoteLoad } from "@/domain/quote";
import { marketPhase } from "@/domain/session-clock";

export type PulseLoad = { retrievedAt: string; loads: QuoteLoad[] };

/** Quotes for the main names, every 15 s in the session and every minute otherwise. */
export function usePulse(on: boolean) {
  const [result, setResult] = useState<PulseLoad | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;
    const load = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const response = await fetch("/api/pulse");
        if (response.ok) {
          const body = (await response.json()) as PulseLoad;
          if (!cancelled) setResult(body);
        }
      } catch {
        // keep the previous strip
      } finally {
        busy.current = false;
      }
    };
    const schedule = () => {
      const phase = marketPhase(new Date());
      timer = window.setTimeout(async () => {
        await load();
        schedule();
      }, phase === "regular" ? 15_000 : phase === "closed" ? 300_000 : 60_000);
    };
    void load();
    if (on) schedule();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [on]);
  return result;
}
