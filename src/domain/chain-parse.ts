import { isoToEasternLocal } from "@/domain/time";

export type OptionRight = "call" | "put";

export type ChainContract = {
  occ: string;
  root: string;
  expiry: string;
  right: OptionRight;
  strike: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  openInterest: number | null;
  volume: number | null;
  lastTradeTime: string | null;
};

export type ChainUnderlying = {
  symbol: string;
  securityType: string | null;
  price: number | null;
  bid: number | null;
  ask: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volume: number | null;
  iv30: number | null;
  lastTradeTime: string | null;
};

export type ChainParsed =
  | { ok: true; underlying: ChainUnderlying; contracts: ChainContract[]; timestamp: string | null }
  | { ok: false; error: string };

export const CBOE_HOST = "cdn-api.cboe.com";
export const CBOE_DELAY_NOTE = "Cboe delayed quotes, labeled 15-minute delayed by Cboe. Not live. Not a quote for an order.";

export function cboeSymbol(symbol: string): string {
  return symbol === "SPX" ? "_SPX" : symbol;
}

export function cboeChainUrl(symbol: string): string {
  return `https://${CBOE_HOST}/api/global/delayed_quotes/options/${encodeURIComponent(cboeSymbol(symbol))}.json`;
}

const OCC = /^([A-Z0-9]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

export function parseOcc(occ: string): { root: string; expiry: string; right: OptionRight; strike: number } | null {
  const m = OCC.exec(occ);
  if (!m) return null;
  const [, root, yy, mm, dd, cp, strike] = m;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { root, expiry: `20${yy}-${mm}-${dd}`, right: cp === "C" ? "call" : "put", strike: Number(strike) / 1000 };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Cboe timestamps are Eastern wall-clock without a zone. They are kept as text. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parseCboeChain(json: unknown): ChainParsed {
  const data = (json as { data?: Record<string, unknown>; timestamp?: unknown })?.data;
  if (!data || typeof data !== "object") return { ok: false, error: "Cboe response had no data object." };
  const options = Array.isArray(data.options) ? (data.options as Record<string, unknown>[]) : null;
  if (!options) return { ok: false, error: "Cboe response had no options array." };
  const contracts: ChainContract[] = [];
  for (const row of options) {
    const occ = typeof row.option === "string" ? row.option : "";
    const parsed = parseOcc(occ);
    if (!parsed) continue;
    contracts.push({
      occ,
      ...parsed,
      bid: num(row.bid),
      ask: num(row.ask),
      last: num(row.last_trade_price),
      iv: num(row.iv),
      delta: num(row.delta),
      gamma: num(row.gamma),
      theta: num(row.theta),
      vega: num(row.vega),
      openInterest: num(row.open_interest),
      volume: num(row.volume),
      lastTradeTime: text(row.last_trade_time),
    });
  }
  return {
    ok: true,
    timestamp: text((json as { timestamp?: unknown }).timestamp),
    underlying: {
      symbol: typeof data.symbol === "string" ? data.symbol.replace(/^\^/, "") : "",
      securityType: text(data.security_type),
      price: num(data.current_price),
      bid: num(data.bid),
      ask: num(data.ask),
      open: num(data.open),
      high: num(data.high),
      low: num(data.low),
      prevClose: num(data.prev_day_close),
      volume: num(data.volume),
      iv30: num(data.iv30),
      lastTradeTime: text(data.last_trade_time),
    },
    contracts,
  };
}

export function roots(contracts: ChainContract[]): string[] {
  const counts = new Map<string, number>();
  for (const c of contracts) counts.set(c.root, (counts.get(c.root) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([root]) => root);
}

export function expirations(contracts: ChainContract[], root: string): string[] {
  return [...new Set(contracts.filter((c) => c.root === root).map((c) => c.expiry))].sort();
}

/**
 * Academy rule: the nearest expiration, or the next one once it is past 10:30 ET.
 * Expirations before the session date are skipped. Weekend sessions take the next listed date.
 */
export function pickExpiration(expiries: string[], nowIso: string): { expiry: string | null; reason: string } {
  const local = isoToEasternLocal(nowIso);
  if (!local) return { expiry: null, reason: "Clock could not be read." };
  const [date, clock] = local.split("T");
  const future = expiries.filter((e) => e >= date);
  if (future.length === 0) return { expiry: null, reason: "No listed expiration on or after today." };
  const late = clock >= "10:30";
  if (future[0] === date && late && future.length > 1) {
    return { expiry: future[1], reason: `Today's expiration skipped: it is past 10:30 ET, so the next one (${future[1]}) is used.` };
  }
  if (future[0] === date && late) return { expiry: future[0], reason: "Past 10:30 ET but no later expiration is listed." };
  return { expiry: future[0], reason: future[0] === date ? "Nearest expiration is today, before 10:30 ET." : `Nearest listed expiration is ${future[0]}.` };
}

export type SpreadRead = { mid: number | null; spread: number | null; spreadPct: number | null; wide: boolean | null };

/** Spread percent is (ask − bid) / midpoint. Wide means 10% or more, the Academy cutoff. */
export function spreadRead(bid: number | null, ask: number | null): SpreadRead {
  if (bid === null || ask === null || ask <= 0 || bid < 0 || ask < bid) return { mid: null, spread: null, spreadPct: null, wide: null };
  const mid = (bid + ask) / 2;
  if (mid === 0) return { mid: 0, spread: ask - bid, spreadPct: null, wide: null };
  const pct = ((ask - bid) / mid) * 100;
  return { mid, spread: ask - bid, spreadPct: pct, wide: pct >= 10 };
}

export type StrikeRow = { strike: number; call: ChainContract | null; put: ChainContract | null; atm: boolean };

/** Strikes around the underlying price for one root and expiration, `each` above and below. */
export function nearMoney(contracts: ChainContract[], root: string, expiry: string, price: number | null, each = 6): StrikeRow[] {
  const slice = contracts.filter((c) => c.root === root && c.expiry === expiry);
  const strikes = [...new Set(slice.map((c) => c.strike))].sort((a, b) => a - b);
  if (strikes.length === 0) return [];
  let center = 0;
  if (price !== null) {
    let best = Infinity;
    strikes.forEach((s, idx) => {
      const d = Math.abs(s - price);
      if (d < best) {
        best = d;
        center = idx;
      }
    });
  }
  const chosen = strikes.slice(Math.max(0, center - each), Math.min(strikes.length, center + each + 1));
  return chosen.map((strike) => ({
    strike,
    call: slice.find((c) => c.strike === strike && c.right === "call") ?? null,
    put: slice.find((c) => c.strike === strike && c.right === "put") ?? null,
    atm: price !== null && strike === strikes[center],
  }));
}
