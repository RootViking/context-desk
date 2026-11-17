import { expirations, nearMoney, pickExpiration, roots, spreadRead, type ChainContract, type ChainUnderlying } from "@/domain/chain-parse";
import type { DirectionRead } from "@/domain/direction";

export type CandidateSide = "call" | "put";

export type ContractCandidate = {
  side: CandidateSide | null;
  /** Why this side, or why none. Interpretation, never a signal. */
  basis: "entry" | "lean" | "none";
  confidence: DirectionRead["confidence"];
  reasons: string[];
  cautions: string[];
  root: string | null;
  expiry: string | null;
  expiryReason: string | null;
  strike: number | null;
  strikeNote: string;
  contract: ChainContract | null;
  alternates: ChainContract[];
  bid: number | null;
  ask: number | null;
  spreadPct: number | null;
  wide: boolean | null;
  /** Ask × multiplier. The premium for one contract if filled at the ask. */
  premiumPerContract: number | null;
  /** Academy target: the contract price up 10%. */
  targetPrice: number | null;
  /** 10% of the account as premium invested, the Academy cap, divided by one contract's premium. */
  contractsFor10Pct: number | null;
  budget10Pct: number | null;
  underlyingPrice: number | null;
  note: string;
};

export const CANDIDATE_NOTE =
  "A candidate is the desk’s reading of delayed bars and a delayed chain, put into the Academy’s shape: nearest expiration, 10% of the account as premium, +10% contract target, spread under 10%. It is interpretation. It is not a signal, not a forecast, and not an order. Strike selection is a desk default, not an Academy rule.";

const MULTIPLIER = 100;

/**
 * CALL or PUT with a strike, from the direction read and the Cboe delayed chain.
 * Side comes from your 15-minute entry when it is present, else from the combined lean when confidence
 * is at least medium. A flat or low-confidence read gives no side. Strike is the at-the-money strike,
 * the one nearest the delayed underlying price, with one strike out of the money shown as an alternate.
 */
export function contractCandidate(input: {
  read: DirectionRead;
  chain: { underlying: ChainUnderlying | null; contracts: ChainContract[]; retrievedAt: string } | null;
  accountSize: number | null;
}): ContractCandidate {
  const { read, chain } = input;
  const reasons: string[] = [];
  const cautions: string[] = [];
  let side: CandidateSide | null = null;
  let basis: ContractCandidate["basis"] = "none";
  if (read.entry.trigger) {
    side = read.entry.trigger;
    basis = "entry";
    reasons.push(`Your 15-minute entry conditions are present for a ${side.toUpperCase()}.`);
    for (const line of read.entry.met) reasons.push(line);
  } else if (read.bias !== "neutral" && read.confidence !== "low") {
    side = read.bias === "bullish" ? "call" : "put";
    basis = "lean";
    reasons.push(`Combined read leans ${read.bias === "bullish" ? "up" : "down"} (${read.combinedScore}) with ${read.confidence} confidence. Day 45 · hour 35 · 15m 20.`);
    cautions.push("Entry conditions are not all present. This is the lean, not your entry.");
    for (const line of read.entry.missing) cautions.push(line);
  } else {
    reasons.push(read.bias === "neutral" ? `No lean (${read.combinedScore}). No side.` : `Lean is ${read.bias} but confidence is low. No side.`);
  }
  const m15 = read.reads["15m"];
  if (m15.bandExit.extended) cautions.push("15m price is extended past the band. Your note says not to chase.");

  const base: ContractCandidate = {
    side,
    basis,
    confidence: read.confidence,
    reasons,
    cautions,
    root: null,
    expiry: null,
    expiryReason: null,
    strike: null,
    strikeNote: "At-the-money: the strike nearest the delayed price. Desk default, not an Academy rule.",
    contract: null,
    alternates: [],
    bid: null,
    ask: null,
    spreadPct: null,
    wide: null,
    premiumPerContract: null,
    targetPrice: null,
    contractsFor10Pct: null,
    budget10Pct: input.accountSize && input.accountSize > 0 ? input.accountSize * 0.1 : null,
    underlyingPrice: chain?.underlying?.price ?? null,
    note: CANDIDATE_NOTE,
  };
  if (!side) return base;
  if (!chain || !chain.underlying || chain.contracts.length === 0) {
    cautions.push("Load the Cboe delayed chain to put a strike and a quote on this side.");
    return base;
  }
  const rootList = roots(chain.contracts);
  const root = rootList[0] ?? null;
  if (!root) return base;
  const picked = pickExpiration(expirations(chain.contracts, root), chain.retrievedAt);
  if (!picked.expiry) {
    cautions.push(picked.reason);
    return { ...base, root, expiryReason: picked.reason };
  }
  const price = chain.underlying.price;
  const rows = nearMoney(chain.contracts, root, picked.expiry, price, 2);
  const atmIndex = rows.findIndex((row) => row.atm);
  if (atmIndex < 0 || price === null) {
    cautions.push("Underlying price Unknown on the chain, so no strike was chosen.");
    return { ...base, root, expiry: picked.expiry, expiryReason: picked.reason };
  }
  const pick = (row: (typeof rows)[number] | undefined) => (row ? (side === "call" ? row.call : row.put) : null);
  const contract = pick(rows[atmIndex]);
  const otm = pick(rows[side === "call" ? atmIndex + 1 : atmIndex - 1]);
  const itm = pick(rows[side === "call" ? atmIndex - 1 : atmIndex + 1]);
  if (!contract) {
    cautions.push("No contract at the at-the-money strike on that expiration.");
    return { ...base, root, expiry: picked.expiry, expiryReason: picked.reason };
  }
  const s = spreadRead(contract.bid, contract.ask);
  if (s.wide) cautions.push(`Spread ${s.spreadPct!.toFixed(1)}% is at or over the 10% cutoff. The Academy says skip a wide spread.`);
  if (s.wide === null) cautions.push("Spread Unknown: bid or ask missing on the delayed chain.");
  if (contract.lastTradeTime === null && contract.volume === null) cautions.push("No trade or volume shown on this contract in the delayed data.");
  const premium = contract.ask !== null && contract.ask > 0 ? contract.ask * MULTIPLIER : null;
  const budget = base.budget10Pct;
  const contracts = premium !== null && budget !== null ? Math.floor(budget / premium) : null;
  if (contracts === 0) cautions.push("One contract at the ask costs more than 10% of the account.");
  reasons.push(`${picked.reason}`);
  return {
    ...base,
    root,
    expiry: picked.expiry,
    expiryReason: picked.reason,
    strike: contract.strike,
    contract,
    alternates: [otm, itm].filter((c): c is ChainContract => c !== null),
    bid: contract.bid,
    ask: contract.ask,
    spreadPct: s.spreadPct,
    wide: s.wide,
    premiumPerContract: premium,
    targetPrice: contract.ask !== null ? Math.round(contract.ask * 1.1 * 100) / 100 : null,
    contractsFor10Pct: contracts,
    cautions,
  };
}
