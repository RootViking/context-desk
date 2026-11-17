import type { Candle } from "@/domain/bars";
import type { TimeframeRead } from "@/domain/direction";
import { candleEastern } from "@/domain/bars";
import { bollinger, sma } from "@/domain/indicators";

/**
 * The twelve Option Millionaire setups, matched only on what delayed bars can show.
 * Trendlines, "clear" candles, and TC2000's Worden line are not observable here and stay
 * on the verify list. A match is a candidate to look at in TC2000, never a go-ahead.
 */
export type StrategyMatch = {
  number: number;
  name: string;
  side: "call" | "put";
  met: string[];
  missing: string[];
  verify: string[];
  /** met / (met + missing). Verify items are not counted. */
  coverage: number;
};

type Inputs = {
  m15: TimeframeRead;
  h1: TimeframeRead;
  d1: TimeframeRead;
  candles15: Candle[];
  candlesDay: Candle[];
};

export function gapRead(candles15: Candle[], candlesDay: Candle[]): { gapPct: number | null; sessionDate: string | null; firstOutside: "up" | "down" | null } {
  if (candles15.length === 0) return { gapPct: null, sessionDate: null, firstOutside: null };
  const lastSession = candleEastern(candles15[candles15.length - 1])?.sessionDate ?? null;
  if (!lastSession) return { gapPct: null, sessionDate: null, firstOutside: null };
  const todayIdx = candles15.findIndex((c) => candleEastern(c)?.sessionDate === lastSession);
  const first = candles15[todayIdx];
  const priorDay = [...candlesDay].reverse().find((c) => (candleEastern(c)?.sessionDate ?? "") < lastSession);
  const gapPct = first && priorDay ? ((first.open - priorDay.close) / priorDay.close) * 100 : null;
  const bands = bollinger(candles15.map((c) => c.close));
  const b = bands[todayIdx];
  let firstOutside: "up" | "down" | null = null;
  if (first && b) {
    if (first.low > b.upper) firstOutside = "up";
    else if (first.high < b.lower) firstOutside = "down";
  }
  return { gapPct, sessionDate: lastSession, firstOutside };
}

export function matchStrategies(input: Inputs): StrategyMatch[] {
  const { m15, h1, d1, candles15, candlesDay } = input;
  const out: StrategyMatch[] = [];
  const gap = gapRead(candles15, candlesDay);
  const dayBull = d1.bias === "bullish";
  const dayBear = d1.bias === "bearish";
  const dayMid = d1.bands?.mid ?? null;
  const h1Close = h1.close;

  const push = (number: number, name: string, side: "call" | "put", met: string[], missing: string[], verify: string[]) => {
    const total = met.length + missing.length;
    out.push({ number, name, side, met, missing, verify, coverage: total === 0 ? 0 : met.length / total });
  };

  // 1 / 2: trend change on the hour. Trendline is TC2000's.
  for (const side of ["call", "put"] as const) {
    const bull = side === "call";
    const met: string[] = [];
    const missing: string[] = [];
    const ma20 = h1.mas[20];
    if (ma20 !== null && h1Close !== null) {
      if (bull ? h1Close > ma20 : h1Close < ma20) met.push(`Hour close ${bull ? "above" : "below"} the 20 MA.`);
      else missing.push(`Hour close is not ${bull ? "above" : "below"} the 20 MA.`);
    } else missing.push("Hour 20 MA unknown.");
    if ((bull && h1.candle === "bullish") || (!bull && h1.candle === "bearish")) met.push("Hour confirmation candle in the direction.");
    else missing.push("No hour confirmation candle yet.");
    if ((bull && m15.bias === "bullish") || (!bull && m15.bias === "bearish")) met.push(`15-minute read is ${m15.bias}.`);
    else missing.push(`15-minute read is ${m15.bias}, not fully ${bull ? "bullish" : "bearish"}.`);
    if ((bull && h1.maStack === "bearish") || (!bull && h1.maStack === "bullish")) met.push("Prior hour trend was the opposite way, so this would be a change.");
    else missing.push("Hour averages do not show a prior opposite trend.");
    push(bull ? 1 : 2, bull ? "Cambio de tendencia al alza (Hora)" : "Cambio de tendencia a la baja (Hora)", side, met, missing, [
      "Trendline hugging the prior trend and its break: draw and check in TC2000.",
    ]);
  }

  // 3 / 4: midline rebound on the day trend.
  for (const side of ["put", "call"] as const) {
    const bull = side === "call";
    const met: string[] = [];
    const missing: string[] = [];
    if (bull ? dayBull : dayBear) met.push(`Day read is ${d1.bias}.`);
    else missing.push(`Day read is ${d1.bias}, not ${bull ? "bullish" : "bearish"}.`);
    if (dayMid !== null && h1Close !== null) {
      const dist = ((h1Close - dayMid) / dayMid) * 100;
      const near = Math.abs(dist) < 1.5;
      if (near) met.push(`Hour price is within ${Math.abs(dist).toFixed(2)}% of the day midline.`);
      else missing.push(`Hour price is ${Math.abs(dist).toFixed(2)}% from the day midline.`);
      if (bull ? h1Close >= dayMid : h1Close <= dayMid) met.push("Midline respected so far.");
      else missing.push("Price is on the wrong side of the day midline.");
    } else missing.push("Day midline unknown.");
    if ((bull && h1.candle === "bullish") || (!bull && h1.candle === "bearish")) met.push("Hour candle turned with the trend.");
    else missing.push("Hour candle has not turned with the trend.");
    push(bull ? 4 : 3, bull ? "Rebote en punto medio, tendencia alcista (Día)" : "Rebote en punto medio, tendencia bajista (Día)", side, met, missing, [
      "Wait for the 15-minute turn, then an hour confirmation candle.",
    ]);
  }

  // 5 / 6: open outside the bands after a no-volatility session.
  for (const side of ["put", "call"] as const) {
    const bull = side === "call";
    const met: string[] = [];
    const missing: string[] = [];
    const want = bull ? "down" : "up";
    if (gap.firstOutside === want) met.push(`First 15-minute candle of the session opened fully ${want === "up" ? "above the upper" : "below the lower"} band.`);
    else missing.push(`First 15-minute candle did not open fully ${want === "up" ? "above the upper" : "below the lower"} band.`);
    if (m15.volatility === "squeeze") met.push("15-minute bands were in a squeeze (no volatility).");
    else missing.push(`15-minute volatility is ${m15.volatility}, not a squeeze going in.`);
    if (gap.gapPct !== null && (want === "up" ? gap.gapPct > 0.5 : gap.gapPct < -0.5)) met.push(`Gap ${gap.gapPct.toFixed(2)}% at the open.`);
    else missing.push("No clear gap in that direction at the open.");
    push(bull ? 6 : 5, bull ? "Apertura fuera de Bollinger a la baja (15m)" : "Apertura fuera de Bollinger al alza (15m)", side, met, missing, [
      "Entry is inside the first 5 minutes of the open. Prep before the bell.",
    ]);
  }

  // 7 / 8: magnet back to the 20 MA after a hard gap away from it.
  for (const side of ["call", "put"] as const) {
    const bull = side === "call";
    const met: string[] = [];
    const missing: string[] = [];
    if (bull ? h1.maStack === "bearish" : h1.maStack === "bullish") met.push(`Hour averages show a multi-day ${bull ? "down" : "up"}trend.`);
    else missing.push(`Hour averages are ${h1.maStack}, not a clear ${bull ? "down" : "up"}trend.`);
    const want = bull ? "down" : "up";
    if (gap.gapPct !== null && (want === "down" ? gap.gapPct < -1 : gap.gapPct > 1)) met.push(`Hard gap ${gap.gapPct.toFixed(2)}% away from the averages.`);
    else missing.push("No hard gap away from the 20 MA at the open.");
    if (gap.firstOutside === want) met.push("First 15-minute candle printed fully outside the bands.");
    else missing.push("First 15-minute candle did not print fully outside the bands.");
    push(bull ? 7 : 8, bull ? "Efecto Imán, tendencia bajista" : "Efecto Imán, tendencia alcista", side, met, missing, [
      "Trigger is the volume bar crossing the red Worden line in TC2000. Not observable here.",
    ]);
  }

  // 9 / 10: intraday trend change on the 15-minute. Trendline is TC2000's.
  for (const side of ["call", "put"] as const) {
    const bull = side === "call";
    const met: string[] = [];
    const missing: string[] = [];
    const mid = m15.bands?.mid ?? null;
    if (gap.gapPct !== null && (bull ? gap.gapPct > 0.3 : gap.gapPct < -0.3)) met.push(`Gap ${gap.gapPct.toFixed(2)}% at the open.`);
    else missing.push("No gap in that direction at the open.");
    if (mid !== null && m15.close !== null && (bull ? m15.close > mid : m15.close < mid)) met.push(`15-minute price ${bull ? "above" : "below"} the midline.`);
    else missing.push(`15-minute price is not ${bull ? "above" : "below"} the midline.`);
    if (m15.volatility === "expanding" || m15.volatility === "high") met.push("15-minute volatility opened.");
    else missing.push("15-minute volatility has not opened.");
    push(bull ? 9 : 10, bull ? "Cambio de tendencia al alza, intradía (15m)" : "Cambio de tendencia a la baja, intradía (15m)", side, met, missing, [
      "Trendline over the day's highs or under its lows: draw and check in TC2000.",
    ]);
  }

  // 11 / 12: medium-term lateral channel break on the day averages.
  const tangledDays = countTangledDays(candlesDay);
  for (const side of ["call", "put"] as const) {
    const bull = side === "call";
    const met: string[] = [];
    const missing: string[] = [];
    if (tangledDays >= 10) met.push(`Day 20/40/100/200 were tangled for ${tangledDays} sessions before today.`);
    else missing.push(`Day averages tangled for only ${tangledDays} sessions. The rule wants 10 or more.`);
    if ((bull && d1.candle === "bullish" && d1.bandState === "above_upper") || (!bull && d1.candle === "bearish" && d1.bandState === "below_lower")) met.push("Strong day candle out of the channel.");
    else if (gap.gapPct !== null && (bull ? gap.gapPct > 1 : gap.gapPct < -1)) met.push(`Gap ${gap.gapPct.toFixed(2)}% out of the channel.`);
    else missing.push("No strong day candle or gap out of the channel.");
    if (h1.volatility === "expanding" || h1.volatility === "high") met.push("Hour bands show high volatility.");
    else missing.push(`Hour volatility is ${h1.volatility}.`);
    push(bull ? 11 : 12, bull ? "Cambio lateral → alza, mediano plazo (MAs)" : "Cambio lateral → baja, mediano plazo (MAs)", side, met, missing, []);
  }

  return out.sort((a, b) => b.coverage - a.coverage || a.number - b.number);
}

/** Sessions, counted back from the one before the latest, where the four day MAs sat within 1.5% of each other. */
export function countTangledDays(candlesDay: Candle[]): number {
  const closes = candlesDay.map((c) => c.close);
  const mas = [20, 40, 100, 200].map((len) => sma(closes, len));
  let count = 0;
  for (let i = closes.length - 2; i >= 0; i -= 1) {
    const vals = mas.map((m) => m[i]);
    if (vals.some((v) => v === null)) break;
    const nums = vals as number[];
    const spread = (Math.max(...nums) - Math.min(...nums)) / closes[i];
    if (spread > 0.015) break;
    count += 1;
  }
  return count;
}
