"use client";

import { useState } from "react";
import { expirations, nearMoney, pickExpiration, roots, spreadRead, type ChainContract } from "@/domain/chain-parse";
import { formatInstantEt } from "@/domain/time";
import type { ChainLoad } from "@/server/chain-client";
import { Button } from "@/components/ui/button";

export type ChainPick = { root: string; right: "call" | "put"; strike: string; expiry: string; bid: string; ask: string; sourceName: string; feedDelay: string; sourceTimestampLocal: string };

/**
 * Cboe delayed chain for the selected symbol: the Academy's expiration pick, near-the-money strikes,
 * and the spread check at 10%. "Use" copies the quote into the manual capture, where debit,
 * multiplier, contracts, and stop stay yours.
 */
export function ChainPanel({ symbol, chain, loading, failed, enabled, onEnable, onRefresh, onUse }: { symbol: string; chain: ChainLoad | null; loading: boolean; failed: string | null; enabled: boolean; onEnable: () => void; onRefresh: () => void; onUse: (pick: ChainPick) => void }) {
  const [rootChoice, setRootChoice] = useState<string | null>(null);
  const [expiryChoice, setExpiryChoice] = useState<string | null>(null);
  if (!enabled) {
    return (
      <div className="fact">
        <p className="meta">The Cboe delayed chain is 1.5 to 13 MB and loads on request.</p>
        <Button type="button" variant="outline" size="sm" onClick={onEnable}>Load Cboe delayed chain for {symbol}</Button>
      </div>
    );
  }
  if (loading) return <p className="meta">Loading the Cboe delayed chain…</p>;
  if (failed || !chain || chain.state !== "ok" || !chain.underlying) return <p className="errors">{failed ?? chain?.error ?? "Chain unavailable."}</p>;
  const rootList = roots(chain.contracts);
  const root = rootChoice && rootList.includes(rootChoice) ? rootChoice : rootList[0];
  const expiryList = expirations(chain.contracts, root);
  const picked = pickExpiration(expiryList, chain.retrievedAt);
  const expiry = expiryChoice && expiryList.includes(expiryChoice) ? expiryChoice : picked.expiry;
  const price = chain.underlying.price;
  const rows = expiry ? nearMoney(chain.contracts, root, expiry, price, 6) : [];
  const stamp = chain.timestamp ? `Cboe stamp ${chain.timestamp} ET` : "Cboe stamp unknown";

  function use(contract: ChainContract) {
    onUse({
      root: contract.root,
      right: contract.right,
      strike: String(contract.strike),
      expiry: contract.expiry,
      bid: contract.bid === null ? "" : String(contract.bid),
      ask: contract.ask === null ? "" : String(contract.ask),
      sourceName: "Cboe delayed quotes",
      feedDelay: "15 min (Cboe label)",
      sourceTimestampLocal: chain!.timestamp ? chain!.timestamp.replace(" ", "T").slice(0, 16) : "",
    });
  }

  return (
    <div className="chain">
      <p className="result-line">
        {chain.underlying.symbol} {price === null ? "price unknown" : price.toFixed(2)} · bid {chain.underlying.bid ?? "—"} / ask {chain.underlying.ask ?? "—"} · IV30 {chain.underlying.iv30 ?? "—"} · {stamp} · retrieved {formatInstantEt(chain.retrievedAt)}
      </p>
      <p className="meta">{chain.notice}</p>
      <div className="filters">
        {rootList.length > 1 ? (
          <label>
            Root
            <select className="control" value={root} onChange={(e) => setRootChoice(e.target.value)}>
              {rootList.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Expiration
          <select className="control" value={expiry ?? ""} onChange={(e) => setExpiryChoice(e.target.value)}>
            {expiryList.map((e) => (
              <option key={e} value={e}>{e}{e === picked.expiry ? " · Academy pick" : ""}</option>
            ))}
          </select>
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>Refresh</Button>
      </div>
      <p className="meta">{picked.reason} {root === "SPXW" ? "SPXW is a separate root from SPX." : ""}</p>
      <table className="ledger chain-table">
        <thead>
          <tr>
            <th scope="col">Call bid/ask</th>
            <th scope="col">Spread</th>
            <th scope="col">Δ · IV · OI</th>
            <th scope="col">Strike</th>
            <th scope="col">Δ · IV · OI</th>
            <th scope="col">Spread</th>
            <th scope="col">Put bid/ask</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.strike} className={row.atm ? "atm" : undefined}>
              <Side contract={row.call} onUse={use} />
              <th scope="row" className="mono">{row.strike}</th>
              <Side contract={row.put} onUse={use} reverse />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">Spread is (ask − bid) ÷ midpoint. 10% or more is marked wide, the Academy cutoff. Greeks and IV are Cboe’s own figures. Open interest is the prior settlement count.</p>
    </div>
  );
}

function Side({ contract, onUse, reverse }: { contract: ChainContract | null; onUse: (c: ChainContract) => void; reverse?: boolean }) {
  if (!contract) {
    return reverse ? (
      <>
        <td>—</td><td>—</td><td>—</td>
      </>
    ) : (
      <>
        <td>—</td><td>—</td><td>—</td>
      </>
    );
  }
  const s = spreadRead(contract.bid, contract.ask);
  const quote = (
    <td>
      <button type="button" className="text-button mono" onClick={() => onUse(contract)} title="Copy this quote into the contract capture">
        {contract.bid ?? "—"} / {contract.ask ?? "—"}
      </button>
    </td>
  );
  const spread = <td className={s.wide === null ? "unknown-word" : s.wide ? "spread-wide" : "spread-ok"}>{s.spreadPct === null ? "Unknown" : `${s.spreadPct.toFixed(1)}%`}</td>;
  const greeks = (
    <td className="meta mono">
      {contract.delta === null ? "—" : contract.delta.toFixed(2)} · {contract.iv === null ? "—" : `${(contract.iv * 100).toFixed(0)}%`} · {contract.openInterest ?? "—"}
    </td>
  );
  return reverse ? (
    <>
      {greeks}{spread}{quote}
    </>
  ) : (
    <>
      {quote}{spread}{greeks}
    </>
  );
}
