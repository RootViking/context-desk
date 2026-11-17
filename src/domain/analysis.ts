import type { Timeframe } from "@/domain/bars";
import type { DirectionRead, TimeframeRead } from "@/domain/direction";

export type AnalysisKind = "bias" | "band_exit" | "volatility" | "ma_stack" | "stoch_cross" | "volume" | "entry" | "pctb";

export type AnalysisEvent = {
  id: string;
  at: string;
  symbol: string;
  timeframe: Timeframe | "all";
  kind: AnalysisKind;
  lean: "up" | "down" | "flat";
  text: string;
};

/** One readable line per timeframe, rebuilt every refresh. Interpretation of delayed bars, not a signal. */
export function narrate(read: DirectionRead): string[] {
  return (["15m", "1h", "1d"] as Timeframe[]).map((tf) => {
    const r = read.reads[tf];
    if (r.bars < 21 || !r.bands) return `${r.label}: not enough bars for a read.`;
    const parts: string[] = [];
    parts.push(
      r.bandState === "above_upper" ? "price is outside the upper band" : r.bandState === "below_lower" ? "price is outside the lower band" : r.bandState === "upper_half" ? "price is in the upper half of the bands" : "price is in the lower half of the bands",
    );
    parts.push(
      r.volatility === "squeeze" ? "bands are squeezed" : r.volatility === "expanding" ? "bands are expanding" : r.volatility === "high" ? "bands are wide" : "band width is ordinary",
    );
    if (r.bandwidthPercentile !== null) parts[parts.length - 1] += ` (${Math.round(r.bandwidthPercentile * 100)}th percentile)`;
    if (r.maStack !== "unknown") parts.push(r.maStack === "bullish" ? "averages stacked up" : r.maStack === "bearish" ? "averages stacked down" : `averages ${r.maStack}`);
    if (r.stochK !== null && r.stochD !== null) parts.push(`stochastic ${Math.round(r.stochK)} ${r.stochK > r.stochD ? "rising" : r.stochK < r.stochD ? "falling" : "flat"}`);
    if (r.relativeVolume !== null) parts.push(`volume ${r.relativeVolume.toFixed(1)}× its average`);
    parts.push(`candle ${r.candle}`);
    return `${r.label}: ${parts.join(", ")}. Leans ${r.bias === "neutral" ? "flat" : r.bias === "bullish" ? "up" : "down"} (${r.score}).`;
  });
}

function leanOf(bias: TimeframeRead["bias"]): AnalysisEvent["lean"] {
  return bias === "bullish" ? "up" : bias === "bearish" ? "down" : "flat";
}

/**
 * What changed between two reads of the same symbol. Only transitions produce an event, so a quiet
 * refresh adds nothing. Events are observations about delayed bars, never instructions.
 */
export function diffReads(prev: DirectionRead | null, next: DirectionRead, symbol: string, at: string): AnalysisEvent[] {
  const out: AnalysisEvent[] = [];
  const push = (timeframe: AnalysisEvent["timeframe"], kind: AnalysisKind, lean: AnalysisEvent["lean"], text: string) =>
    out.push({ id: `${at}|${symbol}|${timeframe}|${kind}|${out.length}`, at, symbol, timeframe, kind, lean, text });

  if (prev && prev.bias !== next.bias) {
    push("all", "bias", leanOf(next.bias), `Combined lean moved from ${prev.bias} to ${next.bias} (${prev.combinedScore} → ${next.combinedScore}).`);
  }
  const prevTrig = prev?.entry.trigger ?? null;
  if (prevTrig !== next.entry.trigger) {
    if (next.entry.trigger) push("15m", "entry", next.entry.trigger === "call" ? "up" : "down", `Your 15-minute entry conditions are present for a ${next.entry.trigger.toUpperCase()}. Confirm in TC2000; check Fed and earnings first.`);
    else if (prev) push("15m", "entry", "flat", `Entry conditions are no longer all present: ${next.entry.missing[0] ?? "a condition dropped."}`);
  }
  for (const tf of ["15m", "1h", "1d"] as Timeframe[]) {
    const a = prev?.reads[tf] ?? null;
    const b = next.reads[tf];
    if (b.bars < 21) continue;
    const label = b.label;
    if (b.bandExit.direction && b.bandExit.barsAgo === 0 && !(a && a.bandExit.direction === b.bandExit.direction && a.bandExit.barsAgo === 0 && a.asOf === b.asOf)) {
      push(tf, "band_exit", b.bandExit.direction, `${label} close ${b.bandExit.direction === "up" ? "above the upper" : "below the lower"} band${b.bandExit.widening ? ", bands widening" : ", bands not widening"}${b.bandExit.extended ? ", extended" : ""}.`);
    }
    if (a && a.volatility !== "unknown" && a.volatility !== b.volatility) {
      push(tf, "volatility", b.volatility === "expanding" || b.volatility === "high" ? (b.score >= 0 ? "up" : "down") : "flat", `${label} volatility ${a.volatility} → ${b.volatility}${b.bandwidthPercentile === null ? "" : ` (${Math.round(b.bandwidthPercentile * 100)}th percentile)`}.`);
    }
    if (a && a.maStack !== "unknown" && a.maStack !== b.maStack) {
      push(tf, "ma_stack", b.maStack === "bullish" ? "up" : b.maStack === "bearish" ? "down" : "flat", `${label} averages ${a.maStack} → ${b.maStack}.`);
    }
    if (a && a.stochK !== null && a.stochD !== null && b.stochK !== null && b.stochD !== null) {
      const was = a.stochK > a.stochD;
      const is = b.stochK > b.stochD;
      if (was !== is) push(tf, "stoch_cross", is ? "up" : "down", `${label} stochastic crossed ${is ? "up" : "down"} at ${Math.round(b.stochK)} (12/3, Worden approximation).`);
    }
    if (b.relativeVolume !== null && b.relativeVolume >= 2 && !(a && a.relativeVolume !== null && a.relativeVolume >= 2 && a.asOf === b.asOf)) {
      push(tf, "volume", b.candle === "bullish" ? "up" : b.candle === "bearish" ? "down" : "flat", `${label} volume ${b.relativeVolume.toFixed(1)}× its 20-bar average on a ${b.candle} candle.`);
    }
    if (a && a.bands && b.bands) {
      const wasHot = a.bands.pctB > 1 || a.bands.pctB < 0;
      const isHot = b.bands.pctB > 1 || b.bands.pctB < 0;
      if (wasHot && !isHot) push(tf, "pctb", "flat", `${label} price came back inside the bands (%B ${b.bands.pctB.toFixed(2)}).`);
    }
  }
  return out;
}

export const ANALYSIS_NOTE = "Live analysis is a log of what changed in the delayed bars between refreshes. It is interpretation, not a signal, and it marks nothing on the checklist.";
