"use client";

import { useEffect, useState } from "react";
import { CANDIDATE_NOTE, type ContractCandidate } from "@/domain/candidate";
import { spreadRead, type ChainContract } from "@/domain/chain-parse";
import type { StampAge } from "@/domain/quote";
import type { ChainPick } from "@/components/chain-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ACCOUNT_KEY = "context-desk.account-size.v1";

export function useAccountSize(): [number | null, (value: string) => void, string] {
  const [raw, setRaw] = useState("");
  useEffect(() => {
    try {
      setRaw(window.localStorage.getItem(ACCOUNT_KEY) ?? "");
    } catch {
      setRaw("");
    }
  }, []);
  const set = (value: string) => {
    setRaw(value);
    try {
      window.localStorage.setItem(ACCOUNT_KEY, value);
    } catch {
      // storage unavailable; the figure lives for this page only
    }
  };
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return [raw.trim() && Number.isFinite(n) && n > 0 ? n : null, set, raw];
}

/**
 * CALL or PUT with a strike. Side from your entry or the lean, strike at the money on the Academy's
 * expiration, with the spread check, the +10% target, and 10%-of-account sizing. Interpretation only.
 */
export function CandidatePanel({ symbol, candidate, chainLoaded, chainLoading, chainAge, quoteLine, accountRaw, onAccount, onLoadChain, onUse }: { symbol: string; candidate: ContractCandidate; chainLoaded: boolean; chainLoading: boolean; chainAge: StampAge | null; quoteLine: string; accountRaw: string; onAccount: (value: string) => void; onLoadChain: () => void; onUse: (pick: ChainPick) => void }) {
  const side = candidate.side;
  const tone = side === "call" ? "side-call" : side === "put" ? "side-put" : "side-none";
  const pick = (c: ChainContract): ChainPick => ({
    root: c.root,
    right: c.right,
    strike: String(c.strike),
    expiry: c.expiry,
    bid: c.bid === null ? "" : String(c.bid),
    ask: c.ask === null ? "" : String(c.ask),
    sourceName: "Cboe delayed quotes",
    feedDelay: "15 min (Cboe label)",
    sourceTimestampLocal: "",
  });
  return (
    <section className={`panel candidate ${tone}`} id="candidate" aria-labelledby="candidate-title">
      <div className="tape-head">
        <h2 id="candidate-title">Candidate</h2>
        <p className="meta">{symbol} · {quoteLine}</p>
      </div>
      <div className="candidate-grid">
        <div className="candidate-side">
          <p className="side-word mono">{side ? side.toUpperCase() : "NONE"}</p>
          <p className="meta">{candidate.basis === "entry" ? "from your 15-minute entry" : candidate.basis === "lean" ? "from the combined lean" : "no side on this read"} · confidence {candidate.confidence}</p>
        </div>
        <dl className="candidate-facts">
          <div>
            <dt>Strike</dt>
            <dd className="mono">{candidate.strike === null ? <span className="unknown-word">Unknown</span> : candidate.strike}</dd>
          </div>
          <div>
            <dt>Expiration</dt>
            <dd className="mono">{candidate.expiry ?? <span className="unknown-word">Unknown</span>}</dd>
          </div>
          <div>
            <dt>Bid / ask</dt>
            <dd className="mono">{candidate.bid === null && candidate.ask === null ? <span className="unknown-word">Unknown</span> : `${candidate.bid ?? "—"} / ${candidate.ask ?? "—"}`}</dd>
          </div>
          <div>
            <dt>Spread</dt>
            <dd className={`mono ${candidate.wide === null ? "unknown-word" : candidate.wide ? "spread-wide" : "spread-ok"}`}>{candidate.spreadPct === null ? "Unknown" : `${candidate.spreadPct.toFixed(1)}%${candidate.wide ? " wide" : " ok"}`}</dd>
          </div>
          <div>
            <dt>Premium / contract</dt>
            <dd className="mono">{candidate.premiumPerContract === null ? <span className="unknown-word">Unknown</span> : `$${candidate.premiumPerContract.toFixed(0)}`}</dd>
          </div>
          <div>
            <dt>+10% target</dt>
            <dd className="mono">{candidate.targetPrice === null ? <span className="unknown-word">Unknown</span> : candidate.targetPrice.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Contracts at 10% of account</dt>
            <dd className="mono">{candidate.contractsFor10Pct === null ? <span className="unknown-word">{candidate.budget10Pct === null ? "account size blank" : "Unknown"}</span> : `${candidate.contractsFor10Pct} (budget $${candidate.budget10Pct!.toFixed(0)})`}</dd>
          </div>
          <div>
            <dt>Underlying on chain</dt>
            <dd className="mono">{candidate.underlyingPrice === null ? <span className="unknown-word">Unknown</span> : candidate.underlyingPrice.toFixed(2)}{chainAge ? <span className="meta"> · {chainAge.label}</span> : null}</dd>
          </div>
        </dl>
      </div>
      <ul className="compact-list">
        {candidate.reasons.map((line) => (
          <li key={line} className="met">✓ {line}</li>
        ))}
        {candidate.cautions.map((line) => (
          <li key={line} className="missing">· {line}</li>
        ))}
      </ul>
      {candidate.alternates.length ? (
        <p className="meta">
          Alternates on the same expiration:{" "}
          {candidate.alternates.map((c) => {
            const s = spreadRead(c.bid, c.ask);
            return (
              <button key={c.occ} type="button" className="text-button mono" onClick={() => onUse(pick(c))} title="Copy this quote into the contract capture">
                {c.strike} {c.right} {c.bid ?? "—"}/{c.ask ?? "—"} {s.spreadPct === null ? "" : `(${s.spreadPct.toFixed(1)}%)`}
              </button>
            );
          })}
        </p>
      ) : null}
      <div className="inline-actions">
        <label className="meta account-field">
          Account size
          <Input inputMode="decimal" value={accountRaw} placeholder="e.g. 5000" onChange={(e) => onAccount(e.target.value)} aria-label="Account size in dollars, kept in this browser" />
        </label>
        {!chainLoaded ? (
          <Button type="button" variant="outline" size="sm" onClick={onLoadChain} disabled={chainLoading}>
            {chainLoading ? "Loading chain…" : "Load Cboe chain for a strike"}
          </Button>
        ) : null}
        {candidate.contract ? (
          <Button type="button" size="sm" onClick={() => onUse(pick(candidate.contract!))}>
            Copy into the contract capture
          </Button>
        ) : null}
      </div>
      <p className="meta">{CANDIDATE_NOTE}</p>
      <p className="meta">{candidate.strikeNote}</p>
    </section>
  );
}
