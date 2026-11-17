"use client";

import type { Candle, Timeframe } from "@/domain/bars";
import { readDirection, type TimeframeRead } from "@/domain/direction";
import { continuationOdds } from "@/domain/odds";
import { matchStrategies } from "@/domain/strategies";
import { formatInstantEt } from "@/domain/time";
import { Button } from "@/components/ui/button";
import { ComponentBars, LeanGauge } from "@/components/gauge";

/**
 * Direction read: where the delayed bars lean, weighted the way the notes weight indicators,
 * plus your 15-minute band-exit entry check, strategy candidates, and base rates on this symbol.
 * None of it marks a checklist row.
 */
export function DirectionPanel({
  symbol,
  candlesByTf,
  loading,
  failed,
  retrievedAt,
  onRefresh,
}: {
  symbol: string;
  candlesByTf: Record<Timeframe, Candle[]>;
  loading: boolean;
  failed: string | null;
  retrievedAt: string | null;
  onRefresh: () => void;
}) {
  const read = readDirection(candlesByTf);
  const odds = continuationOdds(candlesByTf["15m"]);
  const matches = matchStrategies({ m15: read.reads["15m"], h1: read.reads["1h"], d1: read.reads["1d"], candles15: candlesByTf["15m"], candlesDay: candlesByTf["1d"] });
  const top = matches.filter((m) => m.coverage >= 0.5).slice(0, 3);
  const tone = read.bias === "bullish" ? "lean-up" : read.bias === "bearish" ? "lean-down" : "lean-flat";
  const m15 = read.reads["15m"];

  return (
    <section className="panel read" id="direction" aria-labelledby="direction-title">
      <div className="tape-head">
        <h2 id="direction-title">Direction</h2>
        <p className={`rvol-figure ${tone}`}>{loading ? "…" : read.bias === "neutral" ? "Flat" : read.bias === "bullish" ? "Up" : "Down"}</p>
        <p className="meta">
          score {read.combinedScore} · confidence {read.confidence} · {retrievedAt ? `bars read ${formatInstantEt(retrievedAt)}` : "not loaded"} · bars are 15-minute component scores
        </p>
      </div>
      {failed ? <p className="errors">{failed}</p> : null}
      <div className="read-visual">
        <LeanGauge score={read.combinedScore} bias={read.bias} confidence={read.confidence} />
        <ComponentBars components={m15.components.length ? m15.components : []} />
      </div>
      <p className="result-line">{loading && !read.reads["15m"].bars ? "Loading bars…" : read.headline}</p>

      <div className={`entry ${read.entry.trigger ? "entry-on" : ""}`}>
        <p className="meta">
          <strong>Your entry</strong> · 15m band exit while widening, clear candle, hour and day not against it
          {read.entry.trigger ? ` · conditions present for a ${read.entry.trigger.toUpperCase()}` : " · not all present"}
        </p>
        <ul className="compact-list">
          {read.entry.met.map((line) => (
            <li key={line} className="met">✓ {line}</li>
          ))}
          {read.entry.missing.map((line) => (
            <li key={line} className="missing">· {line}</li>
          ))}
        </ul>
        <p className="meta">
          15m volatility <span className={m15.volatility === "high" || m15.volatility === "expanding" ? "vol-hot" : m15.volatility === "squeeze" ? "vol-cold" : undefined}>{m15.volatility}</span>
          {m15.bandwidthPercentile === null ? "" : ` · bandwidth at the ${Math.round(m15.bandwidthPercentile * 100)}th percentile`}
        </p>
      </div>

      <table className="ledger tf-table">
        <thead>
          <tr>
            <th scope="col">Frame</th>
            <th scope="col">Lean</th>
            <th scope="col">%B</th>
            <th scope="col">Vol</th>
            <th scope="col">MAs</th>
            <th scope="col">Candle</th>
          </tr>
        </thead>
        <tbody>
          {(["15m", "1h", "1d"] as Timeframe[]).map((tf) => (
            <TfRow key={tf} read={read.reads[tf]} />
          ))}
        </tbody>
      </table>

      <details>
        <summary>Why · component scores and reasons</summary>
        {(["1d", "1h", "15m"] as Timeframe[]).map((tf) => (
          <div key={tf} className="fact">
            <p className="meta">
              <strong>{read.reads[tf].label}</strong>
              {read.reads[tf].components.map((c) => ` · ${c.name} ${c.score > 0 ? "+" : ""}${Math.round(c.score)} (w${c.weight})`)}
            </p>
            {read.reads[tf].reasons.map((r) => (
              <p key={r} className="meta">{r}</p>
            ))}
          </div>
        ))}
        <p className="meta">{read.disclaimer}</p>
      </details>

      <details>
        <summary>Strategy candidates · {top.length} with half or more of the visible conditions</summary>
        {top.length === 0 ? <p className="meta">No setup has half of its visible conditions met. The trendline setups always need TC2000.</p> : null}
        {top.map((m) => (
          <div key={m.number} className="fact">
            <p>
              <strong>#{m.number} {m.name}</strong> → {m.side.toUpperCase()} · {Math.round(m.coverage * 100)}% of visible conditions
            </p>
            {m.met.map((line) => (
              <p key={line} className="meta met">✓ {line}</p>
            ))}
            {m.missing.map((line) => (
              <p key={line} className="meta missing">· {line}</p>
            ))}
            {m.verify.map((line) => (
              <p key={line} className="meta verify">TC2000: {line}</p>
            ))}
          </div>
        ))}
        <p className="meta">A candidate is a place to look in TC2000. It is not a go-ahead. Noticia mata estrategia: check Fed and earnings first.</p>
      </details>

      <details>
        <summary>Base rates on {symbol}’s own 15-minute bars</summary>
        {odds.rows.map((row) => (
          <p key={row.event} className="meta">
            {row.event}: {row.samples} samples
            {row.continued === null ? "" : `, continued ${Math.round(row.continued * 100)}% of the time, median move ${row.medianMovePct!.toFixed(2)}%`} over {odds.horizon} bars.
          </p>
        ))}
        <p className="meta">{odds.note}</p>
      </details>
      <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
        Reload bars
      </Button>
    </section>
  );
}

function TfRow({ read }: { read: TimeframeRead }) {
  const lean = read.bars < 21 ? "—" : read.bias === "bullish" ? `up ${read.score}` : read.bias === "bearish" ? `down ${read.score}` : `flat ${read.score}`;
  return (
    <tr>
      <th scope="row">{read.label}</th>
      <td className={read.bias === "bullish" ? "lean-up" : read.bias === "bearish" ? "lean-down" : undefined}>{lean}</td>
      <td className="mono">{read.bands ? read.bands.pctB.toFixed(2) : "—"}</td>
      <td className={read.volatility === "high" || read.volatility === "expanding" ? "vol-hot" : read.volatility === "squeeze" ? "vol-cold" : undefined}>{read.volatility === "unknown" ? "—" : read.volatility}</td>
      <td>{read.maStack === "unknown" ? "—" : read.maStack}</td>
      <td>{read.candle === "unknown" ? "—" : read.candle}</td>
    </tr>
  );
}
