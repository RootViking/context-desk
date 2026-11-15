# Context desk 2.0 — roadmap

Draft for discussion. Nothing here is built yet. Written 2026-11-14 after a survey of open-source
trading repos and a probe of public endpoints from this machine. It follows the hard rules in the
handoff: local-only, read-only, no order code, no fabricated data, no chart that replaces TC2000,
no undefined strategy rule turned into a number, keys only in `.env.local`, no unofficial
endpoint presented as a live feed.

The method the desk serves: Option Millionaire. Bollinger 50% · moving averages 25% · candles 15% ·
Worden 5% · volume 5%. "Noticia mata estrategia." 10% of the account per trade as premium invested.
Spread under 10%. Nearest expiration, or the next one after 10:30 ET. +10% on the contract.

## Baseline on 2026-11-14

`npm test` 52 passed in 13 files · `npm run typecheck` clean · `npm run lint` clean.
Local remote is `Sadiel0/context-desk`; the handoff names `RootViking/context-desk`. Confirm which is canonical.

## Survey: repos worth taking from

Checked with the GitHub API on 2026-11-14.

| Repo | Stars | License | Last push | Role here |
| --- | --- | --- | --- | --- |
| [tylerebowers/Schwabdev](https://github.com/tylerebowers/Schwabdev) | 902 | MIT | 2026-08-11 | Preferred Schwab client (handoff). Read-only use: quotes, 15m price history, option chains. Order functions never imported. |
| [alexgolec/schwab-py](https://github.com/alexgolec/schwab-py) | 484 | MIT | 2026-11-14 | Backup Schwab client. More active this autumn than Schwabdev. Has an OCC option-symbol helper. |
| [dgunning/edgartools](https://github.com/dgunning/edgartools) | 2,853 | MIT | 2026-11-15 | Richer SEC context: 8-K items, Form 4 insider trades, XBRL facts. Python. |
| [binwiederhier/ntfy](https://github.com/binwiederhier/ntfy) | 35,555 | Apache-2.0 | 2026-11-14 | Phone push for FOMC days, earnings dates, new filings. Self-hosted or ntfy.sh topic. |
| [kernc/backtesting.py](https://github.com/kernc/backtesting.py) | 9,240 | AGPL-3.0 | 2026-08-05 | Offline test of the 15m band exit once it is written as numbers. AGPL is fine for a private, unpublished tool. |
| [vollib/py_vollib](https://github.com/vollib/py_vollib) | 446 | MIT | 2026-05-29 | IV and Greeks once real quotes flow. |
| [Hitheshkaranth/OpenTerminalUI](https://github.com/Hitheshkaranth/OpenTerminalUI) | 395 | MIT | 2026-11-14 | Not a dependency. Its provenance labels (`live / delayed / cached / synthetic`) and command bar are worth copying as patterns. |

Skipped on purpose, as the handoff says: OpenBB (75k stars, Apache-2.0, heavy, still needs paid data for options), tradingview/lightweight-charts (TC2000 stays the chart), finBERT, feedparser.

## Survey: public endpoints that answered from this machine

All HTTP 200 on 2026-11-14 with no key. None is adopted by this document. Each needs a terms
decision from you first.

| Endpoint | Gives | Status |
| --- | --- | --- |
| `cdn-api.cboe.com/api/global/delayed_quotes/options/{SYM}.json` (`_SPX` for the index) | The whole chain: bid, ask, sizes, IV, delta/gamma/vega/theta/rho, open interest, volume, plus the underlying quote and `iv30`. Cboe labels it 15-minute delayed. 1.6–5.6 MB per stock or ETF, 13 MB for SPX. SPX, SPXW, and SPXO roots arrive separate. | **Candidate.** It is the JSON behind Cboe's own public delayed-quotes page, not a scrape of HTML. Cboe's data terms for automated reads were not read in this session. Decision needed. |
| `query1.finance.yahoo.com/v8/finance/chart/{SYM}?interval=15m&range=5d` | 15-minute OHLCV bars, `America/New_York` metadata. | **Excluded** by the handoff rule against unofficial Yahoo endpoints as a feed. Yahoo's options endpoint (`v7/finance/options`) returned 401 anyway. |
| `api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD` | Earnings rows per date with pre/after-market time and EPS consensus. Needs a browser-like user agent. | **Candidate, unverified terms.** Same class of question as Cboe. |
| `stooq.com/q/d/l/?s={sym}.us&i=d` | Daily OHLCV CSV. | Not needed while there is no chart. |

## Phases

### 0. Housekeeping (no data decision needed)
- Bind the dev server to `127.0.0.1` instead of `0.0.0.0`.
- Remove `netlify.toml` and the Netlify section of the README, since hosting is no longer the target.
- Add `.env.local` handling and a `src/server/secrets.ts` that reads keys server-side only.

### 1. Schwab read-only (top priority, blocked on API approval)
- Local Python helper (Schwabdev, backup schwab-py) on loopback, called by Next.js route handlers. Order modules are not imported, and a test asserts that.
- Quotes with the Schwab timestamp into the contract panel; 15m price history into `BarObservation` rows so relative volume and the SPY/QQQ/NVDA block fill themselves; option chains for the exact-contract check.
- Until approval lands, the manual paths stay and are labeled manual.

### 2. Quick wins that need no Schwab
- edgartools: 8-K earnings items and Form 4 insider trades as `sourced_fact` evidence on the Fed/earnings row and as filings context. Acceptance time stays separate from the business-event time.
- ntfy: push on the morning of an FOMC day, on an earnings date you entered, and on a new filing for a watchlist symbol. Alerts never say buy or sell.
- If you approve Cboe: a `/api/chain` reader with the same guards as the other readers (allowlisted host, 8 s timeout, size cap raised for SPX, no redirects), a chain table for the nearest expiration with spreads over 10% marked, and a "use this contract" button that fills root, right, strike, expiry, bid, ask, source, and delay. Debit, multiplier, contracts, and stop stay yours. Labeled "Cboe, 15-minute delayed", never live.

### 3. Rules as numbers, then backtest
- You write the 15m band-exit rule as numbers (closed vs intrabar, widening threshold, "nearby", stop). Until then nothing scores it.
- backtesting.py on licensed bars. TA-Lib once to confirm Bollinger and MA math against TC2000 on the same bars.

### 4. Trade journal
- Per trade: setup note, contract snapshot, planned entry and stop, actual manual fill, exit reason. Stored in the same workspace JSON, version bumped with a migration.

### 5. Later
- py_vollib for IV and Greeks when real quotes flow.
- Local Ollama headline summaries, labeled interpretation.
