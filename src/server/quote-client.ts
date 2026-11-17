import { barsQuerySymbol, parseYahooChart, regularSessionOnly, YAHOO_CHART_HOST } from "@/domain/bars";
import type { Quote, QuoteLoad } from "@/domain/quote";
import { publicGet } from "@/server/public-get";
import { alpacaKeys } from "@/server/secrets";

const TTL_MS = 5_000;
const USER_AGENT = "Mozilla/5.0 (compatible; ContextDesk/0.2; personal read-only workstation)";
const ALPACA_HOST = "data.alpaca.markets";
const cache = new Map<string, { at: number; value: QuoteLoad }>();

export function clearQuoteCache(): void {
  cache.clear();
}

/**
 * Last price for one symbol. Alpaca IEX (licensed real-time, one venue) when keys are present and the
 * symbol is a listed stock or ETF; otherwise the Yahoo one-minute chart, unofficial. Either way the
 * provider's own stamp travels with the price so the desk can show its measured age.
 */
export async function loadQuote(fetchImpl: typeof fetch, symbol: string, options?: { now?: Date; timeoutMs?: number }): Promise<QuoteLoad> {
  const now = options?.now ?? new Date();
  const cached = cache.get(symbol);
  if (cached && now.getTime() - cached.at < TTL_MS) return cached.value;
  const timeoutMs = options?.timeoutMs ?? 6_000;
  const keys = alpacaKeys();
  let value: QuoteLoad;
  if (keys && symbol !== "SPX") value = await fromAlpaca(fetchImpl, symbol, keys, now, timeoutMs);
  else value = await fromYahoo(fetchImpl, symbol, now, timeoutMs);
  if (value.state === "error" && keys && symbol !== "SPX") {
    const fallback = await fromYahoo(fetchImpl, symbol, now, timeoutMs);
    if (fallback.state === "ok") value = fallback;
  }
  cache.set(symbol, { at: now.getTime(), value });
  return value;
}

async function fromAlpaca(fetchImpl: typeof fetch, symbol: string, keys: { keyId: string; secret: string }, now: Date, timeoutMs: number): Promise<QuoteLoad> {
  const headers = { "APCA-API-KEY-ID": keys.keyId, "APCA-API-SECRET-KEY": keys.secret };
  const common = { host: ALPACA_HOST, timeoutMs, maxBytes: 200_000, accept: "application/json", userAgent: USER_AGENT, label: "Alpaca", headers };
  const [trade, quote] = await Promise.all([
    publicGet(fetchImpl, `https://${ALPACA_HOST}/v2/stocks/${encodeURIComponent(symbol)}/trades/latest?feed=iex`, common),
    publicGet(fetchImpl, `https://${ALPACA_HOST}/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=iex`, common),
  ]);
  if (!trade.ok) return { symbol, state: "error", error: trade.error, retrievedAt: now.toISOString() };
  let t: { trade?: { p?: number; t?: string } };
  let q: { quote?: { bp?: number; ap?: number } } = {};
  try {
    t = JSON.parse(trade.text);
    if (quote.ok) q = JSON.parse(quote.text);
  } catch {
    return { symbol, state: "error", error: "Alpaca response was not JSON.", retrievedAt: now.toISOString() };
  }
  const price = t.trade?.p;
  const time = t.trade?.t;
  if (typeof price !== "number" || typeof time !== "string") return { symbol, state: "error", error: "Alpaca latest trade had no price.", retrievedAt: now.toISOString() };
  const q2: Quote = {
    symbol,
    provider: "alpaca_iex",
    price,
    time: new Date(time).toISOString(),
    bid: typeof q.quote?.bp === "number" && q.quote.bp > 0 ? q.quote.bp : null,
    ask: typeof q.quote?.ap === "number" && q.quote.ap > 0 ? q.quote.ap : null,
    retrievedAt: now.toISOString(),
    minute: [],
    sessionOpen: null,
    prevClose: null,
  };
  return { symbol, state: "ok", quote: q2 };
}

async function fromYahoo(fetchImpl: typeof fetch, symbol: string, now: Date, timeoutMs: number): Promise<QuoteLoad> {
  const url = `https://${YAHOO_CHART_HOST}/v8/finance/chart/${encodeURIComponent(barsQuerySymbol(symbol))}?interval=1m&range=1d&includePrePost=false`;
  const result = await publicGet(fetchImpl, url, { host: YAHOO_CHART_HOST, timeoutMs, maxBytes: 2_000_000, accept: "application/json", userAgent: USER_AGENT, label: "Yahoo chart" });
  if (!result.ok) return { symbol, state: "error", error: result.error, retrievedAt: now.toISOString() };
  let json: unknown;
  try {
    json = JSON.parse(result.text);
  } catch {
    return { symbol, state: "error", error: "Yahoo chart response was not JSON.", retrievedAt: now.toISOString() };
  }
  const parsed = parseYahooChart(json);
  if (!parsed.ok) return { symbol, state: "error", error: parsed.error, retrievedAt: now.toISOString() };
  const minute = regularSessionOnly(parsed.candles, "15m");
  const price = parsed.meta.regularMarketPrice;
  const time = parsed.meta.regularMarketTime;
  if (price === null || time === null) return { symbol, state: "error", error: "Yahoo chart had no regular market price.", retrievedAt: now.toISOString() };
  const prevClose = (json as { chart?: { result?: { meta?: { chartPreviousClose?: unknown; previousClose?: unknown } }[] } }).chart?.result?.[0]?.meta;
  const pc = typeof prevClose?.previousClose === "number" ? prevClose.previousClose : typeof prevClose?.chartPreviousClose === "number" ? prevClose.chartPreviousClose : null;
  return {
    symbol,
    state: "ok",
    quote: { symbol, provider: "yahoo_chart", price, time, bid: null, ask: null, retrievedAt: now.toISOString(), minute, sessionOpen: minute[0]?.open ?? null, prevClose: pc },
  };
}
