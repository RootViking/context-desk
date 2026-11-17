import type { Candle } from "@/domain/bars";
import { bollinger } from "@/domain/indicators";

export type OddsRow = {
  event: string;
  samples: number;
  /** Share of samples where the close `horizon` bars later had moved further in the exit direction. */
  continued: number | null;
  /** Median move over the horizon, as a percent, signed in the exit direction. */
  medianMovePct: number | null;
};

export type Odds = { horizon: number; rows: OddsRow[]; note: string };

/**
 * Base rates on this symbol's own loaded bars: after a close outside a band while the bands
 * were widening, how often did price keep going over the next `horizon` bars?
 * History, not a forecast. Small samples are shown as small.
 */
export function continuationOdds(candles: Candle[], horizon = 4): Odds {
  const bands = bollinger(candles.map((c) => c.close));
  const up: number[] = [];
  const down: number[] = [];
  for (let i = 22; i < candles.length - horizon; i += 1) {
    const b = bands[i];
    const prior = bands[i - 2];
    if (!b || !prior) continue;
    const widening = b.bandwidth > prior.bandwidth * 1.03;
    if (!widening) continue;
    const c = candles[i].close;
    const later = candles[i + horizon].close;
    const move = ((later - c) / c) * 100;
    if (c > b.upper) up.push(move);
    else if (c < b.lower) down.push(-move);
  }
  const row = (event: string, moves: number[]): OddsRow => ({
    event,
    samples: moves.length,
    continued: moves.length ? moves.filter((m) => m > 0).length / moves.length : null,
    medianMovePct: moves.length ? median(moves) : null,
  });
  return {
    horizon,
    rows: [row("Close above the upper band, bands widening", up), row("Close below the lower band, bands widening", down)],
    note: `Measured on the loaded bars only, ${horizon} bars ahead. Fewer than 20 samples is anecdote. Past bars are not a forecast.`,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
