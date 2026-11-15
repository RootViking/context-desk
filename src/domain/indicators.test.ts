import { describe, expect, it } from "vitest";
import { bandwidthPercentile, bollinger, sma, stochastic } from "@/domain/indicators";
import type { Candle } from "@/domain/bars";

describe("indicators", () => {
  it("sma leaves the warm-up null and averages the window", () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it("bollinger 20,2 on a flat series collapses to the price", () => {
    const flat = new Array(25).fill(10);
    const b = bollinger(flat);
    expect(b[19]?.mid).toBe(10);
    expect(b[19]?.upper).toBe(10);
    expect(b[19]?.bandwidth).toBe(0);
    expect(b[18]).toBeNull();
  });

  it("bandwidth percentile ranks a squeeze low", () => {
    const closes: number[] = [];
    for (let i = 0; i < 160; i += 1) closes.push(100 + (i < 120 ? Math.sin(i) * 5 : 0.01 * Math.sin(i)));
    const b = bollinger(closes);
    const pct = bandwidthPercentile(b, 159);
    expect(pct).not.toBeNull();
    expect(pct!).toBeLessThan(0.2);
  });

  it("stochastic is 100 at the window high", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i += 1) candles.push({ time: i, open: i, high: i + 1, low: i, close: i + 1, volume: 1 });
    const s = stochastic(candles);
    expect(s.k[14]).toBe(100);
  });
});
