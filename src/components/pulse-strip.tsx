"use client";

import type { PulseRow } from "@/domain/pulse";
import { PROVIDER_LABEL, stampAge, type QuoteProvider } from "@/domain/quote";
import type { MarketPhase } from "@/domain/session-clock";
import { Sparkline } from "@/components/gauge";

/** Your main names in one row: last price, change since the open, today's minute line, the 15-minute lean. */
export function PulseStrip({ rows, providers, selected, now, phase, onSelect }: { rows: PulseRow[]; providers: Record<string, QuoteProvider | undefined>; selected: string; now: Date; phase: MarketPhase; onSelect: (symbol: string) => void }) {
  return (
    <div className="pulse" role="list" aria-label="Main symbols">
      {rows.map((row) => {
        const age = stampAge(row.stamp, now, phase);
        const pct = row.sinceOpenPct ?? row.sincePrevClosePct;
        const up = pct === null ? null : pct >= 0;
        const provider = providers[row.symbol];
        return (
          <button key={row.symbol} type="button" role="listitem" className={`pulse-cell ${row.symbol === selected ? "pulse-on" : ""} age-${age.grade}`} onClick={() => onSelect(row.symbol)} title={provider ? `${PROVIDER_LABEL[provider]} · ${age.label}` : "No quote"}>
            <span className="pulse-head">
              <span className="mono pulse-symbol">{row.symbol}</span>
              <span className={`pulse-lean ${row.lean15 === "up" ? "lean-up" : row.lean15 === "down" ? "lean-down" : "lean-flat"}`}>{row.lean15 === "up" ? "▲" : row.lean15 === "down" ? "▼" : row.lean15 === "flat" ? "■" : "·"}</span>
            </span>
            <span className="mono pulse-price">{row.price === null ? "—" : row.price.toFixed(2)}</span>
            <Sparkline values={row.spark} up={up} />
            <span className={`mono pulse-change ${up === null ? "" : up ? "lean-up" : "lean-down"}`}>
              {pct === null ? "open Unknown" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% ${row.sinceOpenPct !== null ? "since open" : "vs prev close"}`}
            </span>
            <span className="meta pulse-age">{age.label}</span>
          </button>
        );
      })}
    </div>
  );
}
