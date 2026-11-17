import type { Candle } from "@/domain/bars";
import type { MarketPhase } from "@/domain/session-clock";

export type QuoteProvider = "alpaca_iex" | "yahoo_chart";

export const PROVIDER_LABEL: Record<QuoteProvider, string> = {
  alpaca_iex: "Alpaca IEX real-time (licensed, IEX venue only)",
  yahoo_chart: "Yahoo chart (unofficial)",
};

export type Quote = {
  symbol: string;
  provider: QuoteProvider;
  /** Last price the provider reported. */
  price: number;
  /** The provider's own stamp for that price, ISO. */
  time: string;
  bid: number | null;
  ask: number | null;
  retrievedAt: string;
  /** Today's one-minute candles when the provider returns them, for the pulse sparkline. */
  minute: Candle[];
  sessionOpen: number | null;
  prevClose: number | null;
};

export type QuoteLoad = { symbol: string; state: "ok"; quote: Quote } | { symbol: string; state: "error"; error: string; retrievedAt: string };

export type StampAge = { seconds: number | null; grade: "fresh" | "lagging" | "stale" | "closed" | "unknown"; label: string };

/**
 * How old a feed's own stamp is against this clock. The grade is measured, never assumed:
 * fresh is under 30 s in the regular session, lagging under 5 min, stale beyond that.
 * Outside the regular session the last print is simply "closed", because nothing is trading.
 */
export function stampAge(stamp: string | null, now: Date, phase: MarketPhase): StampAge {
  if (!stamp) return { seconds: null, grade: "unknown", label: "stamp Unknown" };
  const t = Date.parse(stamp);
  if (Number.isNaN(t)) return { seconds: null, grade: "unknown", label: "stamp Unknown" };
  const seconds = Math.max(0, Math.round((now.getTime() - t) / 1000));
  const label = seconds < 60 ? `stamp ${seconds} s ago` : seconds < 3600 ? `stamp ${Math.floor(seconds / 60)} min ago` : `stamp ${Math.floor(seconds / 3600)} h ago`;
  if (phase !== "regular") return { seconds, grade: "closed", label: `${label} · session ${phase}` };
  if (seconds < 30) return { seconds, grade: "fresh", label };
  if (seconds < 300) return { seconds, grade: "lagging", label };
  return { seconds, grade: "stale", label };
}

/** Quote poll cadence by phase. Off when closed; the last print does not change. */
export function quoteIntervalMs(phase: MarketPhase): number | null {
  if (phase === "regular") return 10_000;
  if (phase === "pre" || phase === "after") return 30_000;
  return null;
}

/**
 * Folds a fresher quote into the last candle of a series, so the chart's live bar moves between
 * bar refreshes. Only the bar that contains the quote's time is touched; nothing is invented.
 */
export function applyQuoteToCandles(candles: Candle[], quote: Quote | null, barSeconds: number): Candle[] {
  if (!quote || candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  const t = Date.parse(quote.time) / 1000;
  if (!(t >= last.time && t < last.time + barSeconds)) return candles;
  const patched: Candle = { ...last, close: quote.price, high: Math.max(last.high, quote.price), low: Math.min(last.low, quote.price) };
  if (patched.close === last.close && patched.high === last.high && patched.low === last.low) return candles;
  return [...candles.slice(0, -1), patched];
}

export const QUOTE_NOTE =
  "The quote shows its provider and the age of the provider's own stamp. Alpaca IEX is a licensed real-time feed from one venue. Yahoo is unofficial; its stamp is usually seconds old in the session but it carries no licence. Neither is a quote for an order. Orders stay on the Thinkorswim phone, which has Schwab's quote.";
