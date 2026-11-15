import { isoToEasternLocal } from "@/domain/time";

export type MarketPhase = "pre" | "regular" | "after" | "closed";

/** Regular session 09:30–16:00 ET, Monday to Friday. Exchange holidays are not known here and count as a weekday. */
export function marketPhase(now: Date): MarketPhase {
  const local = isoToEasternLocal(now.toISOString());
  if (!local) return "closed";
  const [date, clock] = local.split("T");
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return "closed";
  if (clock < "04:00") return "closed";
  if (clock < "09:30") return "pre";
  if (clock < "16:00") return "regular";
  if (clock < "20:00") return "after";
  return "closed";
}

/** Live-mode refresh cadence per phase, in milliseconds. Off-hours still polls slowly so a restart picks up revisions. */
export function refreshIntervalMs(phase: MarketPhase): number {
  if (phase === "regular") return 60_000;
  if (phase === "pre" || phase === "after") return 180_000;
  return 600_000;
}

export const LIVE_NOTE =
  "Live mode re-reads the delayed bars every minute during the regular session, every 3 minutes pre- and post-market, and every 10 minutes when closed. The source is still delayed. A refresh is not a live quote.";
