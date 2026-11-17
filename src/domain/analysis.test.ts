import { describe, expect, it } from "vitest";
import type { Candle } from "@/domain/bars";
import { readDirection } from "@/domain/direction";
import { diffReads, narrate } from "@/domain/analysis";

function series(n: number, step: (i: number) => number, volume = 1000): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i += 1) {
    const close = step(i);
    out.push({ time: 1_700_000_000 + i * 900, open: close - 0.2, high: close + 0.5, low: close - 0.5, close, volume });
  }
  return out;
}

const flat = series(60, (i) => 100 + Math.sin(i / 3) * 0.3);
const breakout = [...flat.slice(0, 56), ...series(4, (i) => 100.3 + (i + 1) * 1.2, 4000).map((c, i) => ({ ...c, time: flat[56].time + i * 900 }))];

describe("analysis", () => {
  it("narrates each timeframe or says there are not enough bars", () => {
    const lines = narrate(readDirection({ "15m": flat, "1h": [], "1d": [] }));
    expect(lines[0]).toMatch(/^15-minute: price is/);
    expect(lines[1]).toMatch(/not enough bars/);
  });

  it("adds nothing when nothing changed", () => {
    const read = readDirection({ "15m": flat, "1h": flat, "1d": flat });
    expect(diffReads(read, read, "SPY", "2026-11-16T15:00:00.000Z")).toEqual([]);
  });

  it("logs a band exit and a volume spike on a breakout", () => {
    const before = readDirection({ "15m": flat, "1h": [], "1d": [] });
    const after = readDirection({ "15m": breakout, "1h": [], "1d": [] });
    const events = diffReads(before, after, "SPY", "2026-11-16T15:00:00.000Z");
    expect(events.some((e) => e.kind === "band_exit" && e.lean === "up")).toBe(true);
    expect(events.some((e) => e.kind === "volume")).toBe(true);
    expect(events.every((e) => e.symbol === "SPY")).toBe(true);
  });

  it("logs the entry trigger only on a transition", () => {
    const after = readDirection({ "15m": breakout, "1h": [], "1d": [] });
    const first = diffReads(null, after, "SPY", "t1");
    const again = diffReads(after, after, "SPY", "t2");
    expect(first.filter((e) => e.kind === "entry").length).toBe(after.entry.trigger ? 1 : 0);
    expect(again.filter((e) => e.kind === "entry").length).toBe(0);
  });
});
