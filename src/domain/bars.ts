import type { BarObservation } from "@/domain/participation";
import { INTERVAL_MINUTES, isRegularWindow } from "@/domain/participation";
import { isoToEasternLocal } from "@/domain/time";

export type Timeframe = "15m" | "1h" | "1d";
export const TIMEFRAMES: readonly Timeframe[] = ["15m", "1h", "1d"];
export const TIMEFRAME_LABEL: Record<Timeframe, string> = { "15m": "15-minute", "1h": "Hour", "1d": "Day" };

export type Candle = {
  /** Unix seconds, bar start. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type BarsMeta = {
  querySymbol: string;
  granularity: string | null;
  exchangeTimezone: string | null;
  regularMarketPrice: number | null;
  regularMarketTime: string | null;
};

export type BarsLoad = {
  symbol: string;
  timeframe: Timeframe;
  state: "ok" | "error";
  retrievedAt: string;
  url: string;
  error: string | null;
  notice: string;
  meta: BarsMeta | null;
  candles: Candle[];
};

export const BARS_NOTICE =
  "Yahoo Finance chart endpoint, unofficial and undocumented. Bars are delayed and may be revised. This is context, not a live feed and not a quote. TC2000 stays the chart of record.";

export const YAHOO_CHART_HOST = "query1.finance.yahoo.com";

const RANGE: Record<Timeframe, string> = { "15m": "30d", "1h": "180d", "1d": "2y" };
const INTERVAL: Record<Timeframe, string> = { "15m": "15m", "1h": "60m", "1d": "1d" };

export function barsQuerySymbol(symbol: string): string {
  return symbol === "SPX" ? "^GSPC" : symbol;
}

export function yahooChartUrl(symbol: string, timeframe: Timeframe): string {
  const query = encodeURIComponent(barsQuerySymbol(symbol));
  return `https://${YAHOO_CHART_HOST}/v8/finance/chart/${query}?interval=${INTERVAL[timeframe]}&range=${RANGE[timeframe]}&includePrePost=false`;
}

export function isTimeframe(value: string): value is Timeframe {
  return value === "15m" || value === "1h" || value === "1d";
}

type Parsed = { ok: true; candles: Candle[]; meta: BarsMeta } | { ok: false; error: string };

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Zips Yahoo's column arrays into candles. Rows with a missing OHLC value are dropped, not filled. */
export function parseYahooChart(json: unknown): Parsed {
  const chart = (json as { chart?: { result?: unknown; error?: { description?: string } | null } })?.chart;
  if (!chart) return { ok: false, error: "Chart response had no chart object." };
  if (chart.error) return { ok: false, error: `Chart endpoint error: ${chart.error.description ?? "unknown"}.` };
  const result = Array.isArray(chart.result) ? (chart.result[0] as Record<string, unknown> | undefined) : undefined;
  if (!result) return { ok: false, error: "Chart response had no result." };
  const meta = (result.meta ?? {}) as Record<string, unknown>;
  const timestamps = Array.isArray(result.timestamp) ? (result.timestamp as unknown[]) : [];
  const indicators = (result.indicators as { quote?: Record<string, unknown[]>[] } | undefined)?.quote?.[0] ?? {};
  const open = indicators.open ?? [];
  const high = indicators.high ?? [];
  const low = indicators.low ?? [];
  const close = indicators.close ?? [];
  const volume = indicators.volume ?? [];
  const candles: Candle[] = [];
  timestamps.forEach((stamp, index) => {
    const time = num(stamp);
    const o = num(open[index]);
    const h = num(high[index]);
    const l = num(low[index]);
    const c = num(close[index]);
    if (time === null || o === null || h === null || l === null || c === null) return;
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0) return;
    const v = num(volume[index]);
    candles.push({ time, open: o, high: h, low: l, close: c, volume: v === null || v === 0 ? (v === 0 ? 0 : null) : v });
  });
  candles.sort((a, b) => a.time - b.time);
  const regularTime = num(meta.regularMarketTime);
  return {
    ok: true,
    candles,
    meta: {
      querySymbol: typeof meta.symbol === "string" ? meta.symbol : "",
      granularity: typeof meta.dataGranularity === "string" ? meta.dataGranularity : null,
      exchangeTimezone: typeof meta.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : null,
      regularMarketPrice: num(meta.regularMarketPrice),
      regularMarketTime: regularTime === null ? null : new Date(regularTime * 1000).toISOString(),
    },
  };
}

/**
 * Keeps intraday candles whose Eastern start is inside 09:30–16:00. Yahoo appends a 16:00 closing
 * print as a zero-range bar and may include pre-market rows; neither is a regular-session bar.
 * Daily candles pass through unchanged.
 */
export function regularSessionOnly(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe === "1d") return candles;
  return candles.filter((candle) => {
    const eastern = candleEastern(candle);
    if (!eastern) return false;
    return eastern.clock >= "09:30" && eastern.clock < "16:00";
  });
}

export function candleEastern(candle: Candle): { sessionDate: string; clock: string } | null {
  const local = isoToEasternLocal(new Date(candle.time * 1000).toISOString());
  if (!local) return null;
  const [sessionDate, clock] = local.split("T");
  return { sessionDate, clock };
}

function addMinutes(clock: string, minutes: number): string {
  const [h, m] = clock.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Turns 15-minute candles into the tape's BarObservation rows.
 * Only regular-session windows are kept. The bar still in progress is marked partial.
 * SPX volume is left null because the index has no traded volume.
 */
export function candlesToBarObservations(
  candles: Candle[],
  symbol: string,
  options: { now: Date; retrievedAt: string; sourceLabel: string; delayNote: string },
): BarObservation[] {
  const sessionOpen = new Map<string, number>();
  const rows: BarObservation[] = [];
  const nowSeconds = options.now.getTime() / 1000;
  for (const candle of candles) {
    const eastern = candleEastern(candle);
    if (!eastern) continue;
    const windowEnd = addMinutes(eastern.clock, INTERVAL_MINUTES);
    if (!isRegularWindow(eastern.clock, windowEnd)) continue;
    if (!sessionOpen.has(eastern.sessionDate)) sessionOpen.set(eastern.sessionDate, candle.open);
    const partial = candle.time + INTERVAL_MINUTES * 60 > nowSeconds;
    rows.push({
      id: `${symbol}|${eastern.sessionDate}|${eastern.clock}`,
      symbol,
      sessionDate: eastern.sessionDate,
      windowStart: eastern.clock,
      windowEnd,
      volume: symbol === "SPX" ? null : candle.volume,
      open: candle.open,
      close: candle.close,
      sessionOpen: sessionOpen.get(eastern.sessionDate) ?? null,
      partial,
      closedSession: false,
      sourceLabel: options.sourceLabel,
      delayNote: options.delayNote,
      asOf: new Date(candle.time * 1000).toISOString(),
      observedAt: options.retrievedAt,
    });
  }
  return rows;
}
