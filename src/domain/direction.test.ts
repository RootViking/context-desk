import { describe, expect, it } from "vitest";
import type { Candle } from "@/domain/bars";
import { entryCheck, readDirection, readTimeframe } from "@/domain/direction";
import { continuationOdds } from "@/domain/odds";

function series(n: number, step: number, start = 100, noise = 0): Candle[] {
  const out: Candle[] = [];
  let price = start;
  for (let i = 0; i < n; i += 1) {
    const open = price;
    price += step + (noise ? Math.sin(i) * noise : 0);
    out.push({ time: 1794580200 + i * 900, open, high: Math.max(open, price) + 0.2, low: Math.min(open, price) - 0.2, close: price, volume: 1000 });
  }
  return out;
}

describe("direction read", () => {
  it("returns no read with fewer than 21 bars", () => {
    const read = readTimeframe(series(10, 1), "15m");
    expect(read.bias).toBe("neutral");
    expect(read.reasons[0]).toMatch(/fewer than 21/);
  });

  it("leans up on a steady uptrend and down on a steady downtrend", () => {
    const up = readTimeframe(series(260, 0.5), "1d");
    const down = readTimeframe(series(260, -0.5, 300), "1d");
    expect(up.bias).toBe("bullish");
    expect(up.maStack).toBe("bullish");
    expect(down.bias).toBe("bearish");
    expect(down.maStack).toBe("bearish");
  });

  it("detects a band exit with widening after a squeeze", () => {
    const flat = series(60, 0, 100, 0.2);
    const burst = series(3, 3, flat[flat.length - 1].close).map((c, i) => ({ ...c, time: flat[flat.length - 1].time + 900 * (i + 1) }));
    const read = readTimeframe([...flat, ...burst], "15m");
    expect(read.bandExit.direction).toBe("up");
    expect(read.bandExit.widening).toBe(true);
    expect(read.bandState).toBe("above_upper");
  });

  it("entry check lists what is missing instead of rounding up", () => {
    const flat = readTimeframe(series(60, 0, 100, 0.2), "15m");
    const check = entryCheck(flat, flat, flat);
    expect(check.trigger).toBeNull();
    expect(check.missing[0]).toMatch(/No 15-minute close outside/);
  });

  it("combines timeframes and never claims high confidence when they disagree", () => {
    const read = readDirection({ "15m": series(60, -0.5, 300), "1h": series(260, 0.5), "1d": series(260, 0.5) });
    expect(["bullish", "neutral"]).toContain(read.bias);
    expect(read.confidence).not.toBe("high");
    expect(read.disclaimer).toMatch(/not a signal/);
  });

  it("continuation odds report sample counts and no rate without samples", () => {
    const odds = continuationOdds(series(30, 0));
    expect(odds.rows[0].samples).toBe(0);
    expect(odds.rows[0].continued).toBeNull();
  });
});
