import type { Candle, Timeframe } from "@/domain/bars";
import { TIMEFRAME_LABEL } from "@/domain/bars";
import { bandwidthPercentile, bollinger, sma, slope, stochastic, type BollingerPoint } from "@/domain/indicators";

/**
 * Direction read built on the Option Millionaire weights:
 * Bollinger 50 · moving averages 25 · candle 15 · stochastic 5 · volume 5.
 * It is an estimate from delayed bars, labeled as such. It never marks a checklist row.
 */
export const WEIGHTS = { bollinger: 50, movingAverages: 25, candle: 15, stochastic: 5, volume: 5 } as const;

export const MA_LENGTHS = [20, 40, 100, 200] as const;

export type Bias = "bullish" | "bearish" | "neutral";
export type BandState = "above_upper" | "upper_half" | "lower_half" | "below_lower" | "unknown";
export type Volatility = "squeeze" | "normal" | "expanding" | "high" | "unknown";
export type MaStack = "bullish" | "bearish" | "tangled" | "mixed" | "unknown";
export type CandleShape = "bullish" | "bearish" | "doji" | "unknown";

export type BandExit = {
  /** Direction of the most recent close outside the bands, if any within the lookback. */
  direction: "up" | "down" | null;
  barsAgo: number | null;
  /** Bands widening over the exit, your entry condition. */
  widening: boolean;
  /** Price extended far beyond the band (more than half a band span past it). */
  extended: boolean;
};

export type Component = { name: keyof typeof WEIGHTS; weight: number; score: number; reason: string };

export type TimeframeRead = {
  timeframe: Timeframe;
  label: string;
  bars: number;
  close: number | null;
  asOf: string | null;
  bands: BollingerPoint | null;
  bandState: BandState;
  bandwidthPercentile: number | null;
  volatility: Volatility;
  bandExit: BandExit;
  mas: Record<(typeof MA_LENGTHS)[number], number | null>;
  maStack: MaStack;
  aboveMid: boolean | null;
  candle: CandleShape;
  stochK: number | null;
  stochD: number | null;
  relativeVolume: number | null;
  components: Component[];
  /** −100 … +100. Positive leans up. */
  score: number;
  bias: Bias;
  reasons: string[];
};

export function readTimeframe(candles: Candle[], timeframe: Timeframe): TimeframeRead {
  const label = TIMEFRAME_LABEL[timeframe];
  const n = candles.length;
  const empty: TimeframeRead = {
    timeframe,
    label,
    bars: n,
    close: null,
    asOf: null,
    bands: null,
    bandState: "unknown",
    bandwidthPercentile: null,
    volatility: "unknown",
    bandExit: { direction: null, barsAgo: null, widening: false, extended: false },
    mas: { 20: null, 40: null, 100: null, 200: null },
    maStack: "unknown",
    aboveMid: null,
    candle: "unknown",
    stochK: null,
    stochD: null,
    relativeVolume: null,
    components: [],
    score: 0,
    bias: "neutral",
    reasons: [`${label}: fewer than 21 bars, so no read.`],
  };
  if (n < 21) return empty;
  const closes = candles.map((c) => c.close);
  const i = n - 1;
  const lastCandle = candles[i];
  const bands = bollinger(closes);
  const b = bands[i];
  const pct = bandwidthPercentile(bands, i);
  const mas = Object.fromEntries(MA_LENGTHS.map((len) => [len, sma(closes, len)[i] ?? null])) as TimeframeRead["mas"];
  const reasons: string[] = [];
  const components: Component[] = [];

  // Bollinger: position, slope of the mid, and the exit trigger.
  let bandState: BandState = "unknown";
  let bollScore = 0;
  const exit: BandExit = { direction: null, barsAgo: null, widening: false, extended: false };
  if (b) {
    bandState = lastCandle.close > b.upper ? "above_upper" : lastCandle.close < b.lower ? "below_lower" : b.pctB >= 0.5 ? "upper_half" : "lower_half";
    const midSlope = slope(bands.map((p) => (p ? p.mid : null)), i, 5) ?? 0;
    bollScore = (b.pctB - 0.5) * 2 * 60 + Math.max(-40, Math.min(40, midSlope * 4000));
    for (let k = i; k >= Math.max(0, i - 5); k -= 1) {
      const p = bands[k];
      if (!p) break;
      const c = candles[k];
      if (c.close > p.upper || c.close < p.lower) {
        exit.direction = c.close > p.upper ? "up" : "down";
        exit.barsAgo = i - k;
        const before = bands[k - 2];
        exit.widening = !!before && p.bandwidth > before.bandwidth * 1.03;
        const span = p.upper - p.lower;
        exit.extended = span > 0 && (c.close > p.upper ? (c.close - p.upper) / span > 0.5 : (p.lower - c.close) / span > 0.5);
        break;
      }
    }
    reasons.push(
      `${label} %B ${b.pctB.toFixed(2)} (${bandState.replace("_", " ")}), bandwidth ${(b.bandwidth * 100).toFixed(2)}%${pct === null ? "" : `, ${Math.round(pct * 100)}th percentile of the last 120 bars`}.`,
    );
    if (exit.direction) {
      reasons.push(
        `${label} closed ${exit.direction === "up" ? "above the upper" : "below the lower"} band ${exit.barsAgo === 0 ? "on the latest bar" : `${exit.barsAgo} bars ago`}${exit.widening ? " with bands widening" : " without widening"}${exit.extended ? ", extended past the band" : ""}.`,
      );
    }
  }
  components.push({ name: "bollinger", weight: WEIGHTS.bollinger, score: clamp(bollScore), reason: "Position in the bands and the slope of the 20 mid." });

  // Volatility state from bandwidth percentile and its change.
  let volatility: Volatility = "unknown";
  if (b && pct !== null) {
    const prior = bands[i - 3];
    const rising = !!prior && b.bandwidth > prior.bandwidth * 1.05;
    volatility = pct < 0.2 ? "squeeze" : pct > 0.8 ? "high" : rising ? "expanding" : "normal";
  }

  // Moving averages: stack order and price versus the 20.
  let maStack: MaStack = "unknown";
  let maScore = 0;
  const present = MA_LENGTHS.map((len) => mas[len]).filter((v): v is number => v !== null);
  if (present.length >= 2) {
    const ordered = MA_LENGTHS.filter((len) => mas[len] !== null).map((len) => mas[len] as number);
    const desc = ordered.every((v, idx) => idx === 0 || v <= ordered[idx - 1]);
    const asc = ordered.every((v, idx) => idx === 0 || v >= ordered[idx - 1]);
    const spread = (Math.max(...ordered) - Math.min(...ordered)) / lastCandle.close;
    maStack = spread < 0.01 ? "tangled" : desc ? "bullish" : asc ? "bearish" : "mixed";
    const ma20 = mas[20];
    const vs20 = ma20 === null ? 0 : ((lastCandle.close - ma20) / ma20) * 100;
    const slope20 = slope(sma(closes, 20), i, 5) ?? 0;
    maScore = (maStack === "bullish" ? 40 : maStack === "bearish" ? -40 : 0) + Math.max(-30, Math.min(30, vs20 * 10)) + Math.max(-30, Math.min(30, slope20 * 6000));
    reasons.push(`${label} averages ${maStack}${ma20 === null ? "" : `, close ${vs20 >= 0 ? "above" : "below"} the 20 by ${Math.abs(vs20).toFixed(2)}%`}.`);
  }
  components.push({ name: "movingAverages", weight: WEIGHTS.movingAverages, score: clamp(maScore), reason: "20/40/100/200 order, distance from the 20, and its slope." });

  // Candle shape on the last bar.
  const range = lastCandle.high - lastCandle.low;
  const body = lastCandle.close - lastCandle.open;
  let candle: CandleShape = "unknown";
  let candleScore = 0;
  if (range > 0) {
    const ratio = body / range;
    candle = Math.abs(ratio) < 0.1 ? "doji" : ratio > 0 ? "bullish" : "bearish";
    candleScore = ratio * 100;
  }
  components.push({ name: "candle", weight: WEIGHTS.candle, score: clamp(candleScore), reason: "Body direction and size on the latest bar." });

  // Stochastic, textbook form, labeled an approximation of Worden.
  const st = stochastic(candles);
  const k = st.k[i];
  const d = st.d[i];
  let stochScore = 0;
  if (k !== null && d !== null) stochScore = (k - 50) * 1.2 + (k - d) * 2;
  components.push({ name: "stochastic", weight: WEIGHTS.stochastic, score: clamp(stochScore), reason: "12/3 stochastic, an approximation of Worden." });

  // Volume versus its 20-bar average, signed by the candle.
  const vols = candles.map((c) => c.volume ?? 0);
  const avgVol = sma(vols, 20)[i];
  let rvol: number | null = null;
  let volScore = 0;
  if (avgVol && lastCandle.volume) {
    rvol = lastCandle.volume / avgVol;
    volScore = Math.max(-100, Math.min(100, (rvol - 1) * 60)) * (body >= 0 ? 1 : -1);
  }
  components.push({ name: "volume", weight: WEIGHTS.volume, score: clamp(volScore), reason: "Latest bar volume versus its 20-bar mean, in the candle's direction." });

  const total = components.reduce((sum, c) => sum + c.weight, 0);
  const score = components.reduce((sum, c) => sum + (c.score * c.weight) / total, 0);
  const bias: Bias = score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral";

  return {
    timeframe,
    label,
    bars: n,
    close: lastCandle.close,
    asOf: new Date(lastCandle.time * 1000).toISOString(),
    bands: b,
    bandState,
    bandwidthPercentile: pct,
    volatility,
    bandExit: exit,
    mas,
    maStack,
    aboveMid: b ? lastCandle.close >= b.mid : null,
    candle,
    stochK: k,
    stochD: d,
    relativeVolume: rvol,
    components,
    score: Math.round(score),
    bias,
    reasons,
  };
}

export type EntryCheck = {
  /** Your rule: a 15-minute close outside the bands as they widen, with a clear candle. */
  trigger: "call" | "put" | null;
  met: string[];
  missing: string[];
};

/**
 * The provisional entry on file: 15m price exits the bands as they widen, plus a clear candle,
 * not chased when extended. Hour and day must not disagree. Thresholds here are the desk's
 * working defaults, not Academy numbers.
 */
export function entryCheck(m15: TimeframeRead, h1: TimeframeRead, d1: TimeframeRead): EntryCheck {
  const met: string[] = [];
  const missing: string[] = [];
  const exit = m15.bandExit;
  if (!exit.direction || exit.barsAgo === null || exit.barsAgo > 1) {
    missing.push("No 15-minute close outside the bands on the last two bars.");
    return { trigger: null, met, missing };
  }
  met.push(`15-minute close ${exit.direction === "up" ? "above the upper" : "below the lower"} band.`);
  if (exit.widening) met.push("Bands are widening into the exit.");
  else missing.push("Bands are not widening. The exit is inside a flat band, not a volatility open.");
  if (m15.volatility === "high" || m15.volatility === "expanding") met.push(`15-minute volatility is ${m15.volatility}.`);
  else missing.push(`15-minute volatility is ${m15.volatility}, not expanding.`);
  const wantBull = exit.direction === "up";
  if ((wantBull && m15.candle === "bullish") || (!wantBull && m15.candle === "bearish")) met.push("Latest 15-minute candle agrees.");
  else missing.push("Latest 15-minute candle does not agree, or is a doji.");
  if (exit.extended) missing.push("Price is extended well past the band. Your note says not to chase unless a line or average was tested.");
  const higher = [h1, d1].filter((r) => r.bias !== "neutral");
  const disagree = higher.filter((r) => (wantBull ? r.bias === "bearish" : r.bias === "bullish"));
  if (disagree.length) missing.push(`${disagree.map((r) => r.label).join(" and ")} lean the other way.`);
  else if (higher.length) met.push(`${higher.map((r) => r.label).join(" and ")} do not disagree.`);
  const trigger = missing.length === 0 ? (wantBull ? "call" : "put") : null;
  return { trigger, met, missing };
}

export type DirectionRead = {
  reads: Record<Timeframe, TimeframeRead>;
  /** Day 45 · Hour 35 · 15-minute 20. Trend is set higher up, entry lower down. */
  combinedScore: number;
  bias: Bias;
  confidence: "low" | "medium" | "high";
  entry: EntryCheck;
  headline: string;
  disclaimer: string;
};

const TF_WEIGHT: Record<Timeframe, number> = { "1d": 45, "1h": 35, "15m": 20 };

export function readDirection(candlesByTf: Record<Timeframe, Candle[]>): DirectionRead {
  const reads = {
    "15m": readTimeframe(candlesByTf["15m"], "15m"),
    "1h": readTimeframe(candlesByTf["1h"], "1h"),
    "1d": readTimeframe(candlesByTf["1d"], "1d"),
  };
  const usable = (Object.keys(TF_WEIGHT) as Timeframe[]).filter((tf) => reads[tf].bars >= 21);
  const total = usable.reduce((s, tf) => s + TF_WEIGHT[tf], 0);
  const combined = total === 0 ? 0 : usable.reduce((s, tf) => s + reads[tf].score * TF_WEIGHT[tf], 0) / total;
  const bias: Bias = combined > 15 ? "bullish" : combined < -15 ? "bearish" : "neutral";
  const agree = usable.filter((tf) => reads[tf].bias === bias).length;
  const confidence = usable.length < 3 || Math.abs(combined) < 25 ? "low" : agree === 3 && Math.abs(combined) > 45 ? "high" : "medium";
  const entry = entryCheck(reads["15m"], reads["1h"], reads["1d"]);
  const headline =
    usable.length === 0
      ? "No bars loaded, so no direction read."
      : `${bias === "neutral" ? "No lean" : bias === "bullish" ? "Leans up" : "Leans down"} (${Math.round(combined)}), confidence ${confidence}. ${
          entry.trigger ? `Your 15-minute entry conditions are present for a ${entry.trigger}.` : "Your 15-minute entry conditions are not all present."
        }`;
  return {
    reads,
    combinedScore: Math.round(combined),
    bias,
    confidence,
    entry,
    headline,
    disclaimer:
      "An estimate from delayed bars, weighted the way your notes weight indicators. It is not a signal, not a forecast, and it does not mark a checklist row. Confirm on TC2000 before any order.",
  };
}

function clamp(value: number): number {
  return Math.max(-100, Math.min(100, value));
}
