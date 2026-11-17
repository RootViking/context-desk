"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { quoteIntervalMs, type Quote, type QuoteLoad } from "@/domain/quote";
import { marketPhase } from "@/domain/session-clock";

type Slot = { symbol: string; quote: Quote | null; failed: string | null };

/**
 * Polls the quote for one symbol on the phase cadence (10 s in the session). The previous quote
 * stays until a new one arrives. Nothing here is a quote for an order.
 */
export function useQuote(symbol: string, on: boolean) {
  const [slot, setSlot] = useState<Slot>({ symbol, quote: null, failed: null });
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
      const body = (await response.json()) as QuoteLoad & { error?: string };
      if (!response.ok || body.state !== "ok") setSlot((prev) => ({ symbol, quote: prev.symbol === symbol ? prev.quote : null, failed: body.state === "error" ? body.error : (body.error ?? "Quote unavailable.") }));
      else setSlot({ symbol, quote: body.quote, failed: null });
    } catch {
      setSlot((prev) => ({ symbol, quote: prev.symbol === symbol ? prev.quote : null, failed: "Quote request did not complete." }));
    } finally {
      busy.current = false;
    }
  }, [symbol]);

  useEffect(() => {
    void load();
    if (!on) return;
    let timer: number | null = null;
    const schedule = () => {
      const ms = quoteIntervalMs(marketPhase(new Date()));
      timer = window.setTimeout(async () => {
        await load();
        schedule();
      }, ms ?? 120_000);
    };
    schedule();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [load, on]);

  const current = slot.symbol === symbol ? slot : { symbol, quote: null, failed: null };
  return { quote: current.quote, failed: current.failed, refresh: load };
}
