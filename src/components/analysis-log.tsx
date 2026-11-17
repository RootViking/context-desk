"use client";

import { ANALYSIS_NOTE, type AnalysisEvent } from "@/domain/analysis";
import { formatInstantEt } from "@/domain/time";
import { Button } from "@/components/ui/button";

const KIND_LABEL: Record<AnalysisEvent["kind"], string> = {
  bias: "lean",
  band_exit: "band exit",
  volatility: "volatility",
  ma_stack: "averages",
  stoch_cross: "stoch",
  volume: "volume",
  entry: "ENTRY",
  pctb: "bands",
};

/** Live analysis: the narrative for now, then a log of what changed between refreshes. */
export function AnalysisLog({ symbol, lines, events, stampLine, onClear }: { symbol: string; lines: string[]; events: AnalysisEvent[]; stampLine: string; onClear: () => void }) {
  return (
    <section className="panel analysis" aria-labelledby="analysis-title">
      <div className="tape-head">
        <h2 id="analysis-title">Live analysis</h2>
        <p className="meta">{symbol} · {stampLine}</p>
        <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={events.length === 0}>Clear log</Button>
      </div>
      <ul className="narrative">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <ol className="event-log" aria-live="polite" aria-label="Changes between refreshes">
        {events.length === 0 ? <li className="meta">No change logged yet. Each refresh compares the new read to the last one.</li> : null}
        {events.map((event) => (
          <li key={event.id} className={`event lean-${event.lean} kind-${event.kind}`}>
            <span className="mono event-time">{formatInstantEt(event.at).replace(/^.*, \d{4}, /, "")}</span>
            <span className={`badge ${event.kind === "entry" ? "badge-on" : ""}`}>{KIND_LABEL[event.kind]}</span>
            <span className="mono event-tf">{event.timeframe === "all" ? "D+H+15" : event.timeframe}</span>
            <span>{event.text}</span>
          </li>
        ))}
      </ol>
      <p className="meta">{ANALYSIS_NOTE}</p>
    </section>
  );
}
