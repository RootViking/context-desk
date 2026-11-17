import type { Candle } from "@/domain/bars";

/** Simple moving average. Entries before the window fills are null, not zero. */
export function sma(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

export function ema(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length <= 0 || values.length < length) return out;
  const k = 2 / (length + 1);
  let seed = 0;
  for (let i = 0; i < length; i += 1) seed += values[i];
  let prev = seed / length;
  out[length - 1] = prev;
  for (let i = length; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function stddev(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    for (let j = i - length + 1; j <= i; j += 1) sum += values[j];
    const mean = sum / length;
    let sq = 0;
    for (let j = i - length + 1; j <= i; j += 1) sq += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(sq / length);
  }
  return out;
}

export type BollingerPoint = {
  mid: number;
  upper: number;
  lower: number;
  /** %B: 0 at the lower band, 1 at the upper band. */
  pctB: number;
  /** (upper − lower) / mid. The volatility read. */
  bandwidth: number;
};

export function bollinger(closes: number[], length = 20, mult = 2): (BollingerPoint | null)[] {
  const mids = sma(closes, length);
  const devs = stddev(closes, length);
  return closes.map((close, i) => {
    const mid = mids[i];
    const dev = devs[i];
    if (mid === null || dev === null || mid === 0) return null;
    const upper = mid + mult * dev;
    const lower = mid - mult * dev;
    const span = upper - lower;
    return { mid, upper, lower, pctB: span === 0 ? 0.5 : (close - lower) / span, bandwidth: span / mid };
  });
}

/**
 * Percentile rank of the last bandwidth against the prior `lookback` values (0..1).
 * Low means a squeeze, high means expanded bands. Null when there is not enough history.
 */
export function bandwidthPercentile(points: (BollingerPoint | null)[], index: number, lookback = 120): number | null {
  const current = points[index];
  if (!current) return null;
  const history: number[] = [];
  for (let i = Math.max(0, index - lookback); i < index; i += 1) {
    const p = points[i];
    if (p) history.push(p.bandwidth);
  }
  if (history.length < 20) return null;
  const below = history.filter((b) => b < current.bandwidth).length;
  return below / history.length;
}

/**
 * Stochastic %K with an SMA %D. Worden's stochastic in TC2000 is a proprietary variant;
 * this is the textbook form and is labeled an approximation wherever it is shown.
 */
export function stochastic(candles: Candle[], kLength = 12, dLength = 3): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = kLength - 1; i < candles.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kLength + 1; j <= i; j += 1) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    k[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
  }
  const d: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 0; i < k.length; i += 1) {
    if (i < dLength - 1) continue;
    let sum = 0;
    let ok = true;
    for (let j = i - dLength + 1; j <= i; j += 1) {
      const v = k[j];
      if (v === null) {
        ok = false;
        break;
      }
      sum += v;
    }
    d[i] = ok ? sum / dLength : null;
  }
  return { k, d };
}

/** Slope over `bars` as a fraction of the last value per bar. */
export function slope(values: (number | null)[], index: number, bars = 5): number | null {
  const last = values[index];
  const first = values[index - bars];
  if (last === null || last === undefined || first === null || first === undefined || first === 0) return null;
  return (last - first) / Math.abs(first) / bars;
}

export function last<T>(values: (T | null)[]): T | null {
  for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] !== null) return values[i];
  return null;
}
