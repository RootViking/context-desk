import type { Candle } from "@/domain/bars";
import { readTimeframe } from "@/domain/direction";
import type { Quote } from "@/domain/quote";

/** Your main names, in the order they sit on the strip. */
export const PULSE_SYMBOLS = ["SPY", "QQQ", "TSLA", "SPCX", "NVDA", "META"] as const;

export type PulseRow = {
  symbol: string;
  price: number | null;
  /** Change since today's regular-session open, from the provider's minute bars. Null when unknown. */
  sinceOpenPct: number | null;
  /** Change versus the prior close when the provider gives one. */
  sincePrevClosePct: number | null;
  spark: number[];
  lean15: "up" | "down" | "flat" | null;
  stamp: string | null;
};

export function pulseRow(symbol: string, quote: Quote | null, candles15: Candle[] | null): PulseRow {
  const price = quote?.price ?? null;
  const open = quote?.sessionOpen ?? null;
  const prev = quote?.prevClose ?? null;
  const read = candles15 && candles15.length >= 21 ? readTimeframe(candles15, "15m") : null;
  return {
    symbol,
    price,
    sinceOpenPct: price !== null && open !== null && open > 0 ? ((price - open) / open) * 100 : null,
    sincePrevClosePct: price !== null && prev !== null && prev > 0 ? ((price - prev) / prev) * 100 : null,
    spark: quote ? quote.minute.map((c) => c.close) : [],
    lean15: read ? (read.bias === "bullish" ? "up" : read.bias === "bearish" ? "down" : "flat") : null,
    stamp: quote?.time ?? null,
  };
}
