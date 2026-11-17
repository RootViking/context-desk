import { BARS_NOTICE, YAHOO_CHART_HOST, barsQuerySymbol, parseYahooChart, regularSessionOnly, yahooChartUrl, type BarsLoad, type Timeframe } from "@/domain/bars";
import { publicGet } from "@/server/public-get";

const MAX_BYTES = 4_000_000;
const USER_AGENT = "Mozilla/5.0 (compatible; ContextDesk/0.2; personal read-only workstation)";
const SUCCESS_TTL_MS = 20_000;
const ERROR_TTL_MS = 20_000;

const cache = new Map<string, { at: number; ttl: number; value: BarsLoad }>();

export function clearBarsCache(): void {
  cache.clear();
}

export async function loadBars(
  fetchImpl: typeof fetch,
  symbol: string,
  timeframe: Timeframe,
  options?: { timeoutMs?: number; now?: Date; bypassCache?: boolean },
): Promise<BarsLoad> {
  const now = options?.now ?? new Date();
  const key = `${symbol}|${timeframe}`;
  const cached = cache.get(key);
  if (!options?.bypassCache && cached && now.getTime() - cached.at < cached.ttl) return cached.value;
  const url = yahooChartUrl(symbol, timeframe);
  const base = { symbol, timeframe, retrievedAt: now.toISOString(), url, notice: BARS_NOTICE };
  const result = await publicGet(fetchImpl, url, {
    host: YAHOO_CHART_HOST,
    timeoutMs: options?.timeoutMs ?? 8_000,
    maxBytes: MAX_BYTES,
    accept: "application/json",
    userAgent: USER_AGENT,
    label: "Yahoo chart",
  });
  let value: BarsLoad;
  if (!result.ok) {
    value = { ...base, state: "error", error: result.error, meta: null, candles: [] };
  } else {
    let json: unknown;
    try {
      json = JSON.parse(result.text);
    } catch {
      json = null;
    }
    const parsed = json === null ? ({ ok: false, error: "Yahoo chart response was not JSON." } as const) : parseYahooChart(json);
    if (!parsed.ok) value = { ...base, state: "error", error: parsed.error, meta: null, candles: [] };
    else if (parsed.meta.querySymbol && parsed.meta.querySymbol.toUpperCase() !== barsQuerySymbol(symbol).toUpperCase()) {
      value = { ...base, state: "error", error: `Yahoo answered for ${parsed.meta.querySymbol}, not ${barsQuerySymbol(symbol)}. Bars withheld.`, meta: null, candles: [] };
    } else value = { ...base, state: "ok", error: null, meta: parsed.meta, candles: regularSessionOnly(parsed.candles, timeframe) };
  }
  cache.set(key, { at: now.getTime(), ttl: value.state === "ok" ? SUCCESS_TTL_MS : ERROR_TTL_MS, value });
  return value;
}
