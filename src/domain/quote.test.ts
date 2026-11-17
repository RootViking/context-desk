import { describe, expect, it } from "vitest";
import { applyQuoteToCandles, quoteIntervalMs, stampAge, type Quote } from "@/domain/quote";

const now = new Date("2026-11-16T15:00:00.000Z");

describe("quote", () => {
  it("grades the stamp age by measurement and phase", () => {
    expect(stampAge("2026-11-16T14:59:55.000Z", now, "regular").grade).toBe("fresh");
    expect(stampAge("2026-11-16T14:58:00.000Z", now, "regular").grade).toBe("lagging");
    expect(stampAge("2026-11-16T14:40:00.000Z", now, "regular").grade).toBe("stale");
    expect(stampAge("2026-11-16T14:59:55.000Z", now, "closed").grade).toBe("closed");
    expect(stampAge(null, now, "regular").grade).toBe("unknown");
  });

  it("polls fastest in the session and not at all when closed", () => {
    expect(quoteIntervalMs("regular")).toBe(10_000);
    expect(quoteIntervalMs("closed")).toBeNull();
  });

  it("patches only the candle that contains the quote", () => {
    const candles = [
      { time: 1_700_000_000, open: 10, high: 11, low: 9, close: 10.5, volume: 1 },
      { time: 1_700_000_900, open: 10.5, high: 10.8, low: 10.4, close: 10.6, volume: 1 },
    ];
    const quote: Quote = { symbol: "SPY", provider: "yahoo_chart", price: 11.2, time: new Date(1_700_001_500 * 1000).toISOString(), bid: null, ask: null, retrievedAt: "", minute: [], sessionOpen: null, prevClose: null };
    const out = applyQuoteToCandles(candles, quote, 900);
    expect(out[1]).toMatchObject({ close: 11.2, high: 11.2, low: 10.4 });
    expect(out[0]).toBe(candles[0]);
    const old: Quote = { ...quote, time: new Date(1_700_003_000 * 1000).toISOString() };
    expect(applyQuoteToCandles(candles, old, 900)).toBe(candles);
  });
});
