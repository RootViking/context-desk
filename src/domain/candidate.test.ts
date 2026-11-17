import { describe, expect, it } from "vitest";
import type { Candle } from "@/domain/bars";
import type { ChainContract } from "@/domain/chain-parse";
import { readDirection } from "@/domain/direction";
import { contractCandidate } from "@/domain/candidate";

function trend(n: number, up: boolean): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const close = up ? 100 + i * 0.8 : 200 - i * 0.8;
    return { time: 1_700_000_000 + i * 900, open: close - (up ? 0.3 : -0.3), high: close + 0.5, low: close - 0.5, close, volume: 1000 };
  });
}

function contract(strike: number, right: "call" | "put", bid: number, ask: number): ChainContract {
  const occ = `SPY261120${right === "call" ? "C" : "P"}${String(strike * 1000).padStart(8, "0")}`;
  return { occ, root: "SPY", expiry: "2026-11-20", right, strike, bid, ask, last: null, iv: 0.2, delta: 0.5, gamma: null, theta: null, vega: null, openInterest: 10, volume: 5, lastTradeTime: "2026-11-16 15:00:00" };
}

const chain = {
  underlying: { symbol: "SPY", securityType: "ETF", price: 100.4, bid: null, ask: null, open: null, high: null, low: null, prevClose: null, volume: null, iv30: null, lastTradeTime: null },
  contracts: [99, 100, 101, 102].flatMap((k) => [contract(k, "call", 1.0, 1.1), contract(k, "put", 1.0, 1.4)]),
  retrievedAt: "2026-11-16T15:00:00.000Z",
};

describe("candidate", () => {
  it("gives no side on a flat read", () => {
    const flat = trend(60, true).map((c, i) => ({ ...c, close: 100 + Math.sin(i) * 0.1, open: 100, high: 100.2, low: 99.8 }));
    const read = readDirection({ "15m": flat, "1h": flat, "1d": flat });
    const c = contractCandidate({ read, chain, accountSize: 5000 });
    expect(c.side).toBeNull();
    expect(c.strike).toBeNull();
  });

  it("puts a strike, spread, target, and sizing on an up lean", () => {
    const up = trend(80, true);
    const read = readDirection({ "15m": up, "1h": up, "1d": up });
    const c = contractCandidate({ read, chain, accountSize: 5000 });
    expect(c.side).toBe("call");
    expect(c.strike).toBe(100);
    expect(c.expiry).toBe("2026-11-20");
    expect(c.premiumPerContract).toBeCloseTo(110);
    expect(c.targetPrice).toBeCloseTo(1.21);
    expect(c.contractsFor10Pct).toBe(4);
    expect(c.wide).toBe(false);
  });

  it("flags a wide spread on a put and asks for the chain when it is missing", () => {
    const down = trend(80, false);
    const read = readDirection({ "15m": down, "1h": down, "1d": down });
    const withChain = contractCandidate({ read, chain, accountSize: null });
    expect(withChain.side).toBe("put");
    expect(withChain.wide).toBe(true);
    expect(withChain.contractsFor10Pct).toBeNull();
    const noChain = contractCandidate({ read, chain: null, accountSize: 1000 });
    expect(noChain.side).toBe("put");
    expect(noChain.cautions.some((c) => /Load the Cboe/.test(c))).toBe(true);
  });
});
