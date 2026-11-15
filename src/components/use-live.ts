"use client";

import { useEffect, useRef, useState } from "react";
import { marketPhase, refreshIntervalMs, type MarketPhase } from "@/domain/session-clock";

export type LiveState = {
  on: boolean;
  phase: MarketPhase;
  intervalMs: number;
  /** Seconds until the next scheduled refresh, for the clock in the mast. */
  nextInSeconds: number;
  lastTickAt: string | null;
};

/**
 * Live mode: calls `onTick` on a cadence set by the market phase. It does not make anything live;
 * it re-reads delayed sources. The schedule resets when the user pauses, resumes, or changes symbol.
 */
export function useLive(onTick: () => void, resetKey: string) {
  const [on, setOn] = useState(true);
  const [phase, setPhase] = useState<MarketPhase>(() => marketPhase(new Date()));
  const [nextAt, setNextAt] = useState<number>(() => Date.now() + refreshIntervalMs(marketPhase(new Date())));
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tick = useRef(onTick);
  tick.current = onTick;

  useEffect(() => {
    if (!on) return;
    const current = marketPhase(new Date());
    setPhase(current);
    setNextAt(Date.now() + refreshIntervalMs(current));
    const id = window.setInterval(() => {
      const stamp = Date.now();
      setNow(stamp);
      const p = marketPhase(new Date(stamp));
      setPhase(p);
      setNextAt((due) => {
        if (stamp < due) return due;
        tick.current();
        setLastTickAt(new Date(stamp).toISOString());
        return stamp + refreshIntervalMs(p);
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [on, resetKey]);

  const state: LiveState = {
    on,
    phase,
    intervalMs: refreshIntervalMs(phase),
    nextInSeconds: on ? Math.max(0, Math.round((nextAt - now) / 1000)) : 0,
    lastTickAt,
  };
  return { live: state, setOn, refreshNow: () => setNextAt(0) };
}
