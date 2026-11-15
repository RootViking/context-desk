"use client";

import {
  addChecklistEvidence,
  addEarnings,
  attachCaptureEvidence,
  attachFilingEvidence,
  attachHeadlineEvidence,
  attachMeetingEvidence,
  attachNewsEvidence,
  attachPressEvidence,
  removeEarnings,
  resetSession,
  reviseNews,
  importParticipationBars,
  removeParticipationBar,
  saveNews,
  saveParticipationBar,
  selectSymbol,
  setDemo,
  setFundamentals,
  setObservation,
  setOptionCapture,
  setReview,
  setSessionOverride,
  setSetupDirection,
  setSetupNote,
  setSpreadFormula,
} from "@/domain/actions";
import type { ChecklistItemId, Evidence, Observation, ReviewMark, SetupNote } from "@/domain/checklist";
import { CHECKLIST_ITEMS } from "@/domain/checklist";
import { nextFomcDate, nextSymbolEvent } from "@/domain/coverage";
import { coveragePending, coverageShort } from "@/domain/ticker-feed";
import { DEMO_BANNER, itemsForView } from "@/domain/demo";
import type { FedPressItem, FomcMeeting } from "@/domain/fed-parse";
import { ADVISORY_LIMITS, BOLLINGER_ADAPTATION, TC2000_BOUNDARY } from "@/domain/limits";
import type { NewsDraft } from "@/domain/news";
import { checklistFor, fundamentalsFor, optionFor } from "@/domain/state";
import { describeSession, formatInstantEt, isSessionDate } from "@/domain/time";
import { instrumentFor } from "@/domain/watchlist";
import { CalendarPanel } from "@/components/calendar-panel";
import { ChecklistRail } from "@/components/checklist-rail";
import { ContextFeed } from "@/components/context-feed";
import { FundamentalsPanel } from "@/components/fundamentals-panel";
import { OptionsPanel } from "@/components/options-panel";
import { ParticipationPanel } from "@/components/participation-panel";
import { SourcesPanel } from "@/components/sources-panel";
import { useFed } from "@/components/use-fed";
import { useTicker } from "@/components/use-ticker";
import { useWorkspace } from "@/components/use-workspace";
import { useXStatus } from "@/components/use-x";
import { WatchlistBar } from "@/components/watchlist-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { readDirection } from "@/domain/direction";
import { LIVE_NOTE } from "@/domain/session-clock";
import { useAlertSound } from "@/components/use-alert-sound";
import { useLive, type LiveState } from "@/components/use-live";
import { candlesToBarObservations, type Timeframe } from "@/domain/bars";
import { ChainPanel } from "@/components/chain-panel";
import { DirectionPanel } from "@/components/direction-panel";
import { PriceChart } from "@/components/price-chart";
import { fetchBars, useBars } from "@/components/use-bars";
import { useChain } from "@/components/use-chain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function Desk() {
  const workspace = useWorkspace();
  const fed = useFed();
  const x = useXStatus();
  const { state, ready, now, sessionDate } = workspace;
  const ticker = useTicker(state?.selectedSymbol ?? "TSLA");
  const bars = useBars(state?.selectedSymbol ?? "TSLA");
  const [chainOpen, setChainOpen] = useState(false);
  const chain = useChain(state?.selectedSymbol ?? "TSLA", chainOpen);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [loadingTape, setLoadingTape] = useState(false);
  const tapeLoader = useRef<((quiet: boolean) => Promise<void>) | null>(null);
  const tickCount = useRef(0);
  const liveSymbol = state?.selectedSymbol ?? "TSLA";
  const { live, setOn: setLiveOn, refreshNow } = useLive(() => {
    tickCount.current += 1;
    bars.refresh();
    if (live.phase === "regular" || live.phase === "pre") void tapeLoader.current?.(true);
    if (chainOpen && tickCount.current % 3 === 0) chain.refresh();
  }, liveSymbol);
  const sound = useAlertSound();
  const [alert, setAlert] = useState<{ symbol: string; trigger: "call" | "put"; at: string } | null>(null);
  const entryTrigger = readDirection(bars.candles).entry.trigger;
  const lastTrigger = useRef<{ symbol: string; trigger: "call" | "put" | null }>({ symbol: liveSymbol, trigger: null });
  useEffect(() => {
    const prev = lastTrigger.current;
    if (prev.symbol === liveSymbol && prev.trigger === null && entryTrigger !== null) {
      setAlert({ symbol: liveSymbol, trigger: entryTrigger, at: new Date().toISOString() });
      sound.play();
    }
    lastTrigger.current = { symbol: liveSymbol, trigger: entryTrigger };
  }, [entryTrigger, liveSymbol, sound]);

  if (!ready || !state || !now || !sessionDate) {
    return (
      <>
        <a className="skip" href="#checklist">Skip to checklist</a>
        <Mast sessionDate="" nowLabel="" onSession={() => undefined} onReset={null} />
        <p className="opening" role="status">Opening the workspace saved in this browser…</p>
      </>
    );
  }

  const symbol = state.selectedSymbol;
  const instrument = instrumentFor(symbol)!;
  const checklist = checklistFor(state, symbol, sessionDate);
  const capture = optionFor(state, symbol, sessionDate);
  const fundamentals = fundamentalsFor(state, symbol)!;
  const library = itemsForView(state.news, state.demo);
  const workspaceState = state;
  const clock = describeSession(now, sessionDate, state.sessionDateOverride !== null);
  const earnings = state.earnings.filter((event) => event.symbol === symbol);
  const symbolEvent = nextSymbolEvent(state.earnings, symbol, sessionDate);
  const fomc = nextFomcDate(fed.result?.calendar.data ?? [], sessionDate, fed.failed ?? fed.result?.calendar.error ?? (fed.result ? null : "Not retrieved yet."));

  function applyReview(itemId: ChecklistItemId, review: ReviewMark) {
    workspace.apply(setReview(workspaceState, { symbol, sessionDate: sessionDate!, itemId, review, at: new Date().toISOString() }), "Review saved. Observation was not changed.");
  }

  function applyObservation(itemId: ChecklistItemId, observation: Observation) {
    workspace.apply(
      setObservation(workspaceState, { symbol, sessionDate: sessionDate!, itemId, observation, at: new Date().toISOString() }),
      "Observation saved. It is not a permission to trade.",
    );
  }

  function applyEvidence(evidence: Omit<Evidence, "id" | "recordedAt">) {
    workspace.apply(
      addChecklistEvidence(workspaceState, {
        symbol,
        sessionDate: sessionDate!,
        evidence: { ...evidence, id: crypto.randomUUID(), recordedAt: new Date().toISOString() },
      }),
      "Evidence saved. Review and observation were not changed.",
    );
  }

  function applySetup(note: SetupNote) {
    workspace.apply(setSetupNote(workspaceState, { symbol, sessionDate: sessionDate!, note }));
  }

  function commitNews(draft: NewsDraft, mode: "primary" | "duplicate" | "correction" | "revise") {
    if (mode === "revise") return workspace.apply(reviseNews(workspaceState, draft.id, draft), "Revision saved.");
    return workspace.apply(saveNews(workspaceState, draft, mode), "Item saved in the library.");
  }

  function attachPress(item: FedPressItem) {
    if (!fed.result) return;
    workspace.apply(
      attachPressEvidence(workspaceState, {
        symbol,
        sessionDate: sessionDate!,
        item,
        evidenceId: crypto.randomUUID(),
        at: new Date().toISOString(),
        retrievedAt: fed.result.retrievedAt,
      }),
      "Federal Reserve title attached as macro evidence. Review and observation were not changed.",
    );
  }

  function attachMeeting(meeting: FomcMeeting) {
    if (!fed.result) return;
    workspace.apply(
      attachMeetingEvidence(workspaceState, {
        symbol,
        sessionDate: sessionDate!,
        meeting,
        evidenceId: crypto.randomUUID(),
        at: new Date().toISOString(),
        retrievedAt: fed.result.retrievedAt,
        lastUpdate: fed.result.calendar.lastUpdate,
      }),
      "Meeting attached as macro evidence. Review and observation were not changed.",
    );
  }

  async function loadTapeBars(quiet = false) {
    const members = [...new Set(["SPY", "QQQ", "NVDA", symbol])];
    if (loadingTape) return;
    setLoadingTape(true);
    try {
      const loads = await Promise.allSettled(members.map((member) => fetchBars(member, "15m")));
      const now = new Date();
      const rows = loads.flatMap((load, index) =>
        load.status === "fulfilled" && load.value.state === "ok"
          ? candlesToBarObservations(load.value.candles, members[index], {
              now,
              retrievedAt: load.value.retrievedAt,
              sourceLabel: "Yahoo chart (unofficial, delayed)",
              delayNote: "Delayed aggregator bars. Not a live feed.",
            })
          : [],
      );
      const errors = loads.flatMap((load, index) =>
        load.status === "rejected" ? [`${members[index]}: ${load.reason instanceof Error ? load.reason.message : "failed"}`] : load.value.state === "error" ? [`${members[index]}: ${load.value.error}`] : [],
      );
      if (rows.length === 0) {
        if (!quiet) workspace.setNotice(errors.join(" ") || "No bars came back.");
      } else if (quiet) workspace.apply(importParticipationBars(workspaceState, { bars: rows }), workspace.notice ?? undefined);
      else workspace.apply(importParticipationBars(workspaceState, { bars: rows }), `${rows.length} delayed 15-minute bars loaded for ${members.join(", ")}. Typed bars with the same window were replaced.${errors.length ? ` ${errors.join(" ")}` : ""}`);
    } finally {
      setLoadingTape(false);
    }
  }

  tapeLoader.current = loadTapeBars;

  return (
    <>
      <a className="skip" href="#feed">Skip to headlines</a>
      <a className="skip" href="#participation">Skip to tape</a>
      <a className="skip" href="#checklist">Skip to checklist</a>
      <Mast
        sessionDate={sessionDate}
        nowLabel={clock.nowLabel}
        onSession={(value) => {
          if (value === "") workspace.apply(setSessionOverride(state, null), "Using today’s Eastern date.");
          else if (isSessionDate(value)) workspace.apply(setSessionOverride(state, value));
          else workspace.setNotice("That session date is not a real calendar date.");
        }}
        onReset={() =>
          workspace.apply(
            resetSession(state, symbol, sessionDate),
            "Session reset. News, fundamentals, and typed bars stayed. Setup direction for this session was cleared.",
          )
        }
        help={<HelpCopy />}
        live={live}
        liveRetrievedAt={bars.retrievedAt}
        onLiveToggle={() => setLiveOn(!live.on)}
        onRefreshNow={refreshNow}
        soundOn={sound.enabled}
        onSoundToggle={sound.toggle}
        contract={
          <OptionsPanel
            symbol={symbol}
            chain={
              <ChainPanel
                symbol={symbol}
                chain={chain.result}
                loading={chain.loading}
                failed={chain.failed}
                enabled={chainOpen}
                onEnable={() => setChainOpen(true)}
                onRefresh={chain.refresh}
                onUse={(pick) =>
                  workspace.apply(
                    setOptionCapture(state, symbol, sessionDate, { ...capture, ...pick }, new Date().toISOString()),
                    "Cboe delayed quote copied into the capture. Debit, multiplier, contracts, and stop are still yours. Not an order.",
                  )
                }
              />
            }
            capture={capture}
            formula={state.spreadFormula}
            onCapture={(next) => workspace.apply(setOptionCapture(state, symbol, sessionDate, next, new Date().toISOString()))}
            onFormula={(formula) => workspace.apply(setSpreadFormula(state, formula), "Spread formula saved.")}
            onAttach={() =>
              workspace.apply(
                attachCaptureEvidence(state, { symbol, sessionDate, evidenceId: crypto.randomUUID(), at: new Date().toISOString() }),
                "Contract snapshot attached. Review and observation were not changed.",
              )
            }
          />
        }
        sources={
          <>
            <SourcesPanel instrument={instrument} demo={state.demo} onDemo={(demo) => workspace.apply(setDemo(state, demo))} />
            <CalendarPanel
              symbol={symbol}
              sessionDate={sessionDate}
              result={fed.result}
              loading={fed.loading}
              failed={fed.failed}
              onRefresh={fed.refresh}
              earnings={earnings}
              onAttach={attachMeeting}
              onAddEarnings={(event) =>
                workspace.apply(addEarnings(state, { ...event, id: crypto.randomUUID(), recordedAt: new Date().toISOString() }), "Earnings note saved.")
              }
              onRemoveEarnings={(id) => workspace.apply(removeEarnings(state, id), "Earnings note removed.")}
            />
            <FundamentalsPanel key={symbol} symbol={symbol} value={fundamentals} onChange={(next) => workspace.apply(setFundamentals(state, symbol, next))} />
          </>
        }
      />
      {alert ? (
        <div className="entry-banner" role="alert">
          <div className="band">
            <p>
              <strong>{alert.symbol} · your 15-minute entry conditions are present for a {alert.trigger.toUpperCase()}</strong> · {formatInstantEt(alert.at)}. Delayed bars. Confirm the bands, averages, and candle in TC2000. Noticia mata estrategia: check Fed and earnings first. This is not an order.
            </p>
            <Button type="button" variant="outline" onClick={() => setAlert(null)}>Dismiss</Button>
          </div>
        </div>
      ) : null}
      {state.demo ? (
        <div className="demo-banner" role="status">
          <p>{DEMO_BANNER}</p>
        </div>
      ) : null}
      {workspace.storageMessage ? (
        <div className="storage-banner">
          <div className="band">
            <p>{workspace.storageMessage}</p>
            <Button type="button" variant="clay" onClick={workspace.replaceStorage}>Replace it with an empty workspace</Button>
            <Button type="button" variant="outline" onClick={workspace.keepWithoutSaving}>Continue without saving</Button>
          </div>
        </div>
      ) : null}
      <div className="band">
        <WatchlistBar selected={symbol} onSelect={(next) => workspace.apply(selectSymbol(state, next))} />
        <div className="symbol-strip">
          <div>
            <h2 className="mono">{symbol}</h2>
            <p className="meta">{instrument.name} · {instrument.kind}{instrument.occasional ? " · occasional" : ""}</p>
          </div>
          <p className="meta symbol-facts">
            {clock.sessionLabel}
            {clock.weekend ? " · Weekend" : ""}
            {clock.matchesEasternToday ? " · today ET" : " · manual date"}
            {" · "}
            {ticker.result
              ? coverageShort(ticker.result)
              : coveragePending(ticker.failed ?? (ticker.loading ? "retrieving public feeds." : "Unknown."))}
            {" · "}
            {symbolEvent.state === "unknown" ? "Next event Unknown" : `Next event ${symbolEvent.date}`}
            {" · "}
            {fomc.state === "unknown" ? "FOMC Unknown" : `FOMC ${fomc.label}`}
            {" · macro, not this tape"}
          </p>
          {instrument.identity ? (
            <details>
              <summary>Listing</summary>
              <p className="meta">{instrument.identity}</p>
            </details>
          ) : null}
        </div>
        <p className="notice" role="status">{workspace.notice ?? ""}</p>
      </div>
      <div className="desk">
        <section className="panel chart-panel" aria-labelledby="chart-title">
          <h2 id="chart-title" className="sr-only">Delayed chart</h2>
          <PriceChart symbol={symbol} candlesByTf={bars.candles} timeframe={timeframe} onTimeframe={setTimeframe} />
        </section>
        <DirectionPanel symbol={symbol} candlesByTf={bars.candles} loading={bars.loading} failed={bars.failed} retrievedAt={bars.retrievedAt} onRefresh={bars.refresh} />
        <ParticipationPanel
          loadingBars={loadingTape}
          onLoadBars={loadTapeBars}
          symbol={symbol}
          sessionDate={sessionDate}
          book={state.participation}
          onDirection={(direction) => workspace.apply(setSetupDirection(state, symbol, sessionDate, direction))}
          onSave={(draft) => workspace.apply(saveParticipationBar(state, draft), "Bar saved. It is not an entry.")}
          onRemove={(id) => workspace.apply(removeParticipationBar(state, id), "Bar removed.")}
          onImport={(raw) => workspace.apply(importParticipationBars(state, raw), "Bars imported. Invalid rows were skipped when named in the notice.")}
        />
        <ChecklistRail
          checklist={checklist}
          now={now}
          onReview={applyReview}
          onObservation={applyObservation}
          onEvidence={applyEvidence}
          onSetup={applySetup}
          setupError={workspace.notice && /not guessed|leave the field blank/.test(workspace.notice) ? workspace.notice : null}
        />
        <ContextFeed
          symbol={symbol}
          items={library}
          demo={state.demo}
          now={now}
          fed={fed.result}
          ticker={ticker.result}
          tickerFailed={ticker.failed}
          tickerLoading={ticker.loading}
          x={x}
          onCommit={commitNews}
          onAttach={(item) =>
            workspace.apply(
              attachNewsEvidence(state, { symbol, sessionDate, itemId: item.id, evidenceId: crypto.randomUUID(), at: new Date().toISOString() }),
              "Headline attached. Review and observation were not changed.",
            )
          }
          onAttachPress={attachPress}
          onAttachHeadline={(item) => {
            if (!ticker.result) return;
            workspace.apply(
              attachHeadlineEvidence(state, {
                symbol,
                sessionDate,
                item,
                querySymbol: ticker.result.yahoo.querySymbol,
                evidenceId: crypto.randomUUID(),
                at: new Date().toISOString(),
                retrievedAt: ticker.result.retrievedAt,
              }),
              "Aggregator headline attached. Review and observation were not changed. This is not a permission to trade.",
            );
          }}
          onAttachFiling={(filing) => {
            if (!ticker.result) return;
            workspace.apply(
              attachFilingEvidence(state, {
                symbol,
                sessionDate,
                filing,
                sec: ticker.result.sec,
                evidenceId: crypto.randomUUID(),
                at: new Date().toISOString(),
                retrievedAt: ticker.result.retrievedAt,
              }),
              "SEC filing attached. Review and observation were not changed. This is not a permission to trade.",
            );
          }}
        />
      </div>
    </>
  );
}

function Mast({
  sessionDate,
  nowLabel,
  onSession,
  onReset,
  help,
  sources,
  contract,
  live,
  liveRetrievedAt,
  onLiveToggle,
  onRefreshNow,
  soundOn,
  onSoundToggle,
}: {
  sessionDate: string;
  nowLabel: string;
  onSession: (value: string) => void;
  onReset: (() => void) | null;
  help?: ReactNode;
  sources?: ReactNode;
  contract?: ReactNode;
  live?: LiveState;
  liveRetrievedAt?: string | null;
  onLiveToggle?: () => void;
  onRefreshNow?: () => void;
  soundOn?: boolean;
  onSoundToggle?: () => void;
}) {
  return (
    <header className="mast">
      <div className="mast-inner">
        <div className="mast-top">
          <div>
            <p className="eyebrow">Unpublished local draft</p>
            <h1>Context desk</h1>
            {nowLabel ? <p className="now-line">Eastern now {nowLabel}</p> : null}
            {live ? (
              <p className="live-line mono" title={LIVE_NOTE}>
                <span className={live.on ? `live-dot live-${live.phase}` : "live-dot live-paused"} aria-hidden="true">●</span>{" "}
                {live.on ? `Live · ${live.phase} · every ${Math.round(live.intervalMs / 1000)}s · next in ${live.nextInSeconds}s` : "Paused"}
                {liveRetrievedAt ? ` · bars read ${formatInstantEt(liveRetrievedAt)}` : ""}
                {" · delayed source"}
              </p>
            ) : null}
          </div>
          {sessionDate ? (
            <div className="session-controls">
              <label>
                Session date
                <Input type="date" value={sessionDate} onChange={(event) => onSession(event.target.value)} />
              </label>
              <Button type="button" variant="outline" onClick={() => onSession("")}>Today (ET)</Button>
              {onReset ? <ResetControl sessionDate={sessionDate} onReset={onReset} /> : null}
              {live && onLiveToggle ? (
                <Button type="button" variant={live.on ? "default" : "outline"} onClick={onLiveToggle} aria-pressed={live.on}>
                  {live.on ? "Live on" : "Live off"}
                </Button>
              ) : null}
              {live && onRefreshNow ? <Button type="button" variant="outline" onClick={onRefreshNow}>Refresh now</Button> : null}
              {onSoundToggle ? (
                <Button type="button" variant={soundOn ? "default" : "outline"} onClick={onSoundToggle} aria-pressed={!!soundOn}>
                  {soundOn ? "Sound on" : "Sound off"}
                </Button>
              ) : null}
              {help ? <Drawer label="Help" title="How the marks work">{help}</Drawer> : null}
              {sources ? <Drawer label="Sources" title="Sources, calendar, and company notes" wide>{sources}</Drawer> : null}
              {contract ? <Drawer label="Contract" title="Exact contract, after the look" wide>{contract}</Drawer> : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Drawer({ label, title, wide, children }: { label: string; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">{label}</Button>
      </DialogTrigger>
      <DialogContent className={wide ? "dialog-wide" : undefined}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        <div className="drawer-body">{children}</div>
        <DialogClose asChild>
          <Button type="button" variant="outline">Close</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function HelpCopy() {
  return (
    <>
      <p>
        Reviewed means you looked. Observed means you saw the condition. Neither one is a permission to trade, and there is no combined score.
      </p>
      <p>{TC2000_BOUNDARY}</p>
      <p>{BOLLINGER_ADAPTATION}</p>
      <p>The six Spanish names are the same six requirements. This draft’s source list was written in English.</p>
      <ul>
        {CHECKLIST_ITEMS.map((item) => (
          <li key={item.id}>
            <span lang="es">{item.titleEs}</span> / {item.titleEn}. {item.detail}
          </li>
        ))}
      </ul>
      <ul>
        {ADVISORY_LIMITS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>A successful fetch is not a fresh item. Publication age and the last retrieval are separate. A date-only Fed row is not a statement clock time. Missing ticker coverage stays Unknown.</p>
      <p>
        Arrow keys move the watchlist when you are not typing in a field. Keys 1 through 9 jump the full list in order. The contract calculator stays in Contract and is not required before the headlines or the tape.
      </p>
      <p>
        Block compares SPY, QQQ, and NVDA with the symbol you selected, on one completed 15-minute window and from the 09:30 open. Same, opposite, and mixed are signs only. That comparison was requested. The Academy notes do not define which names share a block or who leads. Index weights, correlation, breadth, and lead/lag are not calculated. NVDA is both a watchlist name and a block member. Bars are typed, imported, or loaded from the delayed bars reader.
      </p>
      <p>Orders stay on the Thinkorswim phone. Nothing here is an entry.</p>
    </>
  );
}

function ResetControl({ sessionDate, onReset }: { sessionDate: string; onReset: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="clay">Reset</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Reset this session?</DialogTitle>
        <DialogDescription id="reset-desc">
          Clears review, observation, evidence, the setup note, and the option capture for this symbol on {sessionDate}. The news library, fundamentals, and earnings notes stay. A later date does not inherit these marks.
        </DialogDescription>
        <div className="inline-actions">
          <DialogClose asChild>
            <Button type="button" variant="clay" onClick={onReset}>Reset session</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
