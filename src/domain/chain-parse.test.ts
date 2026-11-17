import { describe, expect, it } from "vitest";
import { expirations, nearMoney, parseCboeChain, parseOcc, pickExpiration, roots, spreadRead } from "@/domain/chain-parse";

const cboe = {
  timestamp: "2026-11-14 23:15:32",
  data: {
    symbol: "^SPX",
    security_type: "index",
    current_price: 7561.67,
    iv30: 14.2,
    last_trade_time: "2026-11-13T16:14:59",
    options: [
      { option: "SPX261120C07550000", bid: 60, ask: 62, iv: 0.14, delta: 0.52, open_interest: 100, volume: 5 },
      { option: "SPX261120P07550000", bid: 55, ask: 57, iv: 0.15, delta: -0.48, open_interest: 90, volume: 7 },
      { option: "SPXW261117C07550000", bid: 20, ask: 24, iv: 0.13, delta: 0.5, open_interest: 10, volume: 1 },
      { option: "SPXW261117C07600000", bid: 1, ask: 1.5, iv: 0.13, delta: 0.2, open_interest: 10, volume: 1 },
      { option: "garbage", bid: 1, ask: 2 },
    ],
  },
};

describe("Cboe chain", () => {
  it("parses OCC symbols with the strike in thousandths", () => {
    expect(parseOcc("AAPL261116C00275000")).toEqual({ root: "AAPL", expiry: "2026-11-16", right: "call", strike: 275 });
    expect(parseOcc("SPXW261125P08225000")?.root).toBe("SPXW");
    expect(parseOcc("nope")).toBeNull();
  });

  it("keeps SPX and SPXW as separate roots and drops bad rows", () => {
    const parsed = parseCboeChain(cboe);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.underlying.symbol).toBe("SPX");
    expect(parsed.contracts.length).toBe(4);
    expect(roots(parsed.contracts).sort()).toEqual(["SPX", "SPXW"]);
    expect(expirations(parsed.contracts, "SPXW")).toEqual(["2026-11-17"]);
  });

  it("picks the nearest expiration, or the next after 10:30 ET", () => {
    const list = ["2026-11-13", "2026-11-17", "2026-11-20"];
    expect(pickExpiration(list, "2026-11-13T14:00:00.000Z").expiry).toBe("2026-11-13"); // 09:00 ET
    expect(pickExpiration(list, "2026-11-13T16:00:00.000Z").expiry).toBe("2026-11-17"); // 11:00 ET
    expect(pickExpiration(list, "2026-11-14T16:00:00.000Z").expiry).toBe("2026-11-17");
    expect(pickExpiration(["2026-11-01"], "2026-11-14T16:00:00.000Z").expiry).toBeNull();
  });

  it("marks a spread of 10% or more as wide and refuses crossed quotes", () => {
    expect(spreadRead(1, 1.5).wide).toBe(true);
    expect(spreadRead(60, 62).wide).toBe(false);
    expect(spreadRead(2, 1).spreadPct).toBeNull();
    expect(spreadRead(null, 1).wide).toBeNull();
  });

  it("builds near-the-money rows with calls and puts side by side", () => {
    const parsed = parseCboeChain(cboe);
    if (!parsed.ok) throw new Error("parse failed");
    const rows = nearMoney(parsed.contracts, "SPX", "2026-11-20", 7561.67, 3);
    expect(rows.length).toBe(1);
    expect(rows[0].call?.bid).toBe(60);
    expect(rows[0].put?.ask).toBe(57);
    expect(rows[0].atm).toBe(true);
  });
});
