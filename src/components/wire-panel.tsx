"use client";

import { useState } from "react";
import { agePhrase, classifyFreshness, retrievalPhrase } from "@/domain/freshness";
import { filterWire, type EventRisk, type WireFilter, type WireItem } from "@/domain/wire";
import type { WireLoad } from "@/server/wire-client";
import { SafeLink } from "@/components/safe-link";
import { Button } from "@/components/ui/button";

const FILTERS: { id: WireFilter; label: (symbol: string) => string }[] = [
  { id: "symbol", label: (s) => `Names ${s}` },
  { id: "watchlist", label: () => "Names a watchlist symbol" },
  { id: "macro", label: () => "Macro" },
  { id: "all", label: () => "All" },
];

/**
 * Public wire: CNBC, MarketWatch, Nasdaq, Federal Reserve, and SEC syndication feeds, titles only.
 * Tone is a keyword read of the title and is shown as such. Noticia mata estrategia: this sits first.
 */
export function WirePanel({ symbol, wire, failed, loading, now, risk, onRefresh, onAttach }: { symbol: string; wire: WireLoad | null; failed: string | null; loading: boolean; now: Date; risk: EventRisk; onRefresh: () => void; onAttach: (item: WireItem) => void }) {
  const [filter, setFilter] = useState<WireFilter>("all");
  const items = wire ? filterWire(wire.items, filter, symbol) : [];
  const fresh = items.filter((item) => classifyFreshness(item.publishedAt, null, now).freshness === "fresh");
  const rest = items.filter((item) => classifyFreshness(item.publishedAt, null, now).freshness !== "fresh");
  const broken = wire?.feeds.filter((feed) => feed.state === "error") ?? [];
  return (
    <div className="wire-live">
      <div className={`risk risk-${risk.level}`} role="status">
        <p className="risk-title">
          <strong>Noticia mata estrategia</strong> ·{" "}
          {risk.level === "news_first" ? "News first. A scheduled event outranks the bands today." : risk.level === "watch" ? "Watch. Something is near or fresh." : risk.level === "unknown" ? "Unknown. A calendar did not load." : "Quiet on the calendar. Quiet is not confirmed safe."}
        </p>
        <ul className="compact-list">
          {risk.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="tape-head">
        <h3 className="wire-h3">Wire</h3>
        <p className="meta">
          {wire ? `${wire.items.length} titles · ${retrievalPhrase(wire.retrievedAt, now)}` : loading ? "reading public feeds…" : "not loaded"}
          {broken.length ? ` · ${broken.length} feed${broken.length === 1 ? "" : "s"} Unknown` : ""}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>Refresh</Button>
      </div>
      {failed ? <p className="errors">{failed}</p> : null}
      <div className="filters" role="group" aria-label="Wire filter">
        {FILTERS.map((entry) => (
          <button key={entry.id} type="button" className={filter === entry.id ? "filter-btn filter-on" : "filter-btn"} aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
            {entry.label(symbol)}
            {wire ? ` · ${filterWire(wire.items, entry.id, symbol).length}` : ""}
          </button>
        ))}
      </div>
      {wire && items.length === 0 ? <p className="meta">No title matches this filter. That is not a report of no catalysts.</p> : null}
      <ul className="wire-list wire-stream">
        {fresh.map((item) => (
          <WireRow key={item.id} item={item} symbol={symbol} now={now} onAttach={onAttach} />
        ))}
      </ul>
      {rest.length ? (
        <details>
          <summary>Older titles · {rest.length}</summary>
          <ul className="wire-list wire-stream">
            {rest.slice(0, 60).map((item) => (
              <WireRow key={item.id} item={item} symbol={symbol} now={now} onAttach={onAttach} />
            ))}
          </ul>
        </details>
      ) : null}
      {broken.length ? (
        <details>
          <summary>Feeds that did not load · {broken.length}</summary>
          <ul className="compact-list">
            {broken.map((feed) => (
              <li key={feed.id}>
                {feed.label}: <span className="unknown-word">Unknown</span>. {feed.error}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="meta">Titles, links, and publication times from public syndication feeds. Bodies are not retrieved. Tone is a keyword read of the title, not a reading of the story, and never a buy or sell signal.</p>
    </div>
  );
}

function WireRow({ item, symbol, now, onAttach }: { item: WireItem; symbol: string; now: Date; onAttach: (item: WireItem) => void }) {
  const names = item.symbols.includes(symbol);
  return (
    <li className={`wire-row tone-${item.tone} ${names ? "wire-names" : ""}`}>
      <p className="wire-title">
        <span className={`tone-dot tone-${item.tone}`} aria-label={`keyword tone ${item.tone}`} title={item.toneWords.length ? `keyword tone from: ${item.toneWords.join(", ")}` : "no tone words"} />
        {item.title}
      </p>
      <p className="meta">
        <span className="badge">{item.publisher}</span>{" "}
        {item.symbols.map((s) => (
          <span key={s} className={`badge ${s === symbol ? "badge-on" : ""}`}>{s}</span>
        ))}
        {item.macroCue ? <span className="badge badge-unknown">{item.macroCue}</span> : null} {agePhrase(item.publishedAt, now)} · {item.linkHost}
      </p>
      <SafeLink href={item.url}>Open</SafeLink>{" "}
      {names ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onAttach(item)}>
          Attach headline
        </Button>
      ) : null}
    </li>
  );
}
