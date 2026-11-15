import { describe, expect, it } from "vitest";
import { candlesToBarObservations, parseYahooChart, regularSessionOnly, yahooChartUrl } from "@/domain/bars";

const chart = {
  chart: {
    result: [
      {
        meta: { symbol: "AAPL", dataGranularity: "15m", exchangeTimezoneName: "America/New_York", regularMarketPrice: 356.27, regularMarketTime: 1794603601 },
        // 2026-11-13 09:30, 09:45, 10:00 ET (EST, UTC-5) and one pre-market 09:15 bar.
        timestamp: [1794579300, 1794580200, 1794581100, 1794582000],
        indicators: { quote: [{ open: [1, 100, 101, null], high: [1, 102, 103, 104], low: [1, 99, 100, 101], close: [1, 101, 102, 103], volume: [1, 1000, 2000, 3000] }] },
      },
    ],
    error: null,
  },
};

describe("bars", () => {
  it("builds the chart URL with ^GSPC for SPX", () => {
    expect(yahooChartUrl("SPX", "15m")).toContain("%5EGSPC");
    expect(yahooChartUrl("TSLA", "1d")).toContain("interval=1d&range=2y");
  });

  it("zips columns into candles and drops rows with a missing price", () => {
    const parsed = parseYahooChart(chart);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.candles.length).toBe(3);
    expect(parsed.meta.regularMarketTime).toBe("2026-11-13T21:00:01.000Z");
  });

  it("converts 15m candles into regular-session tape rows with session open and partial flag", () => {
    const parsed = parseYahooChart(chart);
    if (!parsed.ok) throw new Error("parse failed");
    const rows = candlesToBarObservations(parsed.candles, "AAPL", {
      now: new Date("2026-11-13T14:50:00.000Z"),
      retrievedAt: "2026-11-13T14:50:00.000Z",
      sourceLabel: "Yahoo chart",
      delayNote: "delayed",
    });
    expect(rows.map((r) => r.windowStart)).toEqual(["09:30", "09:45"]);
    expect(rows[1].sessionOpen).toBe(100);
    expect(rows[0].partial).toBe(false);
    expect(rows[1].partial).toBe(true);
    expect(rows[0].sessionDate).toBe("2026-11-13");
  });

  it("drops pre-market rows and the 16:00 closing print from intraday candles", () => {
    const candles = [
      { time: 1794579300, open: 1, high: 1, low: 1, close: 1, volume: 0 }, // 09:15 ET
      { time: 1794580200, open: 1, high: 1, low: 1, close: 1, volume: 0 }, // 09:30 ET
      { time: 1794603600, open: 1, high: 1, low: 1, close: 1, volume: 0 }, // 16:00 ET
    ];
    expect(regularSessionOnly(candles, "15m").map((c) => c.time)).toEqual([1794580200]);
    expect(regularSessionOnly(candles, "1d").length).toBe(3);
  });

  it("refuses a chart error", () => {
    expect(parseYahooChart({ chart: { result: null, error: { description: "No data" } } })).toEqual({ ok: false, error: "Chart endpoint error: No data." });
  });
});
