import { CBOE_DELAY_NOTE, CBOE_HOST, cboeChainUrl, cboeSymbol, parseCboeChain, type ChainContract, type ChainUnderlying } from "@/domain/chain-parse";
import { publicGet } from "@/server/public-get";

export type ChainLoad = {
  symbol: string;
  state: "ok" | "error";
  retrievedAt: string;
  url: string;
  error: string | null;
  notice: string;
  /** Cboe's own stamp, Eastern wall clock as text. */
  timestamp: string | null;
  underlying: ChainUnderlying | null;
  contracts: ChainContract[];
};

/** SPX arrives near 13 MB. Stocks and ETFs are 1.5 to 6 MB. */
const MAX_BYTES = 20_000_000;
const USER_AGENT = "Mozilla/5.0 (compatible; ContextDesk/0.2; personal read-only workstation)";
const SUCCESS_TTL_MS = 60_000;
const ERROR_TTL_MS = 20_000;

const cache = new Map<string, { at: number; ttl: number; value: ChainLoad }>();

export function clearChainCache(): void {
  cache.clear();
}

export async function loadChain(
  fetchImpl: typeof fetch,
  symbol: string,
  options?: { timeoutMs?: number; now?: Date; bypassCache?: boolean },
): Promise<ChainLoad> {
  const now = options?.now ?? new Date();
  const cached = cache.get(symbol);
  if (!options?.bypassCache && cached && now.getTime() - cached.at < cached.ttl) return cached.value;
  const url = cboeChainUrl(symbol);
  const base = { symbol, retrievedAt: now.toISOString(), url, notice: CBOE_DELAY_NOTE };
  const result = await publicGet(fetchImpl, url, {
    host: CBOE_HOST,
    timeoutMs: options?.timeoutMs ?? 12_000,
    maxBytes: MAX_BYTES,
    accept: "application/json",
    userAgent: USER_AGENT,
    label: "Cboe delayed quotes",
  });
  let value: ChainLoad;
  if (!result.ok) value = { ...base, state: "error", error: result.error, timestamp: null, underlying: null, contracts: [] };
  else {
    let json: unknown = null;
    try {
      json = JSON.parse(result.text);
    } catch {
      json = null;
    }
    const parsed = json === null ? ({ ok: false, error: "Cboe response was not JSON." } as const) : parseCboeChain(json);
    if (!parsed.ok) value = { ...base, state: "error", error: parsed.error, timestamp: null, underlying: null, contracts: [] };
    else if (parsed.underlying.symbol.toUpperCase() !== cboeSymbol(symbol).replace(/^_/, "").toUpperCase()) {
      value = { ...base, state: "error", error: `Cboe answered for ${parsed.underlying.symbol}, not ${symbol}. Chain withheld.`, timestamp: null, underlying: null, contracts: [] };
    } else value = { ...base, state: "ok", error: null, timestamp: parsed.timestamp, underlying: parsed.underlying, contracts: parsed.contracts };
  }
  cache.set(symbol, { at: now.getTime(), ttl: value.state === "ok" ? SUCCESS_TTL_MS : ERROR_TTL_MS, value });
  return value;
}
