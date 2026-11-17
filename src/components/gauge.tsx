"use client";

import type { Component, DirectionRead } from "@/domain/direction";

/** Half-dial for the combined score, −100 to +100. An estimate, labeled by its caller. */
export function LeanGauge({ score, bias, confidence }: { score: number; bias: DirectionRead["bias"]; confidence: DirectionRead["confidence"] }) {
  const clamped = Math.max(-100, Math.min(100, score));
  const angle = (clamped / 100) * 90;
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = 100;
  const cy = 96;
  const r = 78;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);
  const arc = (from: number, to: number, color: string) => {
    const a0 = ((from - 90) * Math.PI) / 180;
    const a1 = ((to - 90) * Math.PI) / 180;
    const R = 90;
    return <path d={`M ${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}`} stroke={color} strokeWidth="10" fill="none" strokeLinecap="butt" />;
  };
  const color = bias === "bullish" ? "var(--color-signal)" : bias === "bearish" ? "var(--color-clay)" : "var(--color-ink-soft)";
  return (
    <svg className="gauge" viewBox="0 0 200 110" role="img" aria-label={`Combined lean ${score}, ${bias}, confidence ${confidence}`}>
      {arc(-90, -15, "var(--color-clay)")}
      {arc(-15, 15, "var(--color-rule)")}
      {arc(15, 90, "var(--color-signal)")}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill={color} />
      <text x="12" y="106" className="gauge-tick">−100</text>
      <text x="166" y="106" className="gauge-tick">+100</text>
      <text x={cx} y="70" textAnchor="middle" className="gauge-figure" fill={color}>{score > 0 ? `+${score}` : score}</text>
      <text x={cx} y="86" textAnchor="middle" className="gauge-sub">{confidence} confidence</text>
    </svg>
  );
}

const NAME: Record<Component["name"], string> = { bollinger: "Bollinger", movingAverages: "Averages", candle: "Candle", stochastic: "Stochastic", volume: "Volume" };

/** One bar per weighted component, centered at zero. Width is the weight, fill is the score. */
export function ComponentBars({ components }: { components: Component[] }) {
  return (
    <ul className="component-bars" aria-label="Component scores">
      {components.map((c) => (
        <li key={c.name} title={c.reason}>
          <span className="component-name">{NAME[c.name]} <small>{c.weight}%</small></span>
          <span className="component-track" aria-hidden="true">
            <span className={`component-fill ${c.score >= 0 ? "fill-up" : "fill-down"}`} style={c.score >= 0 ? { left: "50%", width: `${c.score / 2}%` } : { right: "50%", width: `${-c.score / 2}%` }} />
          </span>
          <span className="mono component-score">{c.score > 0 ? "+" : ""}{Math.round(c.score)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Sparkline({ values, up }: { values: number[]; up: boolean | null }) {
  if (values.length < 2) return <svg className="spark" viewBox="0 0 80 24" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 80},${22 - ((v - min) / span) * 20}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 80 24" aria-hidden="true">
      <polyline points={points} fill="none" stroke={up === null ? "var(--color-ink-soft)" : up ? "var(--color-signal)" : "var(--color-clay)"} strokeWidth="1.5" />
    </svg>
  );
}
